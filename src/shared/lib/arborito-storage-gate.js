/**
 * Blocks Arborito persistence during GDPR wipe so in-flight writes cannot
 * recreate IndexedDB / localStorage after clearAllArboritoBrowserStorage.
 */

let writesDisabled = false;
let inflightOps = 0;

export function disableArboritoStorageWrites() {
    writesDisabled = true;
}

export function areArboritoStorageWritesDisabled() {
    return writesDisabled;
}

/** @returns {boolean} false when writes are disabled (caller must no-op). */
export function beginArboritoStorageWrite() {
    if (writesDisabled) return false;
    inflightOps += 1;
    return true;
}

export function endArboritoStorageWrite() {
    inflightOps = Math.max(0, inflightOps - 1);
}

/** Wait until in-flight gated writes finish (or timeout). */
export async function waitForArboritoStorageWritesIdle(timeoutMs = 8000) {
    const start = Date.now();
    while (inflightOps > 0 && Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 40));
    }
    return inflightOps === 0;
}
