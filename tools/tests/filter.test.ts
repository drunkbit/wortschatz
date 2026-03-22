import { describe, expect, it } from "vitest";
import { filterWordlist } from "../src/pipeline/filter.js";

describe("filterWordlist", () => {
    it("behält gültige deutsche Wörter", () => {
        const result = filterWordlist(["Hallo", "Welt", "Übermütig", "straße"]);
        expect(result).toEqual(["Hallo", "Welt", "Übermütig", "straße"]);
    });

    it("entfernt Wörter mit ≤2 Zeichen", () => {
        const result = filterWordlist(["ab", "cd", "Hallo", "zu"]);
        expect(result).toEqual(["Hallo"]);
    });

    it("entfernt reine Großbuchstaben-Wörter", () => {
        const result = filterWordlist(["ABC", "HALLO", "ÄÖÜ", "Hallo"]);
        expect(result).toEqual(["Hallo"]);
    });

    it("entfernt Wörter mit Zahlen oder Sonderzeichen", () => {
        const result = filterWordlist([
            "Hallo",
            "abc123",
            "test-wort",
            "gut.so",
            "ok@de",
        ]);
        expect(result).toEqual(["Hallo"]);
    });

    it("akzeptiert Wörter mit ẞ (großes Eszett)", () => {
        const result = filterWordlist(["Straẞe", "Hallo"]);
        expect(result).toEqual(["Straẞe", "Hallo"]);
    });

    it("gibt leeres Array bei leerem Input", () => {
        const result = filterWordlist([]);
        expect(result).toEqual([]);
    });
});
