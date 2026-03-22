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
import { join } from "node:path";
import { promisify } from "node:util";
import {
    type ExportStats,
    type ExportVariant,
    exportWordlist,
} from "./pipeline/export.js";
import { filterWordlist } from "./pipeline/filter.js";
import { mergeWordlists } from "./pipeline/merge.js";
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

const CACHE_DIR = new URL("../cache/", import.meta.url).pathname;
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
                await saveCacheFile("hunspell.json", words);
            }
        }

        if (!specific || options.wiktionary) {
            if (!options.force && (await isCacheFresh("wiktionary.json"))) {
                console.log(
                    "  wiktionary: Cache ist aktuell (übersprungen, --force zum Erzwingen)",
                );
            } else {
                const words = await fetchWiktionary();
                await saveCacheFile("wiktionary.json", words);
            }
        }

        if (!specific || options.dwds) {
            if (!options.force && (await isCacheFresh("dwds.json"))) {
                console.log(
                    "  dwds: Cache ist aktuell (übersprungen, --force zum Erzwingen)",
                );
            } else {
                const words = await fetchDwds();
                await saveCacheFile("dwds.json", words);
            }
        }

        console.log("\n✓ Fetch abgeschlossen. Daten im Cache gespeichert.");
    });

// --- extract: Eigene Texte verarbeiten ---
program
    .command("extract")
    .description("Wörter aus eigenen Texten (tools/input/) extrahieren")
    .action(async () => {
        await mkdir(CACHE_DIR, { recursive: true });

        const words = await extractFromTexts();
        await saveCacheFile("custom.json", words);

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

        const newWords = filtered.length - existing.length;
        if (!rebuild && existing.length > 0) {
            if (newWords === 0) {
                console.log(
                    "\n✓ Keine neuen Wörter gefunden. Wortliste ist aktuell.\n",
                );
                return;
            }
            console.log(`\n  +${newWords} neue Wörter gefunden.`);
        }

        if (dryRun) {
            console.log(
                `\n[dry-run] ${filtered.length} Wörter würden exportiert.`,
            );
            if (!rebuild && existing.length > 0) {
                console.log(`[dry-run] Davon +${newWords} neue Wörter.`);
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
        if (!rebuild && existing.length > 0) {
            console.log(`  Neu hinzugefügt: +${newWords} Wörter`);
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

// --- cache: Cache verwalten ---
program
    .command("cache")
    .description("Cache-Verzeichnis verwalten")
    .argument("<action>", "Aktion: 'clean' (alle Cache-Dateien löschen)")
    .action(async (action: string) => {
        if (action === "clean") {
            try {
                const files = await readdir(CACHE_DIR);
                const jsonFiles = files.filter((f) => f.endsWith(".json"));

                if (jsonFiles.length === 0) {
                    console.log("\n  Cache ist bereits leer.\n");
                    return;
                }

                for (const file of jsonFiles) {
                    await rm(join(CACHE_DIR, file));
                    console.log(`  Gelöscht: ${file}`);
                }

                console.log(
                    `\n✓ ${jsonFiles.length} Cache-Dateien gelöscht.\n`,
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
    const repoRoot = new URL("../../", import.meta.url).pathname;
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

const WORDLIST_DIR = new URL("../../wortliste/", import.meta.url).pathname;

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

program.parse();
