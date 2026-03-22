/**
 * Prüft ob ein Wort ein gültiges deutsches Wort ist.
 * Nur Buchstaben a-z, A-Z, Umlaute (ä, ö, ü, Ä, Ö, Ü), ß und ẞ erlaubt.
 */
const VALID_GERMAN_WORD = /^[a-zA-ZäöüÄÖÜßẞ]+$/;

export function isValidWord(word: string): boolean {
    return VALID_GERMAN_WORD.test(word);
}

/**
 * Prüft ob ein Wort ein gültiges deutsches Wort mit Mindestlänge ist.
 */
export function isValidWordMinLength(word: string, minLength = 2): boolean {
    return word.length >= minLength && isValidWord(word);
}
