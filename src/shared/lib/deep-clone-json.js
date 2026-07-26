/** Deep-clone plain JSON-shaped data (curriculum / catalog blobs). */
export function deepCloneJson(value) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            /* Non-cloneable edge cases — fall through. */
        }
    }
    return JSON.parse(JSON.stringify(value));
}
