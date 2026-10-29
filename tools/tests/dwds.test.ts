import { afterEach, describe, expect, it, vi } from "vitest";

// Netzwerk und Pausen entfernen, damit die Tests lokal und schnell laufen.
vi.mock("../src/utils/async.js", () => ({
    sleep: () => Promise.resolve(),
    parallelMap: async <T, R>(
        items: T[],
        _concurrency: number,
        fn: (item: T) => Promise<R>,
    ): Promise<R[]> => Promise.all(items.map(fn)),
}));

import { fetchDwds } from "../src/sources/dwds.js";

function textResponse(body: string, contentType: string, status = 200) {
    return new Response(body, {
        status,
        headers: { "content-type": contentType },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchDwds", () => {
    it("liest eine text/plain-Wortliste", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                textResponse("Haus\nBaum\n123\n", "text/plain; charset=utf-8"),
            ),
        );

        await expect(fetchDwds()).resolves.toEqual(["Haus", "Baum"]);
    });

    it("verwirft HTML-Antworten und nutzt die alternative API", async () => {
        const fetchMock = vi.fn(async (input: string | URL) => {
            const url = String(input);
            if (url.includes("/lemma/list")) {
                return textResponse("<!DOCTYPE html><html></html>", "text/html");
            }
            return textResponse(
                JSON.stringify(["Haus", "haus123", "Baum", 42]),
                "application/json",
            );
        });
        vi.stubGlobal("fetch", fetchMock);

        const words = await fetchDwds();
        const unique = new Set(words);

        expect(unique).toEqual(new Set(["Haus", "Baum"]));
        expect(fetchMock).toHaveBeenCalled();
    });

    it("liefert ein leeres Array, wenn beide Endpunkte fehlschlagen", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => textResponse("", "text/html", 404)),
        );

        await expect(fetchDwds()).resolves.toEqual([]);
    });
});
