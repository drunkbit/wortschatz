import { describe, expect, it } from "vitest";
import { splitByLetter } from "../src/pipeline/split.js";

describe("splitByLetter", () => {
    it("teilt Wörter nach Anfangsbuchstabe auf", () => {
        const result = splitByLetter(["Apfel", "Birne", "Ananas"]);
        expect(result.get("a")).toEqual(["Apfel", "Ananas"]);
        expect(result.get("b")).toEqual(["Birne"]);
    });

    it("mappt Umlaute korrekt", () => {
        const result = splitByLetter(["Ärger", "Öl", "Über"]);
        expect(result.get("ae")).toEqual(["Ärger"]);
        expect(result.get("oe")).toEqual(["Öl"]);
        expect(result.get("ue")).toEqual(["Über"]);
    });

    it("mappt ß und ẞ in Bucket 's'", () => {
        const words = ["ßtest"];
        const result = splitByLetter(words);
        expect(result.get("s")).toEqual(["ßtest"]);
    });

    it("gibt leere Map bei leerem Input", () => {
        const result = splitByLetter([]);
        expect(result.size).toBe(0);
    });
});
