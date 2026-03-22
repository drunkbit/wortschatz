import { sleep } from "../utils/async.js";
import { isValidWord } from "../utils/validation.js";

const WIKTIONARY_API = "https://de.wiktionary.org/w/api.php";
const USER_AGENT =
    "wortschatz-tools/1.0 (https://github.com/drunkbit/wortschatz)";
const MAX_RETRIES = 3;

/**
 * Extrahiert deutsche Wörter aus dem deutschsprachigen Wiktionary
 * über die MediaWiki API (Kategorie: Deutsch).
 *
 * Nutzt die API-Aktion "categorymembers" um Seitentitel
 * aus der Kategorie "Deutsch (Wort)" abzurufen.
 */
export async function fetchWiktionary(): Promise<string[]> {
    console.log("[wiktionary] Lade Wörter aus de.wiktionary.org ...");

    const allWords: string[] = [];
    let cmcontinue: string | undefined;
    let batch = 0;

    do {
        batch++;
        const params = new URLSearchParams({
            action: "query",
            list: "categorymembers",
            cmtitle: "Kategorie:Deutsch",
            cmlimit: "500",
            cmnamespace: "0",
            cmtype: "page",
            format: "json",
        });

        if (cmcontinue) {
            params.set("cmcontinue", cmcontinue);
        }

        const url = `${WIKTIONARY_API}?${params}`;

        let response: Response | null = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                response = await fetch(url, {
                    headers: { "User-Agent": USER_AGENT },
                });
                if (response.ok) break;
                console.warn(
                    `[wiktionary] HTTP ${response.status} bei Batch ${batch} (Versuch ${attempt}/${MAX_RETRIES})`,
                );
            } catch (error) {
                console.warn(
                    `[wiktionary] Fehler bei Batch ${batch} (Versuch ${attempt}/${MAX_RETRIES}): ${error}`,
                );
            }
            if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
        }

        if (!response?.ok) {
            console.warn(
                `[wiktionary] Batch ${batch} fehlgeschlagen nach ${MAX_RETRIES} Versuchen, überspringe...`,
            );
            continue;
        }

        const data = (await response.json()) as WiktionaryResponse;

        const members = data.query?.categorymembers ?? [];
        for (const member of members) {
            const title = member.title?.trim();
            if (title && isValidWord(title)) {
                allWords.push(title);
            }
        }

        cmcontinue = data.continue?.cmcontinue;

        if (batch % 20 === 0) {
            console.log(
                `[wiktionary]   ... ${allWords.length} Wörter (Batch ${batch})`,
            );
        }

        // Kleine Pause um die API nicht zu überlasten
        await sleep(100);
    } while (cmcontinue);

    console.log(`[wiktionary] ${allWords.length} Wörter extrahiert.`);
    return allWords;
}

interface WiktionaryResponse {
    query?: {
        categorymembers?: Array<{ title?: string }>;
    };
    continue?: {
        cmcontinue?: string;
    };
}
