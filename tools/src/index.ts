import { Command } from "commander";
import { execFile } from "node:child_process";
import {
    mkdir,
    readdir,
    readFile,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
    EXPORT_VARIANTS,
    type ExportStats,
    type ExportVariant,
    exportWordlist,
} from "./pipeline/export.js";
import { filterWordlist } from "./pipeline/filter.js";
import { diffWordlists, mergeWordlists } from "./pipeline/merge.js";
import {
    normalizeCapitalized,
    normalizeNoUmlauts,
    normalizeNoUmlautsCapitalized,
    normalizeNoUmlautsLowercase,
    normalizeNoUmlautsUppercase,
    normalizeToLowercase,
    normalizeToUppercase,
} from "./pipeline/normalize.js";
import { fetchDwds } from "./sources/dwds.js";
import { fetchHunspell } from "./sources/hunspell.js";
import { extractFromTexts } from "./sources/text-extraktor.js";
import { fetchWiktionary } from "./sources/wiktionary.js";
import {
    DEFAULT_BATCH_SIZE,
    DEFAULT_CONCURRENCY,
    DEFAULT_MAX_RETRIES,
    DEFAULT_MODEL,
    PROMPT_VERSION,
    appendQualityJournal,
    assessWords,
    ensureQualityJournal,
    loadQualityJournal,
    qualityJournalPath,
    resetQualityJournal,
    selectQualityWords,
    summarizeQuality,
    type QualityStats,
    type WordQuality,
} from "./quality/assessor.js";
import type { ReasoningMode } from "./quality/openrouter.js";
import { loadEnv } from "./utils/env.js";

// Muss vor dem Definieren der Befehle laufen, weil Options-Standardwerte
// (z. B. --model) process.env bereits beim Laden des Moduls lesen.
loadEnv();

const CACHE_DIR = fileURLToPath(new URL("../cache/", import.meta.url));
const CACHE_MAX_AGE_DAYS = 30;

const program = new Command();

program
    .name("wortschatz")
    .description("Tools zum Erstellen und Verwalten der deutschen Wortliste")
    .version("1.0.0");

// --- fetch: Quellen abrufen und zwischenspeichern ---
program
    .command("fetch")
    .description("Wörter aus allen Quellen abrufen und cachen")
    .option("--hunspell", "Nur Hunspell-Quelle")
    .option("--wiktionary", "Nur Wiktionary-Quelle")
    .option("--dwds", "Nur DWDS-Quelle")
    .option("--force", "Cache neu erstellen, auch wenn er aktuell ist")
    .action(async (options) => {
        await mkdir(CACHE_DIR, { recursive: true });

        const specific = options.hunspell || options.wiktionary || options.dwds;

        if (!specific || options.hunspell) {
            if (!options.force && (await isCacheFresh("hunspell.json"))) {
                console.log(
                    "  hunspell: Cache ist aktuell (übersprungen, --force zum Erzwingen)",
                );
            } else {
                const words = await fetchHunspell();
                await saveCacheFileUnlessEmpty("hunspell.json", words);
            }
        }

        if (!specific || options.wiktionary) {
            if (!options.force && (await isCacheFresh("wiktionary.json"))) {
                console.log(
                    "  wiktionary: Cache ist aktuell (übersprungen, --force zum Erzwingen)",
                );
            } else {
                const words = await fetchWiktionary();
                await saveCacheFileUnlessEmpty("wiktionary.json", words);
            }
        }

        if (!specific || options.dwds) {
            if (!options.force && (await isCacheFresh("dwds.json"))) {
                console.log(
                    "  dwds: Cache ist aktuell (übersprungen, --force zum Erzwingen)",
                );
            } else {
                const words = await fetchDwds();
                await saveCacheFileUnlessEmpty("dwds.json", words);
            }
        }

        console.log("\n✓ Fetch abgeschlossen. Daten im Cache gespeichert.");
    });

// --- extract: Eigene Texte verarbeiten ---
program
    .command("extract")
    .description("Wörter aus eigenen Texten (tools/input/) extrahieren")
    .option(
        "--reset",
        "Cache der eigenen Texte neu aufbauen (statt zu ergänzen)",
    )
    .action(async (options) => {
        await mkdir(CACHE_DIR, { recursive: true });

        const words = await extractFromTexts();

        if (words.length === 0 && !options.reset) {
            console.warn(
                "  ⚠ Keine Wörter extrahiert — vorhandener Cache bleibt unverändert.",
            );
            console.log("\n✓ Extraktion abgeschlossen.");
            return;
        }

        const previous = options.reset
            ? []
            : ((await loadCacheFile("custom.json")) ?? []);
        const merged = mergeWordlists(previous, words);
        await saveCacheFile("custom.json", merged);

        if (previous.length > 0 && merged.length !== previous.length) {
            const delta = merged.length - previous.length;
            console.log(
                `  ${delta > 0 ? "+" : ""}${delta} Wörter gegenüber dem vorherigen Cache.`,
            );
        }

        console.log("\n✓ Extraktion abgeschlossen.");
    });

