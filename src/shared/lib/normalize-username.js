/** Lowercase trimmed username for sync-login tags and lookups. */
export function normalizeUsername(input) {
    return String(input || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
}
