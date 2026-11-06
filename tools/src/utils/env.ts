import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const TOOLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(TOOLS_DIR, "..");

/**
 * Kandidaten für .env-Dateien in absteigender Priorität: aktuelles
 * Arbeitsverzeichnis, tools/ und Projektstamm. Doppelte Pfade werden entfernt.
 */
export function defaultEnvPaths(): string[] {
    return [
        ...new Set([
            resolve(process.cwd(), ".env"),
            resolve(TOOLS_DIR, ".env"),
            resolve(REPO_ROOT, ".env"),
        ]),
    ];
}

/**
 * Lädt Variablen aus den vorhandenen .env-Dateien nach process.env.
 * Bereits gesetzte Umgebungsvariablen haben Vorrang, ebenso Werte aus
 * früheren Dateien der Liste.
 *
 * @returns die tatsächlich gelesenen Dateien.
 */
export function loadEnv(paths: string[] = defaultEnvPaths()): string[] {
    const existing = paths.filter((path) => existsSync(path));
    if (existing.length === 0) {
        return [];
    }

    config({ path: existing, quiet: true, override: false });
    return existing;
}