// --- build: Wortliste aus Cache zusammenbauen ---
program
    .command("build")
    .description(
        "Wortliste aus gecachten Daten zusammenbauen und exportieren.\n" +
            "Ohne Flags werden nur neue Wörter zur bestehenden Liste ergänzt.\n" +
            "Mit --rebuild wird die Wortliste komplett neu erstellt.",
    )
    .option(
        "--rebuild",
        "Wortliste komplett neu erstellen (statt nur zu ergänzen)",
    )
    .option("--dry-run", "Zeigt was passieren würde, ohne Dateien zu schreiben")
    .action(async (options) => {
        const rebuild = !!options.rebuild;
        const dryRun = !!options.dryRun;

        if (dryRun)
            console.log(
                "[dry-run] Trockenlauf — keine Dateien werden geschrieben.\n",
            );

        console.log(
            rebuild
                ? "[build] Komplett-Neuaufbau der Wortliste ...\n"
                : "[build] Ergänzungsmodus — nur neue Wörter hinzufügen ...\n",
        );

        // Bestehende Wortliste laden (falls vorhanden und kein Rebuild)
        let existing: string[] = [];
        if (!rebuild) {
            existing = await loadExistingWordlist();
            if (existing.length > 0) {
                console.log(
                    `  Bestehende Wortliste: ${existing.length} Wörter\n`,
                );
            } else {
                console.log(
                    "  Keine bestehende Wortliste gefunden — erstelle neu.\n",
                );
            }
        }

        console.log("[build] Lade gecachte Quellen ...\n");

        const sources: string[][] = [];

        for (const name of ["hunspell", "wiktionary", "dwds", "custom"]) {
            const data = await loadCacheFile(`${name}.json`);
            if (data) {
                console.log(`  ${name}: ${data.length} Wörter geladen`);
                sources.push(data);
            } else {
                console.log(`  ${name}: Keine Daten (übersprungen)`);
            }
        }

        if (sources.length === 0 && existing.length === 0) {
            console.error(
                "\nKeine Quelldaten gefunden. Bitte zuerst 'fetch' oder 'extract' ausführen.",
            );
            process.exit(1);
        }

        console.log("");

        // Zusammenführen (mit bestehender Liste falls vorhanden)
        const allSources =
            existing.length > 0 ? [existing, ...sources] : sources;
        const merged = mergeWordlists(...allSources);
        const filtered = filterWordlist(merged);

        const incremental = !rebuild && existing.length > 0;
        const { added: newWords, removed: removedWords } = incremental
            ? diffWordlists(existing, filtered)
            : { added: filtered, removed: [] as string[] };

        if (incremental) {
            if (newWords.length === 0 && removedWords.length === 0) {
                console.log(
                    "\n✓ Keine Änderungen gefunden. Wortliste ist aktuell.\n",
                );
                return;
            }
            const changes: string[] = [];
            if (newWords.length > 0) {
                changes.push(`+${newWords.length} neue Wörter`);
            }
            if (removedWords.length > 0) {
                changes.push(`-${removedWords.length} ungültige Wörter`);
            }
            console.log(`\n  ${changes.join(", ")} gefunden.`);
        }

        if (dryRun) {
            console.log(
                `\n[dry-run] ${filtered.length} Wörter würden exportiert.`,
            );
            if (incremental) {
                console.log(
                    `[dry-run] +${newWords.length} neu, -${removedWords.length} entfernt.`,
                );
            }
            console.log("[dry-run] Keine Dateien geschrieben.\n");
            return;
        }

        // Varianten erstellen und exportieren
        const allStats = await createVariantsAndExport(filtered);

        console.log("\n========================================");
        console.log(
            rebuild
                ? "  Wortschatz — Neuaufbau abgeschlossen"
                : "  Wortschatz — Aktualisierung abgeschlossen",
        );
        console.log("========================================");
        printExportStats(allStats);
        if (incremental) {
            console.log(`  Neu hinzugefügt: +${newWords.length} Wörter`);
            if (removedWords.length > 0) {
                console.log(
                    `  Entfernt (ungültig): -${removedWords.length} Wörter`,
                );
            }
        }
        console.log("========================================\n");
    });

