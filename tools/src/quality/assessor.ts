import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parallelMap, sleep } from "../utils/async.js";
import {
    OpenRouterError,
    createChatCompletion,
    type ChatCompletion,
    type ChatMessage,
    type ReasoningMode,
    type TokenUsage,
} from "./openrouter.js";

export const PROMPT_VERSION = 1;
export const DEFAULT_MODEL = "openai/gpt-4o-mini";
export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_MAX_RETRIES = 3;

export type PartOfSpeech =
    | "noun"
    | "verb"
    | "adjective"
    | "adverb"
    | "other"
    | null;

export interface WordQuality {
    word: string;
    /** 0 = kein deutsches Wort / Müll, 100 = einwandfreies deutsches Wort. */
    score: number;
    german: boolean;
    properNoun: boolean;
    abbreviation: boolean;
    junk: boolean;
    pos: PartOfSpeech;
    confidence: number;
    reason: string;
}

export interface QualityStats {
    total: number;
    averageScore: number;
    bands: {
        excellent: number;
        good: number;
        questionable: number;
        junk: number;
    };
    properNouns: number;
    abbreviations: number;
    junk: number;
    lowConfidence: number;
}

export interface AssessOptions {
    words: string[];
    apiKey: string;
    model?: string;
    baseUrl?: string;
    batchSize?: number;
    concurrency?: number;
    maxRetries?: number;
    /** Maximale Ausgabe-Tokens pro Anfrage. */
    maxTokens?: number;
    /** Kompaktes Antwortschema (deutlich weniger Ausgabe-Tokens). */
    compact?: boolean;
    /** Reasoning-Modelle steuern (Standard: automatisch). */
    reasoning?: ReasoningMode;
    /** Zu große Antworten automatisch in kleinere Batches teilen. */
    splitOnOverflow?: boolean;
    /** Kleinste Batch-Größe beim Aufteilen. */
    minBatchSize?: number;
    onBatch?: (
        batch: WordQuality[],
        progress: { processed: number; total: number },
    ) => void | Promise<void>;
}

export interface AssessSummary {
    results: WordQuality[];
    failedBatches: number;
    failedWords: number;
    requests: number;
    usage: TokenUsage;
}

const SYSTEM_PROMPT = `Du bist ein deutscher Lexikograf und prüfst Wörter für eine allgemeine deutsche Wortliste.

Bewerte jedes Wort nach diesen Kriterien:
- score: 0 bis 100.
  100 = korrektes, gebräuchliches deutsches Wort.
  80 = gültiges deutsches Wort, aber selten, fachlich, stark gebeugt oder veraltet.
  50 = fragwürdig: Eigenname, Abkürzung, fremdsprachiges Wort oder Sonderfall.
  0 = kein deutsches Wort: Tippfehler, OCR-/HTML-Artefakt, Zeichensalat.
- german: true, wenn es ein deutsches Wort (auch Flexionsform) ist.
- properNoun: true bei Eigennamen (Personen, Orte, Marken).
- abbreviation: true bei Abkürzungen.
- junk: true bei Artefakten, Tippfehlern oder Nicht-Wörtern.
- pos: "noun", "verb", "adjective", "adverb", "other" oder null.
- confidence: 0 bis 1, wie sicher du dir bist.
- reason: kurze Begründung (maximal 12 Wörter).

Antworte ausschließlich mit einem JSON-Array in derselben Reihenfolge und
Anzahl wie die Eingabe. Keine Erklärungen, kein Markdown. Beispiel:
[{"word":"Haus","score":100,"german":true,"properNoun":false,"abbreviation":false,"junk":false,"pos":"noun","confidence":0.99,"reason":"Gebräuchliches deutsches Substantiv"}]`;

/**
 * Kompaktes Schema: pro Wort ein Array statt eines Objekts. Spart rund 80 %
 * der Ausgabe-Tokens und erlaubt dadurch große Batches (500–1000 Wörter).
 * Reihenfolge: word, score, german, properNoun, abbreviation, junk, confidence
 */
