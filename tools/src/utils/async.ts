/**
 * Pausiert die Ausführung für eine bestimmte Anzahl an Millisekunden.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Führt asynchrone Aufgaben mit begrenzter Parallelität aus.
 */
export async function parallelMap<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = [];
    let index = 0;

    async function worker(): Promise<void> {
        while (index < items.length) {
            const i = index++;
            results[i] = await fn(items[i]);
        }
    }

    const workers = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => worker(),
    );
    await Promise.all(workers);
    return results;
}
