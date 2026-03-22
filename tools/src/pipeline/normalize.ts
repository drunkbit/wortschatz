/**
 * Erstellt eine Lowercase-Variante der Wortliste.
 * Dedupliziert nach der Umwandlung und sortiert neu.
 */
export function normalizeToLowercase(words: string[]): string[] {
    return deduplicateAndSort("[normalize:lowercase]", words, (w) =>
        w.toLowerCase(),
    );
}

/**
 * Erstellt eine Uppercase-Variante der Wortliste.
 */
export function normalizeToUppercase(words: string[]): string[] {
    return deduplicateAndSort("[normalize:uppercase]", words, (w) =>
        w.toUpperCase(),
    );
}

/**
 * Erstellt eine Variante ohne Umlaute (ä→ae, ö→oe, ü→ue, ß→ss).
 * Originalschreibung (Groß-/Kleinschreibung) bleibt erhalten.
 */
export function normalizeNoUmlauts(words: string[]): string[] {
    return deduplicateAndSort("[normalize:no-umlauts]", words, replaceUmlauts);
}

/**
 * Erstellt eine Variante ohne Umlaute + lowercase.
 */
export function normalizeNoUmlautsLowercase(words: string[]): string[] {
    return deduplicateAndSort("[normalize:no-umlauts-lowercase]", words, (w) =>
        replaceUmlauts(w).toLowerCase(),
    );
}

/**
 * Erstellt eine Variante ohne Umlaute + erster Buchstabe groß, Rest klein.
 */
export function normalizeNoUmlautsCapitalized(words: string[]): string[] {
    return deduplicateAndSort(
        "[normalize:no-umlauts-capitalized]",
        words,
        (w) => {
            const replaced = replaceUmlauts(w);
            return (
                replaced.charAt(0).toUpperCase() +
                replaced.slice(1).toLowerCase()
            );
        },
    );
}

/**
 * Erstellt eine Variante ohne Umlaute + uppercase.
 */
export function normalizeNoUmlautsUppercase(words: string[]): string[] {
    return deduplicateAndSort("[normalize:no-umlauts-uppercase]", words, (w) =>
        replaceUmlauts(w).toUpperCase(),
    );
}

/**
 * Erstellt eine Variante mit erstem Buchstaben groß, Rest klein.
 */
export function normalizeCapitalized(words: string[]): string[] {
    return deduplicateAndSort(
        "[normalize:capitalized]",
        words,
        (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    );
}

// --- Hilfsfunktionen ---

function replaceUmlauts(word: string): string {
    return word
        .replace(/Ä/g, "Ae")
        .replace(/ä/g, "ae")
        .replace(/Ö/g, "Oe")
        .replace(/ö/g, "oe")
        .replace(/Ü/g, "Ue")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss");
}

function deduplicateAndSort(
    label: string,
    words: string[],
    transform: (word: string) => string,
): string[] {
    console.log(`${label} Erstelle Variante ...`);

    const seen = new Set<string>();
    const result: string[] = [];

    for (const word of words) {
        const transformed = transform(word);
        if (!seen.has(transformed)) {
            seen.add(transformed);
            result.push(transformed);
        }
    }

    result.sort((a, b) => a.localeCompare(b, "de"));

    console.log(`${label} ${result.length} unique Wörter.`);
    return result;
}