const COMPACT_SYSTEM_PROMPT = `Du bist ein deutscher Lexikograf und prüfst Wörter für eine allgemeine deutsche Wortliste.

Bewerte jedes Wort auf einer Skala von 0 bis 100:
  100 = korrektes, gebräuchliches deutsches Wort
   80 = gültig, aber selten, fachlich, stark gebeugt oder veraltet
   50 = fragwürdig: Eigenname, Abkürzung, fremdsprachig oder Sonderfall
    0 = kein deutsches Wort: Tippfehler, OCR-/HTML-Artefakt, Zeichensalat

Antworte ausschließlich mit einem JSON-Array, ein Eintrag pro Eingabewort,
in derselben Reihenfolge. Jeder Eintrag ist ein Array aus genau 7 Elementen:
[word, score, german, properNoun, abbreviation, junk, confidence]

Dabei sind german/properNoun/abbreviation/junk 1 oder 0, confidence ist eine
Zahl von 0 bis 1. Keine Erklärungen, kein Markdown. Beispiel:
[["Haus",100,1,0,0,0,0.99],["Xyzq",0,0,0,0,1,0.9]]`;

const POS_VALUES: ReadonlySet<string> = new Set([
    "noun",
    "verb",
    "adjective",
    "adverb",
    "other",
]);

/**
 * Gemessene Durchschnittswerte für die Ausgabe-Token-Schätzung.
 * Kompakt: rund 21 Tokens pro deutschem Wort (Wort plus Flag-Array),
 * ausführlich: rund 45 inklusive Begründung und Wortart.
 */
const OUTPUT_TOKENS_DETAILED = 45;
const OUTPUT_TOKENS_COMPACT = 22;
/** Zusätzliches Budget pro Wort, wenn das Modell denkt (Reasoning). */
const OUTPUT_TOKENS_REASONING = 50;

export function buildMessages(
    words: string[],
    compact = false,
): ChatMessage[] {
    return [
        {
            role: "system",
            content: compact ? COMPACT_SYSTEM_PROMPT : SYSTEM_PROMPT,
        },
        {
            role: "user",
            content: `Bewerte diese ${words.length} Wörter:\n${JSON.stringify(words)}`,
        },
    ];
}

/**
 * Parst die LLM-Antwort tolerant (Markdown-Fences, Vor-/Nachtext) und
 * behält nur Bewertungen für Wörter aus dem aktuellen Batch.
 * Unterstützt das ausführliche Objekt-Schema und das kompakte Array-Schema.
 */
export function parseQualityResponse(
    content: string,
    expectedWords: string[],
): WordQuality[] {
    const entries = normalizeEntries(extractJsonPayload(content));

    if (!entries) {
        throw new Error("Antwort enthält kein JSON-Array mit Bewertungen.");
    }

    const expected = new Set(expectedWords);
    const byWord = new Map<string, WordQuality>();

    for (const entry of entries) {
        const quality = Array.isArray(entry)
            ? coerceCompactQuality(entry)
            : entry && typeof entry === "object"
              ? coerceQuality(entry as Record<string, unknown>)
              : null;

        if (!quality || !expected.has(quality.word)) continue;
        if (byWord.has(quality.word)) continue;

        byWord.set(quality.word, quality);
    }

    // Reihenfolge der Eingabe beibehalten.
    return expectedWords
        .filter((word) => byWord.has(word))
        .map((word) => byWord.get(word)!);
}

function coerceCompactQuality(values: unknown[]): WordQuality | null {
    if (values.length < 2) return null;

    return coerceQuality({
        word: values[0],
        score: values[1],
        german: values[2],
        properNoun: values[3],
        abbreviation: values[4],
        junk: values[5],
        confidence: values[6],
        pos: null,
        reason: "",
    });
}

