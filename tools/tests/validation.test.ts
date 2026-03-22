import { describe, expect, it } from "vitest";
import { isValidWord, isValidWordMinLength } from "../src/utils/validation.js";

describe("isValidWord", () => {
    it("akzeptiert normale deutsche Wörter", () => {
        expect(isValidWord("Hallo")).toBe(true);
        expect(isValidWord("welt")).toBe(true);
        expect(isValidWord("Straße")).toBe(true);
    });

    it("akzeptiert Umlaute", () => {
        expect(isValidWord("Ärger")).toBe(true);
        expect(isValidWord("Öl")).toBe(true);
        expect(isValidWord("Über")).toBe(true);
        expect(isValidWord("äöüÄÖÜ")).toBe(true);
    });

    it("akzeptiert großes Eszett (ẞ)", () => {
        expect(isValidWord("STRAẞE")).toBe(true);
    });

    it("lehnt Wörter mit Zahlen ab", () => {
        expect(isValidWord("abc123")).toBe(false);
    });

    it("lehnt Wörter mit Sonderzeichen ab", () => {
        expect(isValidWord("test-wort")).toBe(false);
        expect(isValidWord("gut.so")).toBe(false);
        expect(isValidWord("hallo!")).toBe(false);
        expect(isValidWord("a b")).toBe(false);
    });

    it("lehnt leere Strings ab", () => {
        expect(isValidWord("")).toBe(false);
    });
});

describe("isValidWordMinLength", () => {
    it("prüft Mindestlänge", () => {
        expect(isValidWordMinLength("ab", 2)).toBe(true);
        expect(isValidWordMinLength("a", 2)).toBe(false);
    });

    it("verwendet Standard-Mindestlänge 2", () => {
        expect(isValidWordMinLength("ab")).toBe(true);
        expect(isValidWordMinLength("a")).toBe(false);
    });

    it("prüft auch Zeichen-Gültigkeit", () => {
        expect(isValidWordMinLength("abc123")).toBe(false);
    });
});
