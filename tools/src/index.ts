import { Command } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exportWordlist } from "./pipeline/export.js";
import { mergeWordlists } from "./pipeline/merge.js";
import { normalizeToLowercase } from "./pipeline/normalize.js";
import { fetchDwds } from "./sources/dwds.js";
import { fetchHunspell } from "./sources/hunspell.js";
import { extractFromTexts } from "./sources/text-extraktor.js";
import { fetchWiktionary } from "./sources/wiktionary.js";

const CACHE_DIR = new URL("../cache/", import.meta.url).pathname;

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
    .action(async (options) => {
        await mkdir(CACHE_DIR, { recursive: true });

        const specific = options.hunspell || options.wiktionary || options.dwds;

        if (!specific || options.hunspell) {
            const words = await fetchHunspell();
            await saveCacheFile("hunspell.json", words);
        }

        if (!specific || options.wiktionary) {
            const words = await fetchWiktionary();
            await saveCacheFile("wiktionary.json", words);
        }

        if (!specific || options.dwds) {
            const words = await fetchDwds();
            await saveCacheFile("dwds.json", words);
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
    .description("Wortliste aus gecachten Daten zusammenbauen und exportieren")
    .action(async () => {
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

        if (sources.length === 0) {
            console.error(
                "\nKeine Quelldaten gefunden. Bitte zuerst 'fetch' oder 'extract' ausführen.",
            );
            process.exit(1);
        }

        console.log("");

        // Zusammenführen
        const merged = mergeWordlists(...sources);

        // Lowercase-Variante
        const lowercased = normalizeToLowercase(merged);

        // Exportieren
        console.log("");
        const statsOriginal = await exportWordlist(merged, "original");
        const statsLowercase = await exportWordlist(lowercased, "lowercase");

        console.log("\n========================================");
        console.log("  Wortschatz — Build abgeschlossen");
        console.log("========================================");
        console.log(
            `  Original:  ${statsOriginal.totalWords} Wörter in ${statsOriginal.files} Dateien`,
        );
        console.log(
            `  Lowercase: ${statsLowercase.totalWords} Wörter in ${statsLowercase.files} Dateien`,
        );
        console.log("========================================\n");
    });

// --- Hilfsfunktionen ---
async function saveCacheFile(filename: string, data: string[]): Promise<void> {
    const path = join(CACHE_DIR, filename);
    await writeFile(path, JSON.stringify(data), "utf-8");
    console.log(`  → Cache gespeichert: ${filename} (${data.length} Einträge)`);
}

async function loadCacheFile(filename: string): Promise<string[] | null> {
    try {
        const path = join(CACHE_DIR, filename);
        const content = await readFile(path, "utf-8");
        return JSON.parse(content) as string[];
    } catch {
        return null;
    }
}

program.parse();