export function summarizeQuality(results: WordQuality[]): QualityStats {
    const total = results.length;
    const sum = results.reduce((acc, result) => acc + result.score, 0);

    return {
        total,
        averageScore:
            total === 0 ? 0 : Math.round((sum / total) * 10) / 10,
        bands: {
            excellent: results.filter((r) => r.score >= 90).length,
            good: results.filter((r) => r.score >= 70 && r.score < 90).length,
            questionable: results.filter((r) => r.score >= 50 && r.score < 70)
                .length,
            junk: results.filter((r) => r.score < 50).length,
        },
        properNouns: results.filter((r) => r.properNoun).length,
        abbreviations: results.filter((r) => r.abbreviation).length,
        junk: results.filter((r) => r.junk).length,
        lowConfidence: results.filter((r) => r.confidence < 0.6).length,
    };
}

/** Auswahlkriterien für eine bereinigte Wortliste. */
export interface QualityFilter {
    minScore: number;
    excludeProperNouns?: boolean;
    excludeAbbreviations?: boolean;
}

/**
 * Wörter, die die Qualitätskriterien erfüllen — Basis für --clean-output
 * und --apply. Die Reihenfolge der Eingabeliste bleibt erhalten.
 */
export function selectQualityWords(
    results: WordQuality[],
    filter: QualityFilter,
): string[] {
    return results
        .filter((quality) => quality.score >= filter.minScore && !quality.junk)
        .filter((quality) => !filter.excludeProperNouns || !quality.properNoun)
        .filter(
            (quality) =>
                !filter.excludeAbbreviations || !quality.abbreviation,
        )
        .map((quality) => quality.word);
}

/**
 * Bewertet Wörter in Batches. Fehlgeschlagene Batches werden geloggt und
 * übersprungen; bereits erfolgreiche Ergebnisse bleiben erhalten.
 */
export async function assessWords(
    options: AssessOptions,
): Promise<AssessSummary> {
    const words = [...new Set(options.words.filter((word) => word.length > 0))];
    const model = options.model ?? DEFAULT_MODEL;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    const batches: string[][] = [];
    for (let i = 0; i < words.length; i += batchSize) {
        batches.push(words.slice(i, i + batchSize));
    }

    const usage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
    };
    let processed = 0;
    let failedBatches = 0;
    let failedWords = 0;
    let requests = 0;

    const results = await parallelMap(
        batches,
        Math.max(1, concurrency),
        async (batch) => {
            try {
                const completion = await assessBatchWithSplit(
                    batch,
                    {
                        apiKey: options.apiKey,
                        model,
                        baseUrl: options.baseUrl,
                        maxRetries,
                        maxTokens: options.maxTokens,
                        compact: options.compact === true,
                        reasoning: options.reasoning,
                        splitOnOverflow: options.splitOnOverflow !== false,
                        minBatchSize: Math.max(1, options.minBatchSize ?? 1),
                    },
                    () => {
                        requests++;
                    },
                );
                addUsage(usage, completion.usage);

                processed += batch.length;
                await options.onBatch?.(completion.results, {
                    processed,
                    total: words.length,
                });

                return completion.results;
            } catch (error) {
                failedBatches++;
                failedWords += batch.length;
                const message =
                    error instanceof Error ? error.message : String(error);
                console.warn(
                    `[quality] Batch mit ${batch.length} Wörtern fehlgeschlagen: ${message}`,
                );
                return [];
            }
        },
    );

    return {
        results: results.flat(),
        failedBatches,
        failedWords,
        requests,
        usage,
    };
}

interface BatchConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
    maxRetries: number;
    maxTokens?: number;
    compact: boolean;
    reasoning?: ReasoningMode;
    splitOnOverflow: boolean;
    minBatchSize: number;
}

/**
 * Bewertet einen Batch und teilt ihn bei abgeschnittenen Antworten
 * rekursiv, bis alle Wörter bewertet sind oder die Mindestgröße erreicht ist.
 */
