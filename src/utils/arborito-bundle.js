/**
 * Arborito local/public bundle: tree (data.json shape) + progress + forum.
 * The tree may include `readme` (Markdown) in sync with `universePresentation`.
 * Local `.arborito` bundles may also carry `files['INTRO.md']` and `files['README.md']` with the same text.
 * @see format version 1
 */

import { safeStripeDonationUrl } from './stripe-donation-url.js';

const BUNDLE_FORMAT = 'arborito-bundle';
const BUNDLE_VERSION = 1;

/**
 * Collect node ids from raw graph JSON (all languages).
 * @param {object|null} rawGraphData
 * @returns {Set<string>}
 */
/**
 * Curriculum-only snapshot for `.arborito` export: map + lessons, no forum or embedded search index.
 * Forum is stored separately (`ForumStore`); search index is rebuilt from the tree after import.
 * @param {object} treeData
 * @param {{
 *   releaseSnapshotIds?: string[] | null
 * }} [options] — `releaseSnapshotIds`: `null`/omit = keep all; `[]` = drop all; non-empty = keep only those keys.
 * @returns {object}
 */
export function sanitizeCurriculumForArboritoArchive(treeData, options = {}) {
    if (!treeData || typeof treeData !== 'object') return treeData;
    const copy = JSON.parse(JSON.stringify(treeData));
    if ('forum' in copy) delete copy.forum;
    if ('searchIndex' in copy) delete copy.searchIndex;
    if (Array.isArray(options.releaseSnapshotIds)) {
        const rs = copy.releaseSnapshots;
        if (!rs || typeof rs !== 'object') {
            /* keep absent */
        } else if (options.releaseSnapshotIds.length === 0) {
            delete copy.releaseSnapshots;
        } else {
            const next = {};
            for (const id of options.releaseSnapshotIds) {
                if (Object.prototype.hasOwnProperty.call(rs, id)) next[id] = rs[id];
            }
            if (Object.keys(next).length === 0) delete copy.releaseSnapshots;
            else copy.releaseSnapshots = next;
        }
    }
    return copy;
}

export function collectNodeIdsFromRawTree(rawGraphData) {
    const ids = new Set();
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.id != null) ids.add(String(node.id));
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    if (!(rawGraphData && rawGraphData.languages)) return ids;
    for (const lang of Object.keys(rawGraphData.languages)) {
        const root = rawGraphData.languages[lang];
        walk(root);
    }
    return ids;
}

/**
 * @param {object} persistence - getPersistenceData() shape
 * @param {Set<string>} allowedIds
 * @returns {object}
 */
export function filterProgressForTree(persistence, allowedIds) {
    const completedNodes = (persistence.progress || []).filter((id) => allowedIds.has(String(id)));
    const memory = {};
    if (persistence.memory && typeof persistence.memory === 'object') {
        for (const [k, v] of Object.entries(persistence.memory)) {
            if (allowedIds.has(String(k))) memory[k] = v;
        }
    }
    const bookmarks = {};
    if (persistence.bookmarks && typeof persistence.bookmarks === 'object') {
        for (const [k, v] of Object.entries(persistence.bookmarks)) {
            if (allowedIds.has(String(k))) bookmarks[k] = v;
        }
    }
    return {
        completedNodes,
        memory,
        bookmarks,
        gamification: persistence.gamification ? { ...persistence.gamification } : {},
        gameData: persistence.gameData ? { ...persistence.gameData } : {}
    };
}

/**
 * @param {object} rawGraphData
 * @param {object} activeSource
 */
export function inferBundleTitle(rawGraphData, activeSource) {
    if ((rawGraphData && rawGraphData.universeName)) return String(rawGraphData.universeName);
    const langs = (rawGraphData && rawGraphData.languages);
    if (langs) {
        const codes = Object.keys(langs);
        for (const code of codes) {
            const root = langs[code];
            if ((root && root.name)) return String(root.name);
        }
    }
    return (activeSource && activeSource.name) ? String(activeSource.name) : 'Arborito';
}

/**
 * Merge bundle `meta` presentation fields into `tree.universePresentation` (for editing + display).
 * @param {object|null} tree
 * @param {object|null} meta
 */
