import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { splitByLetter } from "./split.js";

const ROOT = new URL("../../../wortliste/", import.meta.url).pathname;

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
export async function exportWordlist(
    words: string[],
    variant: "original" | "lowercase",
): Promise<ExportStats> {
    const dir = join(ROOT, variant);
    console.log(`[export] Schreibe ${variant}-Variante nach ${dir} ...`);

    await mkdir(dir, { recursive: true });

    // Gesamtdatei
    await writeFile(join(dir, "_alle.txt"), words.join("\n") + "\n", "utf-8");

    // Nach Buchstabe aufgeteilt
    const buckets = splitByLetter(words);
    let fileCount = 1; // _alle.txt

    for (const [key, list] of buckets) {
        const filename = `${key}.txt`;
        await writeFile(join(dir, filename), list.join("\n") + "\n", "utf-8");
        fileCount++;
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
