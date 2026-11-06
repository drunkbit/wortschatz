import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Pausen und Parallelität für die Tests entfernen.
vi.mock("../src/utils/async.js", () => ({
    sleep: () => Promise.resolve(),
    parallelMap: async <T, R>(
        items: T[],
        _concurrency: number,
        fn: (item: T) => Promise<R>,
    ): Promise<R[]> => Promise.all(items.map(fn)),
}));

import {
    appendQualityJournal,
    assessWords,
    ensureQualityJournal,
    loadQualityJournal,
    parseQualityResponse,
    resetQualityJournal,
    sanitizeModelId,
    selectQualityWords,
    summarizeQuality,
    type WordQuality,
} from "../src/quality/assessor.js";

const QUALITY: WordQuality = {
    word: "Haus",
    score: 100,
    german: true,
    properNoun: false,
    abbreviation: false,
    junk: false,
    pos: "noun",
    confidence: 0.99,
    reason: "Gebräuchliches deutsches Substantiv",
};

function completion(
    content: string,
    status = 200,
    finishReason = "stop",
) {
    return new Response(
        JSON.stringify({
            model: "test/model",
            choices: [{ message: { content }, finish_reason: finishReason }],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
        }),
        { status, headers: { "content-type": "application/json" } },
    );
}

function compactEntries(words: string[]): string {
    return JSON.stringify(words.map((word) => [word, 90, 1, 0, 0, 0, 0.9]));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("parseQualityResponse", () => {
    it("parst JSON in Markdown-Fences", () => {
        const content = `Hier ist das Ergebnis:\n\`\`\`json\n${JSON.stringify([QUALITY])}\n\`\`\``;

        expect(parseQualityResponse(content, ["Haus"])).toEqual([QUALITY]);
    });

    it("entfernt eine zusätzliche Array-Ebene", () => {
        // Manche Modelle antworten mit [[[wort, …], …]] statt [[wort, …], …].
        const content = JSON.stringify([
            [
                ["Haus", 90, 1, 0, 0, 0, 0.9],
                ["Baum", 95, 1, 0, 0, 0, 0.9],
            ],
        ]);

        expect(
            parseQualityResponse(content, ["Haus", "Baum"]).map(
                (quality) => quality.word,
            ),
        ).toEqual(["Haus", "Baum"]);
    });

    it("rettet vollständige Einträge aus abgeschnittenen Antworten", () => {
        const content = '[[ "Haus", 90, 1, 0, 0, 0, 0.9 ], [ "Baum", 95, 1';

        expect(
            parseQualityResponse(content, ["Haus", "Baum"]).map(
                (quality) => quality.word,
            ),
        ).toEqual(["Haus"]);
    });

    it("parst das kompakte Array-Schema", () => {
        const content = JSON.stringify([
            ["Haus", 95, 1, 0, 0, 0, 0.9],
            ["Xyzq", 5, 0, 0, 0, 1, 0.8],
        ]);

        const [haus, xyzq] = parseQualityResponse(content, ["Haus", "Xyzq"]);

        expect(haus).toEqual({
            word: "Haus",
            score: 95,
            german: true,
            properNoun: false,
            abbreviation: false,
            junk: false,
            pos: null,
            confidence: 0.9,
            reason: "",
        });
        expect(xyzq.junk).toBe(true);
        expect(xyzq.german).toBe(false);
    });

    it("respektiert Reihenfolge der Eingabe auch bei kompaktem Schema", () => {
        const content = JSON.stringify([
            ["Zebra", 90, 1, 0, 0, 0, 1],
            ["Apfel", 90, 1, 0, 0, 0, 1],
        ]);

        expect(parseQualityResponse(content, ["Apfel", "Zebra"])).toEqual([
            expect.objectContaining({ word: "Apfel" }),
            expect.objectContaining({ word: "Zebra" }),
        ]);
    });

    it("akzeptiert ein Objekt mit results-Array", () => {
        const content = JSON.stringify({ results: [QUALITY] });
        expect(parseQualityResponse(content, ["Haus"])).toEqual([QUALITY]);
    });

    it("ignoriert unbekannte Wörter und begrenzt Werte", () => {
        const content = JSON.stringify([
            {
                word: "Haus",
                score: 130,
                german: true,
                properNoun: false,
                abbreviation: false,
                junk: false,
                pos: "noun",
                confidence: 4,
                reason: "ok",
            },
            { word: "Fremdwort", score: 10 },
            { word: "Haus", score: 1 },
        ]);

        const [result] = parseQualityResponse(content, ["Haus"]);

        expect(result.score).toBe(100);
        expect(result.confidence).toBe(1);
    });

    it("wirft bei fehlendem JSON einen Fehler", () => {
        expect(() => parseQualityResponse("Keine Ahnung.", ["Haus"])).toThrow(
            /JSON/,
        );
    });
});

describe("summarizeQuality", () => {
    it("berechnet Verteilung und Durchschnitt", () => {
        const stats = summarizeQuality([
            { ...QUALITY, score: 95 },
            { ...QUALITY, word: "Baum", score: 75 },
            { ...QUALITY, word: "Xyz", score: 40, junk: true },
        ]);

        expect(stats.total).toBe(3);
        expect(stats.averageScore).toBe(70);
        expect(stats.bands).toEqual({
            excellent: 1,
            good: 1,
            questionable: 0,
            junk: 1,
        });
        expect(stats.junk).toBe(1);
    });
});

describe("assessWords", () => {
    it("bewertet Wörter über die API und meldet Fortschritt", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => completion(JSON.stringify([QUALITY]))),
        );
        const onBatch = vi.fn();

        const summary = await assessWords({
            words: ["Haus"],
            apiKey: "test",
            model: "test/model",
            onBatch,
        });

        expect(summary.results).toEqual([QUALITY]);
        expect(summary.failedBatches).toBe(0);
        expect(summary.requests).toBe(1);
        expect(summary.usage.totalTokens).toBe(15);
        expect(onBatch).toHaveBeenCalledWith([QUALITY], {
            processed: 1,
            total: 1,
        });
    });

    it("wiederholt Anfragen bei 429 und nutzt Retry-After", async () => {
        let calls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                calls++;
                if (calls === 1) {
                    return new Response(
                        JSON.stringify({ error: { message: "Rate limit" } }),
                        {
                            status: 429,
                            headers: {
                                "content-type": "application/json",
                                "retry-after": "0",
                            },
                        },
                    );
                }
                return completion(JSON.stringify([QUALITY]));
            }),
        );

        const summary = await assessWords({
            words: ["Haus"],
            apiKey: "test",
            model: "test/model",
            maxRetries: 2,
        });

        expect(calls).toBe(2);
        expect(summary.requests).toBe(2);
        expect(summary.results).toEqual([QUALITY]);
    });

    it("überspringt Batches bei nicht wiederholbaren Fehlern", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({ error: { message: "Bad Request" } }),
                        {
                            status: 400,
                            headers: { "content-type": "application/json" },
                        },
                    ),
            ),
        );

        const summary = await assessWords({
            words: ["Haus"],
            apiKey: "test",
            model: "test/model",
        });

        expect(summary.results).toEqual([]);
        expect(summary.failedBatches).toBe(1);
        expect(summary.failedWords).toBe(1);
        expect(summary.requests).toBe(1);
    });

    it("verwendet das kompakte Schema bei --compact", async () => {
        let systemPrompt = "";
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: unknown, init: { body: string }) => {
                const payload = JSON.parse(init.body);
                systemPrompt = payload.messages[0].content;
                const user = payload.messages[1].content as string;
                const words: string[] = JSON.parse(
                    user.slice(user.indexOf("[")),
                );
                return completion(compactEntries(words));
            }),
        );

        const summary = await assessWords({
            words: ["Haus", "Baum"],
            apiKey: "test",
            model: "test/model",
            compact: true,
        });

        expect(systemPrompt).toContain("genau 7 Elementen");
        expect(summary.results.map((result) => result.word)).toEqual([
            "Haus",
            "Baum",
        ]);
    });

    it("teilt abgeschnittene Antworten automatisch auf", async () => {
        const requested: string[][] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: unknown, init: { body: string }) => {
                const payload = JSON.parse(init.body);
                const user = payload.messages[1].content as string;
                const words: string[] = JSON.parse(
                    user.slice(user.indexOf("[")),
                );
                requested.push(words);

                // Erste Anfrage (4 Wörter) wird abgeschnitten: nur 2 Einträge.
                if (words.length > 2) {
                    return completion(compactEntries(words.slice(0, 2)), 200, "length");
                }
                return completion(compactEntries(words));
            }),
        );

        const summary = await assessWords({
            words: ["Aaa", "Bbb", "Ccc", "Ddd"],
            apiKey: "test",
            model: "test/model",
            batchSize: 4,
            compact: true,
        });

        expect(summary.failedBatches).toBe(0);
        expect(summary.results.map((result) => result.word).sort()).toEqual([
            "Aaa",
            "Bbb",
            "Ccc",
            "Ddd",
        ]);
        // Erste Anfrage mit 4 Wörtern, danach die 2 fehlenden Wörter.
        expect(requested[0]).toHaveLength(4);
        expect(requested.slice(1).flat().sort()).toEqual(["Ccc", "Ddd"]);
    });

    it("maxTokens wird an die API übergeben", async () => {
        let sentMaxTokens = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: unknown, init: { body: string }) => {
                sentMaxTokens = JSON.parse(init.body).max_tokens;
                return completion(compactEntries(["Haus"]));
            }),
        );

        await assessWords({
            words: ["Haus"],
            apiKey: "test",
            model: "test/model",
            maxTokens: 32_000,
            compact: true,
        });

        expect(sentMaxTokens).toBe(32_000);
    });

    it("steuert Reasoning über den OpenRouter-Parameter", async () => {
        const bodies: Array<Record<string, unknown>> = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: unknown, init: { body: string }) => {
                bodies.push(JSON.parse(init.body));
                return completion(compactEntries(["Haus"]));
            }),
        );

        for (const reasoning of ["off", "high", "auto"] as const) {
            await assessWords({
                words: ["Haus"],
                apiKey: "test",
                model: "test/model",
                compact: true,
                reasoning,
            });
        }

        expect(bodies[0].reasoning).toEqual({ enabled: false });
        expect(bodies[1].reasoning).toEqual({ effort: "high" });
        expect(bodies[2]).not.toHaveProperty("reasoning");
    });

    it("reserviert beim Token-Budget Platz fürs Reasoning", async () => {
        const sent: number[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: unknown, init: { body: string }) => {
                const payload = JSON.parse(init.body);
                sent.push(payload.max_tokens);
                const user = payload.messages[1].content as string;
                const words: string[] = JSON.parse(
                    user.slice(user.indexOf("[")),
                );
                return completion(compactEntries(words));
            }),
        );

        const words = Array.from({ length: 50 }, (_, i) => `Wort${i}`);
        for (const reasoning of ["off", "auto"] as const) {
            await assessWords({
                words,
                apiKey: "test",
                model: "test/model",
                batchSize: 50,
                compact: true,
                reasoning,
            });
        }

        expect(sent[0]).toBe(50 * 22 + 512);
        expect(sent[1]).toBe(50 * (22 + 50) + 512);
    });

    it("wiederholt unbrauchbare Antworten nur einmal und teilt dann", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const requests: string[][] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: unknown, init: { body: string }) => {
                const payload = JSON.parse(init.body);
                const user = payload.messages[1].content as string;
                const words: string[] = JSON.parse(
                    user.slice(user.indexOf("[")),
                );
                requests.push(words);

                // Die ersten beiden Antworten sind unbrauchbar, danach passt es.
                if (requests.length <= 2) return completion("kein json");
                return completion(compactEntries(words));
            }),
        );

        try {
            const summary = await assessWords({
                words: ["Aaa", "Bbb", "Ccc", "Ddd"],
                apiKey: "test",
                model: "test/model",
                batchSize: 4,
                compact: true,
                maxRetries: 3,
            });

            // 2 Versuche mit 4 Wörtern, danach 2 Hälften — nicht 3 Versuche.
            expect(requests.map((words) => words.length)).toEqual([
                4, 4, 2, 2,
            ]);
            expect(summary.failedBatches).toBe(0);
            expect(summary.results).toHaveLength(4);
        } finally {
            warn.mockRestore();
        }
    });

    it("wiederholt abgeschnittene Antworten nicht", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        let calls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                calls++;
                return completion(compactEntries(["Haus"]), 200, "length");
            }),
        );

        try {
            await assessWords({
                words: ["Haus"],
                apiKey: "test",
                model: "test/model",
                compact: true,
                maxRetries: 3,
            });

            expect(calls).toBe(1);
        } finally {
            warn.mockRestore();
        }
    });

    it("meldet bei leerer Antwort das verbrauchte Reasoning-Budget", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        let calls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                calls++;
                return new Response(
                    JSON.stringify({
                        model: "test/model",
                        choices: [
                            {
                                message: { content: null, reasoning: "denkt…" },
                                finish_reason: "length",
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 1024,
                            total_tokens: 1034,
                            completion_tokens_details: {
                                reasoning_tokens: 900,
                            },
                        },
                    }),
                    {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    },
                );
            }),
        );

        try {
            const summary = await assessWords({
                words: ["Haus"],
                apiKey: "test",
                model: "test/model",
                maxRetries: 3,
            });

            // Abgeschnittene Antworten sind nicht wiederholbar.
            expect(calls).toBe(1);
            expect(summary.failedBatches).toBe(1);

            const message = String(warn.mock.calls[0]?.[0]);
            expect(message).toContain("finish_reason=length");
            expect(message).toContain("davon Reasoning=900");
            expect(message).toContain("--reasoning off");
        } finally {
            warn.mockRestore();
        }
    });
});

