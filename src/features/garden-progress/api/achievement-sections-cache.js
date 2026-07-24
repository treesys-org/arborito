/**
 * Warm cache for trophies hub — reopen skips rebuild when graph + completions
 * identities are unchanged.
 */

/** @type {WeakMap<object, { completed: unknown, activeKey: string, sections: object }>} */
const BY_DATA = new WeakMap();

function activeKey(store) {
    const src = store?.state?.activeSource;
    return `${src?.id || ''}|${src?.url || ''}`;
}

/** @returns {object|null} cached sections or null */
export function peekAchievementSectionsCache(store) {
    const data = store?.state?.data;
    if (!data || typeof data !== 'object') return null;
    const hit = BY_DATA.get(data);
    if (!hit?.sections) return null;
    if (hit.completed !== store?.userStore?.state?.completedNodes) return null;
    if (hit.activeKey !== activeKey(store)) return null;
    return hit.sections;
}

/**
 * @param {object|null|undefined} store
 * @param {() => { trees: unknown[], branches: unknown[], diplomas: unknown[] }} build
 */
export function getAchievementSectionsCached(store, build) {
    const peeked = peekAchievementSectionsCache(store);
    if (peeked) return peeked;
    const data = store?.state?.data;
    const completed = store?.userStore?.state?.completedNodes;
    const key = activeKey(store);
    const sections = build() || { trees: [], branches: [], diplomas: [] };
    if (data && typeof data === 'object') {
        BY_DATA.set(data, { completed, activeKey: key, sections });
    }
    return sections;
}

/** Drop cache after progress mutations (optional; Set identity usually changes). */
export function invalidateAchievementSectionsCache(data) {
    if (data && typeof data === 'object') BY_DATA.delete(data);
}
