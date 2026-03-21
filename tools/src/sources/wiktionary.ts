const WIKTIONARY_API = "https://de.wiktionary.org/w/api.php";

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
        const response = await fetch(url);

        if (!response.ok) {
            console.warn(
                `[wiktionary] HTTP ${response.status} bei Batch ${batch}, überspringe...`,
            );
            break;
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

function isValidWord(word: string): boolean {
    // Nur einzelne Wörter mit deutschen Buchstaben
    return /^[a-zA-ZäöüÄÖÜß]+$/.test(word);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
