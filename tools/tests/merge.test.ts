import { describe, expect, it } from "vitest";
import { diffWordlists, mergeWordlists } from "../src/pipeline/merge.js";

describe("mergeWordlists", () => {
    it("führt Listen zusammen und dedupliziert", () => {
        const result = mergeWordlists(["Apfel", "Birne"], ["Birne", "Kirsche"]);
        expect(result).toContain("Apfel");
        expect(result).toContain("Birne");
        expect(result).toContain("Kirsche");
        expect(result).toHaveLength(3);
    });

    it("sortiert alphabetisch mit deutscher Locale", () => {
        const result = mergeWordlists(["Zebra", "Apfel", "Öl"]);
        expect(result[0]).toBe("Apfel");
        expect(result[result.length - 1]).toBe("Zebra");
    });

    it("ist case-sensitive bei Deduplizierung", () => {
        const result = mergeWordlists(["apfel", "Apfel"]);
        expect(result).toHaveLength(2);
    });

    it("gibt leeres Array bei leerem Input", () => {
        const result = mergeWordlists([], []);
        expect(result).toEqual([]);
    });

    it("normalisiert Unicode auf NFC und dedupliziert dabei", () => {
        // NFD-Schreibweise von "Über" (U + Trema) und NFC-Schreibweise
        const decomposed = "U\u0308ber";
        const composed = "Über";

        const result = mergeWordlists([decomposed], [composed]);

        expect(result).toEqual([composed]);
        expect(result[0].normalize("NFC")).toBe(result[0]);
    });
});

describe("diffWordlists", () => {
    it("erkennt hinzugefügte und entfernte Wörter unabhängig von der Anzahl", () => {
        const result = diffWordlists(
            ["Apfel", "Birne", "Ungültig1"],
            ["Apfel", "Kirsche", "Ungültig1"],
        );

        expect(result.added).toEqual(["Kirsche"]);
        expect(result.removed).toEqual(["Birne"]);
    });

    it("meldet keine Änderung bei identischen Listen", () => {
        const result = diffWordlists(["Apfel"], ["Apfel"]);
        expect(result.added).toEqual([]);
        expect(result.removed).toEqual([]);
    });
});
