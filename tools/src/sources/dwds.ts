/**
 * Extrahiert Wörter aus den öffentlich verfügbaren DWDS-Wortlisten.
 *
 * DWDS (Digitales Wörterbuch der deutschen Sprache) stellt
 * verschiedene Wortlisten bereit. Wir verwenden die frei
 * zugängliche Basisliste.
 */

const DWDS_WORDLIST_URL =
    "https://www.dwds.de/lemma/list?corpus=kern&limit=0&format=text";

export async function fetchDwds(): Promise<string[]> {
    console.log("[dwds] Lade DWDS-Wortliste ...");

    try {
        const response = await fetch(DWDS_WORDLIST_URL);

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
 */
async function fetchDwdsAlternative(): Promise<string[]> {
    console.log("[dwds] Verwende DWDS-API (alphabetisch) ...");

    const allWords: string[] = [];
    const prefixes = "abcdefghijklmnopqrstuvwxyzäöü".split("");

    for (const prefix of prefixes) {
        try {
            const url = `https://www.dwds.de/api/wb/list?q=${encodeURIComponent(prefix)}*&limit=10000`;
            const response = await fetch(url);

            if (!response.ok) continue;

            const data = (await response.json()) as string[];
            for (const word of data) {
                if (isValidWord(word)) {
                    allWords.push(word);
                }
            }

            console.log(`[dwds]   ${prefix}: ${data.length} Einträge`);
            await sleep(200);
        } catch {
            console.warn(`[dwds]   ${prefix}: Fehler, überspringe...`);
        }
    }

    console.log(`[dwds] ${allWords.length} Wörter extrahiert (alternativ).`);
    return allWords;
}

function isValidWord(word: string): boolean {
    return /^[a-zA-ZäöüÄÖÜß]+$/.test(word);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