describe("selectQualityWords", () => {
    it("filtert nach Mindest-Score und Junk", () => {
        const results: WordQuality[] = [
            { ...QUALITY, word: "Haus", score: 95 },
            { ...QUALITY, word: "Hausierer", score: 70 },
            { ...QUALITY, word: "Xyzq", score: 90, junk: true },
        ];

        expect(selectQualityWords(results, { minScore: 80 })).toEqual(["Haus"]);
    });

    it("kann Eigennamen und Abkürzungen ausschließen", () => {
        const results: WordQuality[] = [
            { ...QUALITY, word: "Haus" },
            { ...QUALITY, word: "Müller", properNoun: true },
            { ...QUALITY, word: "z.B.", abbreviation: true },
        ];

        expect(selectQualityWords(results, { minScore: 80 })).toEqual([
            "Haus",
            "Müller",
            "z.B.",
        ]);
        expect(
            selectQualityWords(results, {
                minScore: 80,
                excludeProperNouns: true,
                excludeAbbreviations: true,
            }),
        ).toEqual(["Haus"]);
    });

    it("behält die Reihenfolge der Eingabe", () => {
        const results: WordQuality[] = [
            { ...QUALITY, word: "Zebra" },
            { ...QUALITY, word: "Aal" },
        ];

        expect(selectQualityWords(results, { minScore: 0 })).toEqual([
            "Zebra",
            "Aal",
        ]);
    });
});