// --- filter: Bestehende Wortliste filtern ---
program
    .command("filter")
    .description(
        "Bestehende Wortliste filtern: Entfernt Wörter die den Kriterien nicht entsprechen\n" +
            "(nur Großbuchstaben, ≤2 Zeichen, Zahlen, Sonderzeichen) und exportiert neu.",
    )
    .option("--dry-run", "Zeigt was passieren würde, ohne Dateien zu schreiben")
    .action(async (options) => {
        const dryRun = !!options.dryRun;
        const existing = await loadExistingWordlist();

        if (existing.length === 0) {
            console.error(
                "\nKeine bestehende Wortliste gefunden. Bitte zuerst 'build' ausführen.",
            );
            process.exit(1);
        }

        if (dryRun)
            console.log(
                "[dry-run] Trockenlauf — keine Dateien werden geschrieben.\n",
            );

        console.log(
            `[filter] Bestehende Wortliste: ${existing.length} Wörter\n`,
        );

        const filtered = filterWordlist(existing);

        const removed = existing.length - filtered.length;
        if (removed === 0) {
            console.log(
                "\n✓ Keine ungültigen Wörter gefunden. Wortliste ist sauber.\n",
            );
            return;
        }

        if (dryRun) {
            console.log(
                `\n[dry-run] ${removed} Wörter würden entfernt, ${filtered.length} behalten.`,
            );
            console.log("[dry-run] Keine Dateien geschrieben.\n");
            return;
        }

        // Varianten erstellen und exportieren
        const allStats = await createVariantsAndExport(filtered);

        console.log("\n========================================");
        console.log("  Wortschatz — Filter abgeschlossen");
        console.log("========================================");
        printExportStats(allStats);
        console.log(`  Entfernt: ${removed} Wörter`);
        console.log("========================================\n");
    });

// --- stats: Statistiken anzeigen ---
program
    .command("stats")
    .description("Statistiken über Quellen, Überlappung und Wachstum anzeigen")
    .action(async () => {
        const sourceNames = [
            "hunspell",
            "wiktionary",
            "dwds",
            "custom",
        ] as const;
        const sources = new Map<string, Set<string>>();

        // Quellen laden
        console.log("\n  Lade gecachte Quellen ...\n");
        for (const name of sourceNames) {
            const data = await loadCacheFile(`${name}.json`);
            if (data) {
                sources.set(name, new Set(data));
            }
        }

        // Bestehende Wortliste laden
        const existing = await loadExistingWordlist();

        // ── 1. Wortanzahl pro Quelle ──
        console.log("========================================");
        console.log("  Wortschatz — Statistiken");
        console.log("========================================\n");

        console.log("── Wörter pro Quelle ──\n");
        for (const name of sourceNames) {
            const set = sources.get(name);
            const count = set ? set.size : 0;
            const label = name.padEnd(14);
            console.log(
                `  ${label} ${count.toLocaleString("de-DE").padStart(10)} Wörter`,
            );
        }
        console.log(`  ${"".padEnd(14)} ${"".padStart(10, "─")}`);
        console.log(
            `  ${"Wortliste".padEnd(14)} ${existing.length.toLocaleString("de-DE").padStart(10)} Wörter (nach Merge)\n`,
        );

        // ── 2. Überlappung zwischen Quellen ──
        const activeNames = sourceNames.filter((n) => sources.has(n));

        if (activeNames.length >= 2) {
            console.log("── Überlappung zwischen Quellen ──\n");

            for (let i = 0; i < activeNames.length; i++) {
                for (let j = i + 1; j < activeNames.length; j++) {
                    const nameA = activeNames[i];
                    const nameB = activeNames[j];
                    const setA = sources.get(nameA)!;
                    const setB = sources.get(nameB)!;

                    let overlap = 0;
                    const smaller = setA.size <= setB.size ? setA : setB;
                    const larger = setA.size <= setB.size ? setB : setA;
                    for (const word of smaller) {
                        if (larger.has(word)) overlap++;
                    }

                    const pairLabel = `${nameA} ∩ ${nameB}`;
                    console.log(
                        `  ${pairLabel.padEnd(28)} ${overlap.toLocaleString("de-DE").padStart(10)} gemeinsame Wörter`,
                    );
                }
            }
            console.log("");

            // Exklusiv pro Quelle
            console.log("── Exklusive Wörter (nur in dieser Quelle) ──\n");

            for (const name of activeNames) {
                const set = sources.get(name)!;
                let exclusive = 0;
                for (const word of set) {
                    const inOther = activeNames.some(
                        (other) =>
                            other !== name && sources.get(other)!.has(word),
                    );
                    if (!inOther) exclusive++;
                }
                const pct =
                    set.size > 0
                        ? ((exclusive / set.size) * 100).toFixed(1)
                        : "0.0";
                console.log(
                    `  ${name.padEnd(14)} ${exclusive.toLocaleString("de-DE").padStart(10)} exklusiv (${pct}%)`,
                );
            }
            console.log("");
        }

        // ── 3. Wachstum über Zeit (Git-Historie) ──
        console.log("── Wachstum über Zeit ──\n");

        const history = await getWordlistHistory();
        if (history.length === 0) {
            console.log("  Keine Git-Historie verfügbar.\n");
        } else {
            for (const entry of history) {
                const delta =
                    entry.delta !== null
                        ? (entry.delta >= 0 ? "+" : "") +
                          entry.delta.toLocaleString("de-DE")
                        : "";
                console.log(
                    `  ${entry.date}   ${entry.count.toLocaleString("de-DE").padStart(10)} Wörter  ${delta}`,
                );
            }
            console.log("");
        }

        // ── 4. Cache-Alter ──
        console.log("── Cache-Alter ──\n");
        for (const name of sourceNames) {
            const age = await getCacheAge(`${name}.json`);
            const label = name.padEnd(14);
            console.log(`  ${label} ${age}`);
        }

        console.log("\n========================================\n");
    });