export function mergeBundleMetaIntoTree(tree, meta) {
    if (!tree || typeof tree !== 'object' || !meta || typeof meta !== 'object') return tree;
    const cur = tree.universePresentation && typeof tree.universePresentation === 'object' ? tree.universePresentation : {};
    const next = { ...cur };
    for (const k of ['description', 'authorName', 'authorAbout', 'donationUrl']) {
        if (meta[k] != null && String(meta[k]).length > 0 && (next[k] == null || String(next[k]).length === 0)) {
            const v = String(meta[k]);
            next[k] = k === 'donationUrl' ? safeStripeDonationUrl(v) || '' : v;
        }
    }
    tree.universePresentation = next;
    return tree;
}

/**
 * Build a serializable bundle for the active source.
 * @param {object} opts
 * @param {object|null} opts.rawGraphData - full data.json (multi-language)
 * @param {object} opts.activeSource
 * @param {object} opts.persistenceData - from userStore.getPersistenceData()
 * @param {object} opts.forumSnapshot - { threads, messages, moderationLog? } for this source
 * @param {string} [opts.instanceId]
 */
export function buildArboritoBundle({
    rawGraphData,
    activeSource,
    persistenceData,
    forumSnapshot,
    instanceId
}) {
    const id = instanceId || (activeSource && activeSource.id) || 'unknown';
    const allowed = collectNodeIdsFromRawTree(rawGraphData);
    const progress = filterProgressForTree(persistenceData, allowed);
    const up =
        (rawGraphData && rawGraphData.universePresentation) && typeof rawGraphData.universePresentation === 'object'
            ? rawGraphData.universePresentation
            : {};

    return {
        format: BUNDLE_FORMAT,
        version: BUNDLE_VERSION,
        meta: {
            title: inferBundleTitle(rawGraphData, activeSource),
            locale: typeof navigator !== 'undefined' ? navigator.language : '',
            createdAt: new Date().toISOString(),
            exportedAt: new Date().toISOString(),
            instanceId: id,
            sourceUrl: (activeSource && activeSource.url) || null,
            description: typeof up.description === 'string' ? up.description : '',
            authorName: typeof up.authorName === 'string' ? up.authorName : '',
            authorAbout: typeof up.authorAbout === 'string' ? up.authorAbout : '',
            donationUrl: typeof up.donationUrl === 'string' ? up.donationUrl : ''
        },
        tree: rawGraphData && typeof rawGraphData === 'object' ? JSON.parse(JSON.stringify(rawGraphData)) : null,
        progress,
        forum: {
            version: 1,
            threads: Array.isArray((forumSnapshot && forumSnapshot.threads)) ? forumSnapshot.threads : [],
            messages: Array.isArray((forumSnapshot && forumSnapshot.messages)) ? forumSnapshot.messages : [],
            moderationLog: Array.isArray((forumSnapshot && forumSnapshot.moderationLog)) ? forumSnapshot.moderationLog : []
        }
    };
}

/**
 * @param {unknown} data
 * @returns {{ ok: true, bundle: object } | { ok: false, error: string }}
 */
export function parseArboritoBundle(data) {
    if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid bundle: not an object' };
    const d = data;
    if (d.format !== BUNDLE_FORMAT) return { ok: false, error: 'Unknown bundle format' };
    if (typeof d.version !== 'number' || d.version < 1) return { ok: false, error: 'Unsupported bundle version' };
    if (!d.tree) return { ok: false, error: 'Bundle missing tree' };
    return { ok: true, bundle: d };
}

/**
 * @param {unknown} data
 * @returns {boolean}
 */
export function isArboritoBundle(data) {
    return !!(data && typeof data === 'object' && data.format === BUNDLE_FORMAT && data.tree);
}

/**
 * Payload for merging after fetch (tree + optional progress + forum).
 * @param {object} data — raw JSON (bundle)
 * @returns {{ tree: object, progress: object|null, forum: object|null, meta: object|null } | null}
 */
export function extractTreeAndPayloadFromBundle(data) {
    const r = parseArboritoBundle(data);
    if (!r.ok) return null;
    const b = r.bundle;
    return {
        tree: b.tree,
        progress: b.progress && typeof b.progress === 'object' ? b.progress : null,
        forum: b.forum && typeof b.forum === 'object' ? b.forum : null,
        meta: b.meta && typeof b.meta === 'object' ? b.meta : null
    };
}