async function assessBatchWithSplit(
    words: string[],
    config: BatchConfig,
    onRequest: () => void,
): Promise<{ results: WordQuality[]; usage: TokenUsage | null }> {
    const { results, usage, overflow } = await assessBatch(
        words,
        config,
        onRequest,
    );

    const missing = words.filter(
        (word) => !results.some((result) => result.word === word),
    );

    if (missing.length === 0) return { results, usage };

    const canSplit =
        config.splitOnOverflow &&
        missing.length > config.minBatchSize &&
        (overflow || missing.length > 0);

    if (!canSplit) {
        if (overflow) {
            console.warn(
                `[quality] Antwort für ${words.length} Wörter war unvollständig; ${missing.length} Wörter bleiben offen. Bitte --max-tokens erhöhen, --batch-size senken oder --compact verwenden.`,
            );
        }
        return { results, usage };
    }

    // Abgeschnittene Batches sind meist zu groß: gezielt halbieren.
    const mid = Math.ceil(missing.length / 2);
    const parts = [missing.slice(0, mid), missing.slice(mid)];
    const childUsage: TokenUsage = {
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        reasoningTokens: usage?.reasoningTokens ?? 0,
    };

    const combined: WordQuality[] = [...results];
    for (const part of parts) {
        const child = await assessBatchWithSplit(part, config, onRequest);
        combined.push(...child.results);
        addUsage(childUsage, child.usage);
    }

    return { results: combined, usage: childUsage };
}

/** Wie oft eine unbrauchbare Antwort wiederholt wird, bevor der Batch geteilt wird. */
const MAX_FORMAT_ATTEMPTS = 2;

async function assessBatch(
    words: string[],
    config: BatchConfig,
    onRequest: () => void,
): Promise<{
    results: WordQuality[];
    usage: TokenUsage | null;
    overflow: boolean;
}> {
    let attempt = 0;
    let formatFailures = 0;

    while (true) {
        attempt++;
        onRequest();

        let completion: ChatCompletion;
        try {
            completion = await createChatCompletion(
                buildMessages(words, config.compact),
                {
                    apiKey: config.apiKey,
                    model: config.model,
                    baseUrl: config.baseUrl,
                    reasoning: config.reasoning,
                },
                config.maxTokens ??
                    maxTokensFor(
                        words.length,
                        config.compact,
                        config.reasoning,
                    ),
            );
        } catch (error) {
            // Nur Transport- und HTTP-Fehler werden erneut versucht.
            if (attempt >= config.maxRetries || !isRetryable(error)) {
                throw error;
            }
            const message =
                error instanceof Error ? error.message : String(error);
            await waitBeforeRetry(error, attempt, message);
            continue;
        }

        const truncated = completion.finishReason === "length";
        const results = parseQualityResponseOrEmpty(completion.content, words);

        if (results.length === 0) {
            // Unbrauchbare Antwort: einmal wiederholen, danach den Batch
            // halbieren — dieselbe Anfrage liefert sonst dasselbe Ergebnis.
            formatFailures++;
            if (
                truncated ||
                formatFailures >= MAX_FORMAT_ATTEMPTS ||
                attempt >= config.maxRetries
            ) {
                return { results, usage: completion.usage, overflow: true };
            }
            await waitBeforeRetry(
                null,
                formatFailures,
                "Antwort ohne gültige Bewertungen",
            );
            continue;
        }

        const overflow = truncated || results.length < words.length;

        if (results.length < words.length && !truncated) {
            console.warn(
                `[quality] ${words.length - results.length} von ${words.length} Wörtern fehlen in der Antwort und bleiben für den nächsten Lauf offen.`,
            );
        }

        return { results, usage: completion.usage, overflow };
    }
}

function isRetryable(error: unknown): boolean {
    return !(error instanceof OpenRouterError) || error.retryable;
}

async function waitBeforeRetry(
    error: unknown,
    attempt: number,
    message: string,
): Promise<void> {
    const delay =
        error instanceof OpenRouterError && error.retryAfterMs !== null
            ? error.retryAfterMs
            : Math.min(30_000, 1000 * 2 ** (attempt - 1));
    console.warn(
        `[quality] Versuch ${attempt} fehlgeschlagen (${message}); warte ${Math.round(delay / 1000)}s ...`,
    );
    await sleep(delay);
}