// --- quality: Wortqualität mit einem LLM bewerten ---
program
    .command("quality")
    .description(
        "Wortqualität mit einem LLM über die OpenRouter-API bewerten.\n" +
            "Bewertungen werden inkrementell in tools/cache/quality-<modell>.jsonl gespeichert.\n" +
            "Mit --apply wird die gefilterte Liste als neue Wortliste exportiert.",
    )
    .option("--variant <name>", "Wortlisten-Variante", "original")
    .option(
        "--input <file>",
        "Eigene Wortliste (eine Zeile pro Wort) statt einer Variante",
    )
    .option(
        "--model <id>",
        "OpenRouter-Modell",
        process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
    )
    .option(
        "--batch-size <n>",
        "Wörter pro Anfrage",
        String(DEFAULT_BATCH_SIZE),
    )
    .option(
        "--concurrency <n>",
        "Parallele Anfragen, 1–100",
        String(DEFAULT_CONCURRENCY),
    )
    .option(
        "--max-retries <n>",
        "Wiederholungen bei Netz-/HTTP-Fehlern (Standard: 3)",
        String(DEFAULT_MAX_RETRIES),
    )
    .option(
        "--max-tokens <n>",
        "Maximale Ausgabe-Tokens pro Anfrage (Standard: automatisch geschätzt)",
    )
    .option(
        "--compact",
        "Kompaktes Antwortschema — ca. 80 % weniger Ausgabe-Tokens, erlaubt bis ca. 500 Wörter pro Anfrage",
    )
    .option(
        "--reasoning <mode>",
        "Reasoning-Modelle steuern: off, low, medium, high, auto (Standard: off)",
        "off",
    )
    .option(
        "--no-split",
        "Abgeschnittene Antworten nicht automatisch aufteilen",
    )
    .option("--limit <n>", "Maximal so viele neue Wörter bewerten")
    .option("--output <path>", "Vollständigen Bericht als JSON schreiben")
    .option(
        "--clean-output <path>",
        "Liste der Wörter mit ausreichender Qualität schreiben",
    )
    .option("--min-score <n>", "Mindest-Score für --clean-output", "80")
    .option(
        "--exclude-proper-nouns",
        "Eigennamen aus --clean-output entfernen",
    )
    .option(
        "--exclude-abbreviations",
        "Abkürzungen aus --clean-output entfernen",
    )
    .option(
        "--apply",
        "Bewertete Wörter als neue Wortliste exportieren (alle Varianten, ohne API-Aufrufe)",
    )
    .option(
        "--force",
        "Mit --apply auch exportieren, wenn Wörter noch unbewertet sind",
    )
    .option(
        "--dry-run",
        "Nichts schreiben und keine API-Aufrufe (Vorschau, auch für --apply)",
    )
    .option("--reset", "Vorhandene Bewertungen für dieses Modell verwerfen")
    .action(async (options) => {
        const model = String(options.model);
        const batchSize = parseIntegerOption(
            options.batchSize,
            "--batch-size",
            1,
            1000,
        );
        const concurrency = parseIntegerOption(
            options.concurrency,
            "--concurrency",
            1,
            100,
        );
        const maxRetries = parseIntegerOption(
            options.maxRetries,
            "--max-retries",
            1,
            10,
        );
        const maxTokens =
            options.maxTokens === undefined
                ? undefined
                : parseIntegerOption(
                      options.maxTokens,
                      "--max-tokens",
                      256,
                      200_000,
                  );
        const compact = !!options.compact;
        const reasoning = parseReasoningOption(options.reasoning);
        const minScore = parseIntegerOption(
            options.minScore,
            "--min-score",
            0,
            100,
        );
        const limit =
            options.limit === undefined
                ? undefined
                : parseIntegerOption(
                      options.limit,
                      "--limit",
                      1,
                      Number.MAX_SAFE_INTEGER,
                  );
        const dryRun = !!options.dryRun;
        const source = options.input ? String(options.input) : null;
        const words = [
            ...new Set(
                source
                    ? await loadWordsFile(source)
                    : await loadVariantWords(String(options.variant)),
            ),
        ];

        if (words.length === 0) {
            console.log("\n  Keine Wörter gefunden.\n");
            return;
        }

        const journalPath = qualityJournalPath(CACHE_DIR, model);
        if (options.reset) {
            await resetQualityJournal(journalPath);
            console.log(`  [quality] Journal zurückgesetzt: ${journalPath}`);
        }

        const assessed = await loadQualityJournal(journalPath, model);
        const pending = words.filter((word) => !assessed.has(word));
        const todo =
            limit === undefined ? pending : pending.slice(0, limit);
        const batches = Math.ceil(todo.length / batchSize);

        console.log("========================================");
        console.log("  Wortschatz — Qualitätsprüfung");
        console.log("========================================");
        console.log(`  Modell:         ${model}`);
        console.log(
            `  Reasoning:      ${reasoning === "auto" ? "automatisch" : reasoning === "off" ? "aus" : reasoning}`,
        );
        console.log(
            `  Quelle:         ${source ?? `wortliste/${String(options.variant)}/_alle.txt`}`,
        );
        console.log(`  Wörter:         ${formatNumber(words.length)}`);
        console.log(
            `  Bereits bewertet: ${formatNumber(words.length - pending.length)}`,
        );
        console.log(`  Offen:          ${formatNumber(pending.length)}`);
        if (todo.length !== pending.length) {
            console.log(
                `  In diesem Lauf: ${formatNumber(todo.length)}`,
            );
        }
        console.log(
            `  Anfragen:       ${formatNumber(batches)} à ${batchSize} Wörter`,
        );
        console.log(
            `  Ausgabe-Tokens: ${maxTokens === undefined ? "automatisch" : formatNumber(maxTokens)}${compact ? " (kompakt)" : ""}\n`,
        );

        if (batchSize > 100 && !compact) {
            console.warn(
                "  ⚠ Große Batches ohne --compact: die ausführliche Antwort braucht\n" +
                    "    ca. 45 Tokens pro Wort, also rund " +
                    `${formatNumber(batchSize * 45)} Tokens. Das überschreitet die\n` +
                    "    Ausgabelimits der meisten Modelle. Empfehlung: --compact\n" +
                    "    (ca. 22 Tokens pro Wort) oder ein kleineres --batch-size.\n",
            );
        }

        if (options.apply) {
            console.log(
                "  ℹ --apply exportiert ausschließlich gespeicherte Bewertungen — keine API-Aufrufe.\n",
            );
        } else if (dryRun) {
            console.log(
                `[dry-run] ${formatNumber(batches)} API-Anfragen würden gesendet. Keine API-Aufrufe, keine Dateien geschrieben.\n`,
            );
        } else if (todo.length > 0) {
            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
                throw new Error(
                    "OPENROUTER_API_KEY ist nicht gesetzt. Lege den Schlüssel in tools/.env " +
                        "(OPENROUTER_API_KEY=sk-or-...) oder in der Umgebung ab. " +
                        "Beispiel: OPENROUTER_API_KEY=sk-or-... npm run quality -- --limit 100",
                );
            }

            await ensureQualityJournal(journalPath, model);

            let processed = 0;
            let appendQueue: Promise<void> = Promise.resolve();
            const startedAt = Date.now();

            const summary = await assessWords({
                words: todo,
                apiKey,
                model,
                baseUrl: process.env.OPENROUTER_BASE_URL,
                batchSize,
                concurrency,
                maxRetries,
                maxTokens,
                compact,
                reasoning,
                splitOnOverflow: options.split !== false,
                onBatch: (batch) => {
                    for (const quality of batch) {
                        assessed.set(quality.word, quality);
                    }
                    processed += batch.length;
                    console.log(
                        `[quality] ${formatNumber(processed)}/${formatNumber(todo.length)} neue Wörter bewertet`,
                    );

                    appendQueue = appendQueue
                        .then(() => appendQualityJournal(journalPath, batch))
                        .catch((error: unknown) => {
                            console.error(
                                `[quality] Journal konnte nicht geschrieben werden: ${error instanceof Error ? error.message : String(error)}`,
                            );
                        });
                },
            });

            await appendQueue;

            console.log("");
            console.log(
                `  Bewertet in diesem Lauf: ${formatNumber(summary.results.length)} Wörter`,
            );
            if (summary.failedBatches > 0) {
                console.log(
                    `  Fehlgeschlagen:          ${formatNumber(summary.failedWords)} Wörter in ${summary.failedBatches} Batches`,
                );
                process.exitCode = 1;
            }
            console.log(
                `  API-Anfragen:            ${formatNumber(summary.requests)}`,
            );
            console.log(
                `  Tokens:                  ${formatNumber(summary.usage.totalTokens)}`,
            );
            console.log(
                `  Dauer:                   ${formatDuration(Date.now() - startedAt)}`,
            );
        } else if (!options.apply) {
            console.log("  ✓ Alle Wörter sind bereits bewertet.\n");
        }

        const results = words
            .map((word) => assessed.get(word))
            .filter((quality): quality is WordQuality => Boolean(quality));
        const unassessed = words.filter((word) => !assessed.has(word));
        const stats = summarizeQuality(results);
        const cleanWords = selectQualityWords(results, {
            minScore,
            excludeProperNouns: !!options.excludeProperNouns,
            excludeAbbreviations: !!options.excludeAbbreviations,
        });

        // Vorprüfungen, bevor irgendetwas geschrieben oder exportiert wird.
        if (options.apply) {
            if (source) {
                throw new Error(
                    "--apply ersetzt wortliste/ und funktioniert deshalb nur mit einer Variante, nicht mit --input.",
                );
            }
            if (String(options.variant) !== "original") {
                throw new Error(
                    "--apply schreibt wortliste/original — bitte ohne --variant oder mit --variant original aufrufen.",
                );
            }
            if (cleanWords.length === 0) {
                throw new Error(
                    "Keine Wörter haben die Kriterien erfüllt — die Wortliste wird nicht überschrieben.",
                );
            }
            if (unassessed.length > 0 && !options.force) {
                throw new Error(
                    `${formatNumber(unassessed.length)} von ${formatNumber(words.length)} Wörtern sind noch unbewertet und würden beim Export entfallen. ` +
                        "Erst vollständig bewerten oder mit --force bewusst übergehen.",
                );
            }
        }

        printQualityStats(stats, results);

        if (unassessed.length > 0) {
            console.log(
                `  ⚠ ${formatNumber(unassessed.length)} Wörter sind noch unbewertet (z. B. nach API-Fehlern).`,
            );
        }

        if (options.output) {
            const outputPath = String(options.output);
            if (dryRun) {
                console.log(
                    `[dry-run] Bericht würde geschrieben: ${outputPath}`,
                );
            } else {
                await mkdir(dirname(outputPath), { recursive: true });
                await writeFile(
                    outputPath,
                    `${JSON.stringify({
                        model,
                        promptVersion: PROMPT_VERSION,
                        generatedAt: new Date().toISOString(),
                        source:
                            source ??
                            `wortliste/${String(options.variant)}/_alle.txt`,
                        summary: stats,
                        words: results,
                        unassessed,
                    })}\n`,
                    "utf-8",
                );
                console.log(`  Bericht geschrieben: ${outputPath}`);
            }
        }

        if (options.cleanOutput) {
            const cleanPath = String(options.cleanOutput);
            if (dryRun) {
                console.log(
                    `[dry-run] Saubere Liste würde geschrieben: ${cleanPath} (${formatNumber(cleanWords.length)} von ${formatNumber(results.length)} Wörtern)`,
                );
            } else {
                await mkdir(dirname(cleanPath), { recursive: true });
                await writeFile(
                    cleanPath,
                    cleanWords.length > 0 ? `${cleanWords.join("\n")}\n` : "",
                    "utf-8",
                );
                console.log(
                    `  Saubere Liste: ${cleanPath} (${formatNumber(cleanWords.length)} von ${formatNumber(results.length)} Wörtern)\n`,
                );
            }
        }

        if (options.apply) {
            const removed = words.length - cleanWords.length;

            console.log("");
            if (dryRun) {
                console.log(
                    `[dry-run] Wortliste würde ersetzt: ${formatNumber(cleanWords.length)} Wörter behalten, ${formatNumber(removed)} entfernt.`,
                );
            } else {
                const allStats = await createVariantsAndExport(cleanWords);

                console.log("\n========================================");
                console.log("  Wortschatz — Wortliste aktualisiert");
                console.log("========================================");
                printExportStats(allStats);
                console.log(
                    `  Behalten: ${formatNumber(cleanWords.length)} Wörter`,
                );
                console.log(`  Entfernt: ${formatNumber(removed)} Wörter`);
                console.log("========================================\n");
            }
        }
    });

