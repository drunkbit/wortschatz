import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultEnvPaths, loadEnv } from "../src/utils/env.js";

const createdDirs: string[] = [];
const touchedKeys: string[] = [];

async function writeEnvFile(content: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "wortschatz-env-"));
    createdDirs.push(dir);
    const file = join(dir, ".env");
    await writeFile(file, content, "utf8");
    return file;
}

function resetKey(key: string): string {
    touchedKeys.push(key);
    delete process.env[key];
    return key;
}

afterEach(async () => {
    for (const key of touchedKeys.splice(0)) {
        delete process.env[key];
    }
    await Promise.all(
        createdDirs
            .splice(0)
            .map((dir) => rm(dir, { recursive: true, force: true })),
    );
});

describe("loadEnv", () => {
    it("lädt Variablen aus einer .env-Datei", async () => {
        const key = resetKey("WORTSCHATZ_TEST_KEY");
        const file = await writeEnvFile(`${key}=sk-or-test\n`);

        expect(loadEnv([file])).toEqual([file]);
        expect(process.env[key]).toBe("sk-or-test");
    });

    it("überschreibt bereits gesetzte Umgebungsvariablen nicht", async () => {
        const key = resetKey("WORTSCHATZ_TEST_EXISTING");
        process.env[key] = "aus-der-umgebung";
        const file = await writeEnvFile(`${key}=aus-der-datei\n`);

        loadEnv([file]);
        expect(process.env[key]).toBe("aus-der-umgebung");
    });

    it("lässt Werte aus der ersten Datei Vorrang", async () => {
        const key = resetKey("WORTSCHATZ_TEST_ORDER");
        const first = await writeEnvFile(`${key}=erste\n`);
        const second = await writeEnvFile(`${key}=zweite\n`);

        loadEnv([first, second]);
        expect(process.env[key]).toBe("erste");
    });

    it("ergänzt Werte aus mehreren Dateien", async () => {
        const keyA = resetKey("WORTSCHATZ_TEST_A");
        const keyB = resetKey("WORTSCHATZ_TEST_B");
        const first = await writeEnvFile(`${keyA}=a\n`);
        const second = await writeEnvFile(`${keyB}=b\n`);

        loadEnv([first, second]);
        expect(process.env[keyA]).toBe("a");
        expect(process.env[keyB]).toBe("b");
    });

    it("ignoriert fehlende Dateien", () => {
        expect(loadEnv([join(tmpdir(), "wortschatz-env-missing", ".env")])).toEqual([]);
    });

    it("liefert tools/.env und die .env im Projektstamm als Kandidaten", () => {
        const candidates = defaultEnvPaths();
        expect(candidates.some((path) => path.endsWith("/tools/.env"))).toBe(true);
        expect(new Set(candidates).size).toBe(candidates.length);
    });
});