describe("Qualitäts-Journal", () => {
    it("speichert Bewertungen inkrementell und lädt sie wieder", async () => {
        const dir = await mkdtemp(join(tmpdir(), "wortschatz-quality-"));
        const path = join(dir, "quality-test-model.jsonl");

        try {
            await ensureQualityJournal(path, "test/model");
            await appendQualityJournal(path, [QUALITY]);

            const loaded = await loadQualityJournal(path, "test/model");
            expect(loaded.get("Haus")).toEqual(QUALITY);

            await resetQualityJournal(path);
            expect((await loadQualityJournal(path, "test/model")).size).toBe(0);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("ignoriert Journale mit anderer Prompt-Version", async () => {
        const dir = await mkdtemp(join(tmpdir(), "wortschatz-quality-"));
        const path = join(dir, "quality-test-model.jsonl");

        try {
            await writeFile(
                path,
                `${JSON.stringify({ type: "header", promptVersion: 999, model: "test/model" })}\n${JSON.stringify(QUALITY)}\n`,
                "utf-8",
            );

            const loaded = await loadQualityJournal(path, "test/model");
            expect(loaded.size).toBe(0);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe("sanitizeModelId", () => {
    it("macht Modellnamen dateisystemtauglich", () => {
        expect(sanitizeModelId("openai/gpt-4o-mini")).toBe(
            "openai-gpt-4o-mini",
        );
        expect(sanitizeModelId("///")).toBe("model");
    });
});
