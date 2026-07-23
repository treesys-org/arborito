/** Tracks lazy modal JS chunks that finished loading (prefetch or first open). */
const loaded = new Set();

export function isModalChunkLoaded(type) {
    return loaded.has(String(type || ''));
}

export function markModalChunkLoaded(type) {
    const key = String(type || '');
    if (key) loaded.add(key);
}
