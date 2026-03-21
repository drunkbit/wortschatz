/**
 * Führt Wortlisten aus verschiedenen Quellen zusammen.
 * Dedupliziert case-sensitive (Originalschreibung bleibt erhalten).
 * Sortiert alphabetisch mit deutscher Locale.
 */
export function mergeWordlists(...lists: string[][]): string[] {
    console.log("[merge] Führe Wortlisten zusammen ...");

    const seen = new Set<string>();
    const merged: string[] = [];

    for (const list of lists) {
        for (const word of list) {
            if (!seen.has(word)) {
                seen.add(word);
                merged.push(word);
            }
        }
    }

    // Alphabetisch sortieren mit deutscher Locale
    merged.sort((a, b) => a.localeCompare(b, "de"));

    console.log(`[merge] ${merged.length} unique Wörter nach Zusammenführung.`);
    return merged;
}
