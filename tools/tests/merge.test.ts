import { describe, expect, it } from "vitest";
import { mergeWordlists } from "../src/pipeline/merge.js";

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
});
