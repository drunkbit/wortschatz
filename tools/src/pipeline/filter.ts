import { isValidWord } from "../utils/validation.js";

/**
 * Filtert ungültige Wörter aus der Wortliste.
 *
 * Regeln:
 * - Muss länger als 2 Zeichen sein
 * - Darf nicht nur aus Großbuchstaben bestehen
 * - Nur Buchstaben a-z, A-Z, ä, ö, ü, Ä, Ö, Ü, ß, ẞ erlaubt
 *   (keine Zahlen, Bindestriche, Punkte oder sonstige Zeichen)
 */

const ALL_UPPERCASE = /^[A-ZÄÖÜẞ]+$/;

export function filterWordlist(words: string[]): string[] {
    console.log(`[filter] Filtere Wortliste (${words.length} Wörter) ...`);

    const result: string[] = [];
    let removed = 0;

    for (const word of words) {
        if (word.length <= 2) {
            removed++;
            continue;
        }

        if (ALL_UPPERCASE.test(word)) {
            removed++;
            continue;
        }

        if (!isValidWord(word)) {
            removed++;
            continue;
        }

        result.push(word);
    }

    console.log(
        `[filter] ${removed} Wörter entfernt, ${result.length} behalten.`,
    );
    return result;
}