function parseQualityResponseOrEmpty(
    content: string,
    words: string[],
): WordQuality[] {
    try {
        return parseQualityResponse(content, words);
    } catch {
        return [];
    }
}

/**
 * Standard-Ausgabebudget: aus den gemessenen Kosten pro Eintrag geschätzt,
 * aber ohne künstliche Obergrenze, damit große Batches möglich sind.
 * Reasoning-Modelle brauchen zusätzliches Budget, sonst bleibt der Inhalt leer.
 */
function maxTokensFor(
    wordCount: number,
    compact: boolean,
    reasoning: ReasoningMode | undefined,
): number {
    const perWord = compact ? OUTPUT_TOKENS_COMPACT : OUTPUT_TOKENS_DETAILED;
    const reasoningPerWord =
        reasoning === "off" ? 0 : OUTPUT_TOKENS_REASONING;
    return Math.max(1024, wordCount * (perWord + reasoningPerWord) + 512);
}

function addUsage(target: TokenUsage, usage: TokenUsage | null): void {
    if (!usage) return;
    target.promptTokens += usage.promptTokens;
    target.completionTokens += usage.completionTokens;
    target.totalTokens += usage.totalTokens;
    target.reasoningTokens += usage.reasoningTokens;
}

function extractJsonPayload(content: string): unknown {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = (fenced ? fenced[1] : content).trim();

    try {
        return JSON.parse(text);
    } catch {
        // Weiter mit toleranter Extraktion.
    }

    for (const [startChar, endChar] of [
        ["[", "]"],
        ["{", "}"],
    ] as const) {
        const start = text.indexOf(startChar);
        const end = text.lastIndexOf(endChar);
        if (start < 0 || end <= start) continue;

        try {
            return JSON.parse(text.slice(start, end + 1));
        } catch {
            // Nächsten Versuch probieren.
        }
    }

    // Abgeschnittene Antworten: alle vollständigen Einträge retten.
    const salvaged = salvageEntries(text);
    if (salvaged) return salvaged;

    throw new Error("Antwort enthält kein gültiges JSON.");
}

/**
 * Zerlegt ein (evtl. abgeschnittenes) JSON-Array in seine Top-Level-Elemente
 * und parst die vollständigen. So gehen bei `finish_reason: "length"` die
 * bereits bewerteten Wörter nicht verloren.
 */
function salvageEntries(text: string): unknown[] | null {
    const start = text.indexOf("[");
    if (start < 0) return null;

    const items: string[] = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let current = "";

    for (let i = start + 1; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            current += char;
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inString = false;
            continue;
        }

        if (char === '"') {
            inString = true;
            current += char;
            continue;
        }
        if (char === "[" || char === "{") {
            depth++;
            current += char;
            continue;
        }
        if (char === "]" || char === "}") {
            if (depth === 0) break; // Ende des äußeren Arrays
            depth--;
            current += char;
            continue;
        }
        if (char === "," && depth === 0) {
            items.push(current);
            current = "";
            continue;
        }
        current += char;
    }
    items.push(current);

    const parsed: unknown[] = [];
    for (const item of items) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        try {
            parsed.push(JSON.parse(trimmed));
        } catch {
            // Unvollständiger letzter Eintrag — verwerfen.
        }
    }

    return parsed.length > 0 ? parsed : null;
}

/**
 * Manche Modelle packen das Array eine Ebene zu tief (z. B. `[[[eintrag]]]`).
 * Diese Hülle wird entfernt, bis echte Einträge übrig bleiben.
 */
function normalizeEntries(payload: unknown): unknown[] | null {
    let current = payload;

    for (let depth = 0; depth < 4; depth++) {
        if (!Array.isArray(current)) {
            const nested = (current as { results?: unknown } | null)?.results;
            if (Array.isArray(nested)) {
                current = nested;
                continue;
            }
            return null;
        }
        if (current.length === 0) return current;
        if (isQualityEntry(current[0])) return current;
        if (current.length === 1) {
            current = current[0];
            continue;
        }
        if (current.every((item) => Array.isArray(item))) {
            current = current.flat() as unknown[];
            continue;
        }
        return null;
    }

    return null;
}