// --- cache: Cache verwalten ---
program
    .command("cache")
    .description("Cache-Verzeichnis verwalten")
    .argument("<action>", "Aktion: 'clean' (alle Cache-Dateien löschen)")
    .action(async (action: string) => {
        if (action === "clean") {
            try {
                const files = await readdir(CACHE_DIR);
                const cacheFiles = files.filter(
                    (f) => f.endsWith(".json") || f.endsWith(".jsonl"),
                );

                if (cacheFiles.length === 0) {
                    console.log("\n  Cache ist bereits leer.\n");
                    return;
                }

                for (const file of cacheFiles) {
                    await rm(join(CACHE_DIR, file));
                    console.log(`  Gelöscht: ${file}`);
                }

                console.log(
                    `\n✓ ${cacheFiles.length} Cache-Dateien gelöscht.\n`,
                );
            } catch {
                console.log("\n  Cache-Verzeichnis nicht vorhanden.\n");
            }
        } else {
            console.error(
                `\nUnbekannte Aktion: '${action}'. Verfügbar: clean\n`,
            );
            process.exit(1);
        }
    });

interface HistoryEntry {
    date: string;
    count: number;
    delta: number | null;
}

const execFileAsync = promisify(execFile);

async function getWordlistHistory(): Promise<HistoryEntry[]> {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    const relPath = "wortliste/original/_alle.txt";

    try {
        // Get commits that touched the wordlist file
        const { stdout } = await execFileAsync(
            "git",
            ["log", "--pretty=format:%H %as", "--follow", "--", relPath],
            { cwd: repoRoot, maxBuffer: 1024 * 1024 },
        );

        if (!stdout.trim()) return [];

        const commits = stdout
            .trim()
            .split("\n")
            .map((line) => {
                const [hash, date] = line.split(" ");
                return { hash, date };
            });

        // Limit to last 20 commits for performance
        const limited = commits.slice(0, 20);

        const entries: HistoryEntry[] = [];

        for (const { hash, date } of limited) {
            try {
                const { stdout: content } = await execFileAsync(
                    "git",
                    ["show", `${hash}:${relPath}`],
                    { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 },
                );
                const count = content
                    .split("\n")
                    .filter((l) => l.length > 0).length;
                entries.push({ date, count, delta: null });
            } catch {
                // File didn't exist in this commit
            }
        }

        // Calculate deltas (newest first → delta = current - next)
        for (let i = 0; i < entries.length - 1; i++) {
            entries[i].delta = entries[i].count - entries[i + 1].count;
        }

        // Reverse to show oldest → newest
        return entries.reverse();
    } catch {
        return [];
    }
}

