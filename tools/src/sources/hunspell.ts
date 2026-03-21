import dictionary from "dictionary-de";

/**
 * Extrahiert deutsche Wörter aus dem Hunspell-Wörterbuch (dictionary-de).
 * Das dic-Format enthält Zeilen wie "Wort/Flags" — wir extrahieren nur das Wort.
 */
export async function fetchHunspell(): Promise<string[]> {
    console.log("[hunspell] Lade dictionary-de ...");

    const text = new TextDecoder("utf-8").decode(dictionary.dic);
    const lines = text.split("\n");

    const words: string[] = [];
    let firstLine = true;

    for (const line of lines) {
        // Erste Zeile ist die Wortanzahl
        if (firstLine) {
            firstLine = false;
            continue;
        }

        const trimmed = line.trim();
        if (!trimmed) continue;

        // Format: Wort/Flags oder nur Wort
        const slashIndex = trimmed.indexOf("/");
        const word = slashIndex >= 0 ? trimmed.slice(0, slashIndex) : trimmed;

        if (word && isValidWord(word)) {
            words.push(word);
        }
    }

    console.log(`[hunspell] ${words.length} Wörter extrahiert.`);
    return words;
}

function isValidWord(word: string): boolean {
    // Nur Wörter mit deutschen Buchstaben (inkl. Umlaute, ß)
    return /^[a-zA-ZäöüÄÖÜß]+$/.test(word);
}