function isQualityEntry(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.length >= 2 && typeof value[0] === "string";
    }
    return Boolean(value) && typeof value === "object";
}

function coerceQuality(raw: Record<string, unknown>): WordQuality | null {
    const word =
        typeof raw.word === "string" ? raw.word.normalize("NFC").trim() : "";
    if (!word) return null;

    const score = toFiniteNumber(raw.score);
    if (score === null) return null;

    const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
    const pos =
        typeof raw.pos === "string" && POS_VALUES.has(raw.pos)
            ? (raw.pos as PartOfSpeech)
            : raw.pos === null || raw.pos === undefined
              ? null
              : "other";

    return {
        word,
        score: clampedScore,
        german:
            raw.german === undefined || raw.german === null
                ? clampedScore >= 50
                : toBoolean(raw.german),
        properNoun: toBoolean(raw.properNoun),
        abbreviation: toBoolean(raw.abbreviation),
        junk: toBoolean(raw.junk),
        pos,
        confidence: clamp(toFiniteNumber(raw.confidence) ?? 0.5, 0, 1),
        reason:
            typeof raw.reason === "string" ? raw.reason.trim().slice(0, 200) : "",
    };
}

/** Akzeptiert true/false sowie 1/0 und "true"/"false" (kompaktes Schema). */
function toBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized === "true" || normalized === "1";
    }
    return false;
}

function toFiniteNumber(value: unknown): number | null {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// --- Journal: inkrementelle, absturzsichere Speicherung ---

export function sanitizeModelId(model: string): string {
    return (
        model
            .replace(/[^a-zA-Z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "model"
    );
}

export function qualityJournalPath(cacheDir: string, model: string): string {
    return join(cacheDir, `quality-${sanitizeModelId(model)}.jsonl`);
}

/**
 * Lädt bereits bewertete Wörter aus dem Journal. Zeilen mit unbekannter
 * Prompt-Version oder ungültigem JSON werden ignoriert.
 */
export async function loadQualityJournal(
    path: string,
    model: string,
): Promise<Map<string, WordQuality>> {
    let content: string;
    try {
        content = await readFile(path, "utf-8");
    } catch {
        return new Map();
    }

    const words = new Map<string, WordQuality>();

    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let entry: unknown;
        try {
            entry = JSON.parse(trimmed);
        } catch {
            continue;
        }
        if (!entry || typeof entry !== "object") continue;

        const record = entry as Record<string, unknown>;
        if (record.type === "header") {
            if (record.promptVersion !== PROMPT_VERSION) {
                console.warn(
                    `[quality] Journal ${path} nutzt Prompt-Version ${String(record.promptVersion)} statt ${PROMPT_VERSION} — wird ignoriert. Bitte --reset verwenden.`,
                );
                return new Map();
            }
            if (typeof record.model === "string" && record.model !== model) {
                console.warn(
                    `[quality] Journal ${path} gehört zu Modell ${record.model} — wird ignoriert.`,
                );
                return new Map();
            }
            continue;
        }

        const quality = coerceQuality(record);
        if (!quality) continue;
        words.set(quality.word, quality);
    }

    return words;
}

export async function ensureQualityJournal(
    path: string,
    model: string,
): Promise<void> {
    await mkdir(dirname(path), { recursive: true });

    const header = `${JSON.stringify({
        type: "header",
        promptVersion: PROMPT_VERSION,
        model,
        createdAt: new Date().toISOString(),
    })}\n`;

    try {
        await writeFile(path, header, { encoding: "utf-8", flag: "wx" });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
}

export async function appendQualityJournal(
    path: string,
    results: WordQuality[],
): Promise<void> {
    if (results.length === 0) return;
    const lines = results.map((result) => JSON.stringify(result)).join("\n");
    await appendFile(path, `${lines}\n`, "utf-8");
}

export async function resetQualityJournal(path: string): Promise<void> {
    await rm(path, { force: true });
}
