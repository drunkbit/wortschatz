import { describe, expect, it } from "vitest";
import {
    normalizeCapitalized,
    normalizeNoUmlauts,
    normalizeNoUmlautsCapitalized,
    normalizeNoUmlautsLowercase,
    normalizeNoUmlautsUppercase,
    normalizeToLowercase,
    normalizeToUppercase,
} from "../src/pipeline/normalize.js";

describe("normalizeToLowercase", () => {
    it("konvertiert zu Kleinbuchstaben und dedupliziert", () => {
        const result = normalizeToLowercase(["Apfel", "APFEL", "apfel"]);
        expect(result).toEqual(["apfel"]);
    });
});

describe("normalizeToUppercase", () => {
    it("konvertiert zu Großbuchstaben und dedupliziert", () => {
        const result = normalizeToUppercase(["Apfel", "apfel"]);
        expect(result).toEqual(["APFEL"]);
    });
});

describe("normalizeNoUmlauts", () => {
    it("ersetzt Umlaute korrekt", () => {
        const result = normalizeNoUmlauts(["Ärger", "Öl", "Über", "Straße"]);
        expect(result).toContain("Aerger");
        expect(result).toContain("Oel");
        expect(result).toContain("Ueber");
        expect(result).toContain("Strasse");
    });

    it("ersetzt großes Eszett (ẞ) zu SS", () => {
        const result = normalizeNoUmlauts(["STRAẞE"]);
        expect(result).toContain("STRASSE");
    });
});

describe("normalizeNoUmlautsLowercase", () => {
    it("ersetzt Umlaute und konvertiert zu lowercase", () => {
        const result = normalizeNoUmlautsLowercase(["Ärger", "Über"]);
        expect(result).toContain("aerger");
        expect(result).toContain("ueber");
    });
});

describe("normalizeNoUmlautsUppercase", () => {
    it("ersetzt Umlaute und konvertiert zu uppercase", () => {
        const result = normalizeNoUmlautsUppercase(["ärger", "über"]);
        expect(result).toContain("AERGER");
        expect(result).toContain("UEBER");
    });
});

describe("normalizeNoUmlautsCapitalized", () => {
    it("ersetzt Umlaute und kapitalisiert", () => {
        const result = normalizeNoUmlautsCapitalized(["ärger"]);
        expect(result).toEqual(["Aerger"]);
    });
});

describe("normalizeCapitalized", () => {
    it("macht ersten Buchstaben groß, Rest klein", () => {
        const result = normalizeCapitalized(["APFEL", "birne"]);
        expect(result).toContain("Apfel");
        expect(result).toContain("Birne");
    });

    it("dedupliziert nach Kapitalisierung", () => {
        const result = normalizeCapitalized(["Apfel", "apfel", "APFEL"]);
        expect(result).toEqual(["Apfel"]);
    });
});
