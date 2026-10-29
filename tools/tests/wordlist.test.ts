import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { splitByLetter } from "../src/pipeline/split.js";
import { isValidWord } from "../src/utils/validation.js";

const ROOT = fileURLToPath(new URL("../../wortliste/", import.meta.url));

const VARIANTS = [
    "original",
    "lowercase",
    "uppercase",
    "capitalized",
    "no-umlauts",
    "no-umlauts-lowercase",
    "no-umlauts-uppercase",
    "no-umlauts-capitalized",
] as const;

async function readWords(dir: string, file: string): Promise<string[]> {
    const content = await readFile(join(dir, file), "utf-8");
    return content.split("\n").filter((line) => line.length > 0);
}

describe("eingecheckte Wortliste", () => {
    it.each(VARIANTS)(
        "%s: _alle.txt ist sortiert, eindeutig und gültig",
        async (variant) => {
            const words = await readWords(join(ROOT, variant), "_alle.txt");

            expect(words.length).toBeGreaterThan(0);
            expect(new Set(words).size).toBe(words.length);
            expect(
                words.every((word) => word.length > 2 && isValidWord(word)),
            ).toBe(true);

            const sorted = [...words].sort((a, b) =>
                a.localeCompare(b, "de"),
            );
            expect(words).toEqual(sorted);
        },
    );

    it.each(VARIANTS)(
        "%s: Buchstaben-Dateien entsprechen _alle.txt",
        async (variant) => {
            const dir = join(ROOT, variant);
            const words = await readWords(dir, "_alle.txt");
            const buckets = splitByLetter(words);

            const expectedFiles = [...buckets.keys()]
                .map((key) => `${key}.txt`)
                .sort();
            const actualFiles = (await readdir(dir))
                .filter((file) => file.endsWith(".txt") && file !== "_alle.txt")
                .sort();

            expect(actualFiles).toEqual(expectedFiles);

            for (const [key, list] of buckets) {
                expect(await readWords(dir, `${key}.txt`)).toEqual(list);
            }
        },
    );
});
