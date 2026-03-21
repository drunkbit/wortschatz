/**
 * Erstellt eine Lowercase-Variante der Wortliste.
 * Dedupliziert nach der Umwandlung und sortiert neu.
 */
export function normalizeToLowercase(words: string[]): string[] {
    console.log("[normalize] Erstelle Lowercase-Variante ...");

    const seen = new Set<string>();
    const lowercased: string[] = [];

    for (const word of words) {
        const lower = word.toLowerCase();
        if (!seen.has(lower)) {
            seen.add(lower);
            lowercased.push(lower);
        }
    }

    lowercased.sort((a, b) => a.localeCompare(b, "de"));

    console.log(`[normalize] ${lowercased.length} unique Lowercase-Wörter.`);
    return lowercased;
}
