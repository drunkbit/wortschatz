/**
 * Führt Wortlisten aus verschiedenen Quellen zusammen.
 * Normalisiert die Wörter auf Unicode NFC, dedupliziert case-sensitive
 * (Originalschreibung bleibt erhalten) und sortiert alphabetisch mit
 * deutscher Locale.
 */
export function mergeWordlists(...lists: string[][]): string[] {
    console.log("[merge] Führe Wortlisten zusammen ...");

    const seen = new Set<string>();
    const merged: string[] = [];

    for (const list of lists) {
        for (const word of list) {
            // NFC verhindert, dass dieselben Wörter in unterschiedlichen
            // Unicode-Normalformen (z. B. aus macOS-Texten) doppelt landen.
            const normalized = word.normalize("NFC");
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            merged.push(normalized);
        }
    }

    // Alphabetisch sortieren mit deutscher Locale
    merged.sort((a, b) => a.localeCompare(b, "de"));

    console.log(`[merge] ${merged.length} unique Wörter nach Zusammenführung.`);
    return merged;
}

export interface WordlistDiff {
    added: string[];
    removed: string[];
}

/**
 * Vergleicht zwei Wortlisten und liefert die tatsächlich hinzugekommenen
 * und entfernten Wörter. Ein Vergleich der reinen Wortanzahl reicht nicht,
 * da sich hinzugefügte und entfernte Wörter gegenseitig aufheben können.
 */
export function diffWordlists(
    before: string[],
    after: string[],
): WordlistDiff {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);

    return {
        added: after.filter((word) => !beforeSet.has(word)),
        removed: before.filter((word) => !afterSet.has(word)),
    };
}
