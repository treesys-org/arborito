/**
 * Last-painted Arcade catalog snapshot so reopening the hub never blanks to
 * a full-panel spinner while repos refresh.
 */

const STORAGE_KEY = 'arborito:arcade-catalog-v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @returns {object[]}
 */
export function readArcadeCatalogSnapshot() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const at = Number(parsed?.at) || 0;
        if (!at || Date.now() - at > MAX_AGE_MS) return [];
        return Array.isArray(parsed?.games) ? parsed.games.filter((g) => g && g.id != null) : [];
    } catch {
        return [];
    }
}

/**
 * @param {object[]} games
 */
export function writeArcadeCatalogSnapshot(games) {
    try {
        const list = Array.isArray(games) ? games.filter((g) => g && g.id != null).slice(0, 200) : [];
        if (!list.length) return;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), games: list }));
    } catch {
        /* quota / private mode */
    }
}