async function getCacheAge(filename: string): Promise<string> {
    try {
        const path = join(CACHE_DIR, filename);
        const info = await stat(path);
        const ageMs = Date.now() - info.mtimeMs;
        const hours = Math.floor(ageMs / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (days > 0) return `vor ${days} Tag${days === 1 ? "" : "en"}`;
        if (hours > 0) return `vor ${hours} Stunde${hours === 1 ? "" : "n"}`;
        return "gerade eben";
    } catch {
        return "nicht vorhanden";
    }
}

// --- Hilfsfunktionen ---

const WORDLIST_DIR = fileURLToPath(new URL("../../wortliste/", import.meta.url));

/**
 * Erstellt alle Varianten einer Wortliste und exportiert sie.
 * Wird von build und filter gemeinsam genutzt.
 */
async function createVariantsAndExport(
    filtered: string[],
): Promise<ExportStats[]> {
    const variants: Array<{ words: string[]; name: ExportVariant }> = [
        { words: filtered, name: "original" },
        { words: normalizeToLowercase(filtered), name: "lowercase" },
        { words: normalizeToUppercase(filtered), name: "uppercase" },
        { words: normalizeNoUmlauts(filtered), name: "no-umlauts" },
        {
            words: normalizeNoUmlautsLowercase(filtered),
            name: "no-umlauts-lowercase",
        },
        {
            words: normalizeNoUmlautsCapitalized(filtered),
            name: "no-umlauts-capitalized",
        },
        {
            words: normalizeNoUmlautsUppercase(filtered),
            name: "no-umlauts-uppercase",
        },
        { words: normalizeCapitalized(filtered), name: "capitalized" },
    ];

    console.log("");
    const allStats: ExportStats[] = [];
    for (const { words, name } of variants) {
        allStats.push(await exportWordlist(words, name));
    }
    return allStats;
}

function printExportStats(allStats: ExportStats[]): void {
    for (const stats of allStats) {
        const label = stats.variant.padEnd(22);
        console.log(
            `  ${label} ${stats.totalWords} Wörter in ${stats.files} Dateien`,
        );
    }
}

function printQualityStats(
    stats: QualityStats,
    results: WordQuality[],
): void {
    console.log("── Qualitätsverteilung ──\n");
    console.log(`  Bewertete Wörter:   ${formatNumber(stats.total)}`);
    console.log(`  Durchschnitt:       ${stats.averageScore.toFixed(1)} / 100`);
    console.log(`  90–100 (gut):       ${formatNumber(stats.bands.excellent)}`);
    console.log(`  70–89  (solide):    ${formatNumber(stats.bands.good)}`);
    console.log(
        `  50–69  (fraglich):  ${formatNumber(stats.bands.questionable)}`,
    );
    console.log(`  0–49   (Junk):      ${formatNumber(stats.bands.junk)}`);
    console.log(`  Eigennamen:         ${formatNumber(stats.properNouns)}`);
    console.log(`  Abkürzungen:        ${formatNumber(stats.abbreviations)}`);
    console.log(
        `  Unsichere Urteile:  ${formatNumber(stats.lowConfidence)}\n`,
    );

    const suspicious = [...results]
        .filter((result) => result.score < 50 || result.junk)
        .sort((a, b) => a.score - b.score)
        .slice(0, 10);

    if (suspicious.length > 0) {
        console.log("── Auffälligste Wörter ──\n");
        for (const result of suspicious) {
            console.log(
                `  ${result.word.padEnd(24)} ${String(result.score).padStart(3)}  ${result.reason}`,
            );
        }
        console.log("");
    }
}

async function loadVariantWords(variant: string): Promise<string[]> {
    if (!(EXPORT_VARIANTS as readonly string[]).includes(variant)) {
        throw new Error(
            `Unbekannte Variante "${variant}". Verfügbar: ${EXPORT_VARIANTS.join(", ")}`,
        );
    }

    return loadWordsFile(join(WORDLIST_DIR, variant, "_alle.txt"));
}

async function loadWordsFile(path: string): Promise<string[]> {
    try {
        const content = await readFile(path, "utf-8");
        return content
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            throw new Error(`Datei nicht gefunden: ${path}`);
        }
        throw error;
    }
}

