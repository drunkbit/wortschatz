import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const INPUT_DIR = new URL("../../input/", import.meta.url).pathname;

/**
 * Extrahiert einzelne Wörter aus Fließtexten im input/-Verzeichnis.
 *
 * Liest alle .txt-Dateien aus tools/input/, tokenisiert den Text
 * (trennt an Whitespace und Satzzeichen), behält nur gültige
 * deutsche Wörter und dedupliziert.
 */
export async function extractFromTexts(): Promise<string[]> {
    console.log(`[text-extraktor] Lese Texte aus ${INPUT_DIR} ...`);

    let files: string[];
    try {
        files = await readdir(INPUT_DIR);
    } catch {
        console.log(
            "[text-extraktor] Input-Verzeichnis nicht gefunden oder leer.",
        );
        return [];
    }

    const txtFiles = files.filter((f) => f.endsWith(".txt"));

    if (txtFiles.length === 0) {
        console.log("[text-extraktor] Keine .txt-Dateien in input/ gefunden.");
        return [];
    }

    const wordSet = new Set<string>();

    for (const file of txtFiles) {
        const content = await readFile(join(INPUT_DIR, file), "utf-8");
        const tokens = tokenize(content);

        for (const token of tokens) {
            if (isValidWord(token)) {
                wordSet.add(token);
            }
        }

        console.log(
            `[text-extraktor]   ${file}: ${tokens.length} Tokens gefunden`,
        );
    }

    const words = [...wordSet];
    console.log(
        `[text-extraktor] ${words.length} unique Wörter aus ${txtFiles.length} Dateien extrahiert.`,
    );
    return words;
}

/**
 * Tokenisiert Fließtext in einzelne Wörter.
 * Trennt an Whitespace, Satzzeichen, Klammern, Anführungszeichen etc.
 * Zusätzlich werden camelCase-Wörter an Großbuchstaben-Grenzen getrennt,
 * z.B. "warHeute" → ["war", "Heute"].
 */
function tokenize(text: string): string[] {
    return text
        .split(/[\s,.\-;:!?()[\]{}"'«»„"‚'·/\\|@#$%^&*+=<>~`_0-9]+/)
        .filter((t) => t.length > 0)
        .flatMap(splitCamelCase);
}

/**
 * Trennt ein Wort an camelCase-Grenzen (Kleinbuchstabe gefolgt von Großbuchstabe).
 * "warHeute" → ["war", "Heute"]
 * "WarHeute" → ["War", "Heute"]
 */
function splitCamelCase(word: string): string[] {
    return word.split(/(?<=[a-zäöüß])(?=[A-ZÄÖÜ])/).filter((t) => t.length > 0);
}

function isValidWord(word: string): boolean {
    // Mindestens 2 Zeichen, nur deutsche Buchstaben
    return word.length >= 2 && /^[a-zA-ZäöüÄÖÜß]+$/.test(word);
}
