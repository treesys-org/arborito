/** State signature for graph incremental updates (shared by graph.js + useGraph.js). */
export const SIG_KEYS = /** @type {const} */ ([
    'theme',
    'constructionMode',
    'completedSize',
    'harvestedCount',
    'dataId',
    'graphRootId',
    'viewMode',
    'releasesLen',
    'lang',
    'editLang',
    'treeHydrating',
    'nostrLiveSeeds',
]);

export function buildStateSig(s) {
    return [
        s.theme || '',
        s.constructionMode ? '1' : '0',
        s.completedNodes ? s.completedNodes.size : 0,
        (s.gamification?.seeds || []).length,
        s.activeSource?.id || '',
        s.data?.id != null ? String(s.data.id) : '',
        s.viewMode || '',
        (s.availableReleases || []).length,
        s.lang || '',
        s.curriculumEditLang ?? '',
        s.treeHydrating ? '1' : '0',
        s.nostrLiveSeeds == null ? '' : String(s.nostrLiveSeeds),
    ].join('|');
}

export function diffStateSig(prev, next) {
    const a = prev.split('|');
    const b = next.split('|');
    const out = {};
    for (let i = 0; i < SIG_KEYS.length; i++) {
        out[SIG_KEYS[i]] = a[i] !== b[i];
    }
    out.prev = Object.fromEntries(SIG_KEYS.map((k, i) => [k, a[i]]));
    out.next = Object.fromEntries(SIG_KEYS.map((k, i) => [k, b[i]]));
    return out;
}
