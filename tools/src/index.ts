import { Command } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exportWordlist } from "./pipeline/export.js";
import { mergeWordlists } from "./pipeline/merge.js";
import {
    normalizeCapitalized,
    normalizeNoUmlauts,
    normalizeNoUmlautsLowercase,
    normalizeToLowercase,
    normalizeToUppercase,
} from "./pipeline/normalize.js";
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
    .description(
        "Wortliste aus gecachten Daten zusammenbauen und exportieren.\n" +
            "Ohne Flags werden nur neue Wörter zur bestehenden Liste ergänzt.\n" +
            "Mit --rebuild wird die Wortliste komplett neu erstellt.",
    )
    .option(
        "--rebuild",
        "Wortliste komplett neu erstellen (statt nur zu ergänzen)",
    )
    .action(async (options) => {
        const rebuild = !!options.rebuild;

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

        const newWords = merged.length - existing.length;
        if (!rebuild && existing.length > 0) {
            if (newWords === 0) {
                console.log(
                    "\n✓ Keine neuen Wörter gefunden. Wortliste ist aktuell.\n",
                );
                return;
            }
            console.log(`\n  +${newWords} neue Wörter gefunden.`);
        }

        // Varianten erstellen
        const lowercased = normalizeToLowercase(merged);
        const uppercased = normalizeToUppercase(merged);
        const noUmlauts = normalizeNoUmlauts(merged);
        const noUmlautsLower = normalizeNoUmlautsLowercase(merged);
        const capitalized = normalizeCapitalized(merged);

        // Exportieren
        console.log("");
        const allStats = [
            await exportWordlist(merged, "original"),
            await exportWordlist(lowercased, "lowercase"),
            await exportWordlist(uppercased, "uppercase"),
            await exportWordlist(noUmlauts, "no-umlauts"),
            await exportWordlist(noUmlautsLower, "no-umlauts-lowercase"),
            await exportWordlist(capitalized, "capitalized"),
        ];

        console.log("\n========================================");
        console.log(
            rebuild
                ? "  Wortschatz — Neuaufbau abgeschlossen"
                : "  Wortschatz — Aktualisierung abgeschlossen",
        );
        console.log("========================================");
        for (const stats of allStats) {
            const label = stats.variant.padEnd(22);
            console.log(
                `  ${label} ${stats.totalWords} Wörter in ${stats.files} Dateien`,
            );
        }
        if (!rebuild && existing.length > 0) {
            console.log(`  Neu hinzugefügt: +${newWords} Wörter`);
        }
        console.log("========================================\n");
    });

// --- Hilfsfunktionen ---

const WORDLIST_DIR = new URL("../../wortliste/", import.meta.url).pathname;

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
    try {
        const path = join(CACHE_DIR, filename);
        const content = await readFile(path, "utf-8");
        return JSON.parse(content) as string[];
    } catch {
        return null;
    }
}

program.parse();
