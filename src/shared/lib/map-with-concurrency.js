/**
 * Map async work over items with limited concurrency.
 * Result order matches `items`. Rejects if any mapper rejects.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @returns {Promise<R[]>}
 */
export async function mapWithConcurrency(items, concurrency, mapper) {
    const list = Array.isArray(items) ? items : [];
    const n = list.length;
    if (!n) return [];
    const limit = Math.max(1, Math.min(8, Number(concurrency) || 6));
    const out = new Array(n);
    let cursor = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, n) }, async () => {
            while (true) {
                const i = cursor++;
                if (i >= n) return;
                out[i] = await mapper(list[i], i);
            }
        })
    );
    return out;
}
