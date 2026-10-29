import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitByLetter } from "./split.js";

const ROOT = fileURLToPath(new URL("../../../wortliste/", import.meta.url));

function formatWordlist(words: string[]): string {
    return words.length > 0 ? `${words.join("\n")}\n` : "";
}

export interface ExportStats {
    variant: string;
    totalWords: number;
    files: number;
}

/**
 * Exportiert eine Wortliste in das Zielverzeichnis.
 * Erstellt:
 *   - _alle.txt  (Gesamtliste)
 *   - {buchstabe}.txt (pro Buchstabe)
 *   - ae.txt, oe.txt, ue.txt (für Umlaute)
 */
export type ExportVariant =
    | "original"
    | "lowercase"
    | "uppercase"
    | "no-umlauts"
    | "no-umlauts-lowercase"
    | "no-umlauts-capitalized"
    | "no-umlauts-uppercase"
    | "capitalized";

export async function exportWordlist(
    words: string[],
    variant: ExportVariant,
): Promise<ExportStats> {
    const dir = join(ROOT, variant);
    console.log(`[export] Schreibe ${variant}-Variante nach ${dir} ...`);

    await mkdir(dir, { recursive: true });

    // Gesamtdatei
    await writeFile(join(dir, "_alle.txt"), formatWordlist(words), "utf-8");

    // Nach Buchstabe aufgeteilt (parallel schreiben)
    const buckets = splitByLetter(words);
    const expectedFiles = new Set(["_alle.txt"]);
    let fileCount = 1; // _alle.txt

    const writes = [...buckets].map(([key, list]) => {
        fileCount++;
        expectedFiles.add(`${key}.txt`);
        return writeFile(join(dir, `${key}.txt`), formatWordlist(list), "utf-8");
    });
    await Promise.all(writes);

    // Veraltete Bucket-Dateien entfernen, damit keine Wörter aus früheren
    // Läufen zurückbleiben (z. B. wenn ein Buchstabe keine Wörter mehr hat).
    for (const file of await readdir(dir)) {
        if (file.endsWith(".txt") && !expectedFiles.has(file)) {
            await rm(join(dir, file));
            console.log(`[export] ${variant}: veraltete Datei ${file} entfernt.`);
        }
    }

    console.log(
        `[export] ${variant}: ${words.length} Wörter in ${fileCount} Dateien geschrieben.`,
    );

    return {
        variant,
        totalWords: words.length,
        files: fileCount,
    };
}
