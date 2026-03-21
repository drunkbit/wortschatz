/**
 * Teilt eine Wortliste nach Anfangsbuchstabe auf.
 *
 * Mapping:
 * - ä/Ä → ae
 * - ö/Ö → oe
 * - ü/Ü → ue
 * - a-z/A-Z → entsprechender Kleinbuchstabe
 */
export function splitByLetter(words: string[]): Map<string, string[]> {
    console.log("[split] Teile Wortliste nach Anfangsbuchstabe auf ...");

    const buckets = new Map<string, string[]>();

    for (const word of words) {
        const key = getBucketKey(word);
        if (!buckets.has(key)) {
            buckets.set(key, []);
        }
        buckets.get(key)!.push(word);
    }

    for (const [key, list] of buckets) {
        console.log(`[split]   ${key}: ${list.length} Wörter`);
    }

    return buckets;
}

function getBucketKey(word: string): string {
    const first = word[0].toLowerCase();

    switch (first) {
        case "ä":
            return "ae";
        case "ö":
            return "oe";
        case "ü":
            return "ue";
        default:
            return first;
    }
}