function parseReasoningOption(value: unknown): ReasoningMode {
    const modes: readonly ReasoningMode[] = [
        "off",
        "low",
        "medium",
        "high",
        "auto",
    ];
    const mode = String(value).toLowerCase();
    if (!modes.includes(mode as ReasoningMode)) {
        throw new Error(
            `Ungültiger Wert für --reasoning: ${String(value)} (erwartet ${modes.join(", ")})`,
        );
    }
    return mode as ReasoningMode;
}

function parseIntegerOption(
    value: unknown,
    name: string,
    min: number,
    max: number,
): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(
            `Ungültiger Wert für ${name}: ${String(value)} (erwartet ${min}–${max})`,
        );
    }
    return parsed;
}

function formatNumber(value: number): string {
    return value.toLocaleString("de-DE");
}

function formatDuration(milliseconds: number): string {
    const seconds = Math.max(0, Math.round(milliseconds / 1000));
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
}

async function loadExistingWordlist(): Promise<string[]> {
    try {
        const path = join(WORDLIST_DIR, "original", "_alle.txt");
        const content = await readFile(path, "utf-8");
        return content.split("\n").filter((line) => line.length > 0);
    } catch {
        return [];
    }
}

async function saveCacheFile(filename: string, data: string[]): Promise<void> {
    const path = join(CACHE_DIR, filename);
    await writeFile(path, JSON.stringify(data), "utf-8");
    console.log(`  → Cache gespeichert: ${filename} (${data.length} Einträge)`);
}

