import { parallelMap, sleep } from "../utils/async.js";
import { isValidWord } from "../utils/validation.js";

/**
 * Extrahiert Wörter aus den öffentlich verfügbaren DWDS-Wortlisten.
 *
 * DWDS (Digitales Wörterbuch der deutschen Sprache) stellt
 * verschiedene Wortlisten bereit. Wir verwenden die frei
 * zugängliche Basisliste.
 */

const DWDS_WORDLIST_URL =
    "https://www.dwds.de/lemma/list?corpus=kern&limit=0&format=text";
const USER_AGENT =
    "wortschatz-tools/1.0 (https://github.com/drunkbit/wortschatz)";

export async function fetchDwds(): Promise<string[]> {
    console.log("[dwds] Lade DWDS-Wortliste ...");

    try {
        const response = await fetch(DWDS_WORDLIST_URL, {
            headers: { "User-Agent": USER_AGENT },
        });

        if (!response.ok) {
            console.warn(
                `[dwds] HTTP ${response.status} — Versuche alternative Methode...`,
            );
            return await fetchDwdsAlternative();
        }

        const text = await response.text();
        const words = text
            .split("\n")
            .map((line) => line.trim())
            .filter((word) => word && isValidWord(word));

        console.log(`[dwds] ${words.length} Wörter extrahiert.`);
        return words;
    } catch (error) {
        console.warn(`[dwds] Fehler beim Abrufen: ${error}`);
        console.log("[dwds] Versuche alternative Methode...");
        return await fetchDwdsAlternative();
    }
}

/**
 * Alternative Methode: DWDS-Wörterbuch-API mit alphabetischer Abfrage.
 * Falls die direkte Wortliste nicht verfügbar ist.
 * Nutzt begrenzte Parallelität (3 gleichzeitige Requests).
 */
async function fetchDwdsAlternative(): Promise<string[]> {
    console.log("[dwds] Verwende DWDS-API (alphabetisch, parallel) ...");

    const prefixes = "abcdefghijklmnopqrstuvwxyzäöü".split("");

    const results = await parallelMap(prefixes, 3, async (prefix) => {
        try {
            const url = `https://www.dwds.de/api/wb/list?q=${encodeURIComponent(prefix)}*&limit=10000`;
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT },
            });

            if (!response.ok) return [];

            const data = (await response.json()) as string[];
            const valid = data.filter((word) => isValidWord(word));

            console.log(`[dwds]   ${prefix}: ${data.length} Einträge`);
            await sleep(100);
            return valid;
        } catch {
            console.warn(`[dwds]   ${prefix}: Fehler, überspringe...`);
            return [];
        }
    });

    const allWords = results.flat();
    console.log(`[dwds] ${allWords.length} Wörter extrahiert (alternativ).`);
    return allWords;
}