/**
 * Speichert eine Quelle nur, wenn sie Wörter geliefert hat. Ein leerer
 * Abruf (z. B. wegen API-Ausfall) darf einen bestehenden Cache nicht
 * überschreiben, da sonst Wörter unwiederbringlich verloren gehen.
 */
async function saveCacheFileUnlessEmpty(
    filename: string,
    data: string[],
): Promise<void> {
    if (data.length === 0) {
        const previous = await loadCacheFile(filename);
        const hint =
            previous && previous.length > 0
                ? ` Vorhandener Cache (${previous.length} Einträge) bleibt erhalten.`
                : "";
        console.warn(
            `  ⚠ ${filename}: Quelle lieferte 0 Wörter — nichts gespeichert.${hint}`,
        );
        return;
    }
    await saveCacheFile(filename, data);
}

async function loadCacheFile(filename: string): Promise<string[] | null> {
    const path = join(CACHE_DIR, filename);
    try {
        const content = await readFile(path, "utf-8");
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
            console.warn(
                `  ⚠ Cache-Datei ${filename} hat ungültiges Format, wird ignoriert.`,
            );
            return null;
        }
        return parsed as string[];
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.warn(
                `  ⚠ Cache-Datei ${filename} ist korrupt (ungültiges JSON), wird ignoriert.`,
            );
            return null;
        }
        return null;
    }
}

async function isCacheFresh(filename: string): Promise<boolean> {
    try {
        const path = join(CACHE_DIR, filename);
        const info = await stat(path);
        const ageMs = Date.now() - info.mtimeMs;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        return ageDays < CACHE_MAX_AGE_DAYS;
    } catch {
        return false;
    }
}

try {
    await program.parseAsync();
} catch (error) {
    console.error(
        `\nFehler: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
}
