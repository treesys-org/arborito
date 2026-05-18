/**
 * Orchestrates local index + worker; hooks after graph load and after mutations.
 *
 * Update strategy (F2): today every graph change schedules a **full rebuild**
 * of the shard map with **debounce** (`DEBOUNCE_MS`; higher value = less work on large trees).
 * A fine-grained patch per edited node could
 * be added later for huge courses; until then, debounced rebuild is the accepted
 * design (see `SEARCH_INDEX_HOOKS.md` and the checklist).
 */

import {
    flattenTreeSearchEntriesWithLessonBody,
    buildShardMapFromEntries,
    computeTreeStorageKey,
    mergeSearchEntriesById
} from './search-index-core.js';
import { parseNostrTreeUrl } from '../services/nostr-refs.js';
import * as SearchIndexStore from './search-index-store.js';

/** @type {Worker | null} */
let worker = null;
let workerSeq = 0;

/** @type {ReturnType<typeof setTimeout> | null} */
let debounceTimer = null;

/** Larger trees benefit from fewer full rebuilds while editing; keeps UI calmer. */
const DEBOUNCE_MS = 650;

function yieldToMainThread() {
    return new Promise((resolve) => {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => resolve(), { timeout: 120 });
        } else {
            setTimeout(resolve, 0);
        }
    });
}

function getWorker() {
    if (typeof Worker === 'undefined') return null;
    if (worker) return worker;
    try {
        worker = new Worker(new URL('../workers/search-index.worker.js', import.meta.url), { type: 'module' });
    } catch (e) {
        console.warn('search-index: worker unavailable', e);
        return null;
    }
    return worker;
}

/**
 * @param {object} rawGraphData
 * @param {(s: string) => string} hashFn
 */
export function fingerprintRawGraph(rawGraphData, hashFn) {
    try {
        const slim = JSON.stringify(rawGraphData, (_k, v) => {
            if (_k === 'releaseSnapshots') return undefined;
            return v;
        });
        return hashFn(slim);
    } catch {
        return '0';
    }
}

/**
 * @param {import('../ui-store.js').UIStore} store
 */
export function scheduleSearchIndexRebuild(store) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        void runSearchIndexRebuild(store);
    }, DEBOUNCE_MS);
}

/**
 * Call after construction-mode mutations (debounced).
 * @param {import('../ui-store.js').UIStore} store
 */
export function scheduleSearchIndexAfterConstructionMutation(store) {
    scheduleSearchIndexRebuild(store);
}

async function runSearchIndexRebuild(store) {
    const src = store.state.activeSource;
    const raw = store.state.rawGraphData;
    if (!(src && src.id) || !(raw && raw.languages)) {
        try {
            store.update({ searchIndexStatus: 'idle', searchIndexError: null });
        } catch {
            /* ignore */
        }
        return;
    }

    const hashFn = (s) => store.computeHash(s);
    const treeKey = computeTreeStorageKey(src.id);

    /** @type {object[]|null} */
    let nostrSearchPackEntries = null;
    /** @type {object[]|null} */
    let torrentPackEntries = null;
    const srcUrl = src.url && String(src.url);
    if (
        /^nostr:\/\//i.test(srcUrl) &&
        (raw.meta && (raw.meta.nostrBundleFormat === 2 )) &&
        typeof (store.nostr && store.nostr.loadNostrSearchPack) === 'function'
    ) {
        const treeRef = parseNostrTreeUrl(srcUrl);
        if (treeRef) {
            try {
                const pack = await store.nostr.loadNostrSearchPack(treeRef);
                if (pack && Array.isArray(pack.entries)) {
                    nostrSearchPackEntries = pack.entries;
                }
            } catch (e) {
                console.warn('search-index: nostr search pack', e);
            }
        }
    }

    // WebTorrent: if publisher provided a prebuilt search pack, load it once from torrent.
    try {
        const wt = ((raw && raw.meta) ? raw.meta.webtorrent : undefined);
        const searchMagnet = wt && typeof wt === 'object' ? String(wt.searchMagnet || '') : '';
        const searchPath = wt && typeof wt === 'object' ? String(wt.searchPackPath || 'search-pack.json') : 'search-pack.json';
        if (searchMagnet && typeof (store.webtorrent && store.webtorrent.readTextFile) === 'function' && store.webtorrent.available()) {
            const text = await store.webtorrent.readTextFile({ magnet: searchMagnet, path: searchPath });
            const pack = JSON.parse(String(text || '').trim());
            if (pack && Array.isArray(pack.entries)) {
                torrentPackEntries = pack.entries;
            }
        }
    } catch (e) {
        console.warn('search-index: webtorrent search pack', e);
        torrentPackEntries = null;
    }

    const fp =
        nostrSearchPackEntries != null
            ? hashFn(JSON.stringify(nostrSearchPackEntries))
            : torrentPackEntries != null
            ? hashFn(JSON.stringify(torrentPackEntries))
            : fingerprintRawGraph(raw, hashFn);

    try {
        const prev = await SearchIndexStore.getMeta(treeKey);
        if (prev && prev.fingerprint === fp) {
            store.update({ searchIndexStatus: 'ready', searchIndexError: null });
            return;
        }

        store.update({ searchIndexStatus: 'indexing', searchIndexError: null });

        /** @type {object[]} */
        let allEntries;
        if (nostrSearchPackEntries != null) {
            allEntries = nostrSearchPackEntries;
        } else if (torrentPackEntries != null) {
            allEntries = torrentPackEntries;
        } else {
            allEntries = [];
            const langs = Object.keys(raw.languages);
            for (let i = 0; i < langs.length; i++) {
                if (i > 0) await yieldToMainThread();
                const langCode = langs[i];
                const root = raw.languages[langCode];
                const langUpper = String(langCode).toUpperCase().slice(0, 8);
                allEntries.push(...flattenTreeSearchEntriesWithLessonBody(root, langUpper));
            }
        }

        const w = getWorker();
        /** @type {Record<string, object[]>} */
        let shardMap;

        if (w) {
            workerSeq += 1;
            const seq = workerSeq;
            try {
                shardMap = await new Promise((resolve, reject) => {
                    const onMsg = (ev) => {
                        const d = ev.data;
                        if (!d || d.seq !== seq) return;
                        w.removeEventListener('message', onMsg);
                        if (d.type === 'done' && d.shards && typeof d.shards === 'object') {
                            resolve(d.shards);
                        } else if (d.type === 'error') {
                            reject(new Error(d.message || 'worker error'));
                        } else {
                            reject(new Error('search-index: invalid worker response'));
                        }
                    };
                    w.addEventListener('message', onMsg);
                    w.postMessage({ type: 'build', seq, entries: allEntries });
                });
            } catch (e) {
                console.warn('search-index worker error', e);
                shardMap = buildShardMapFromEntries(allEntries);
            }
        } else {
            shardMap = buildShardMapFromEntries(allEntries);
        }

        await persistShardMap(store, treeKey, fp, shardMap);
    } catch (e) {
        console.warn('search-index rebuild', e);
        try {
            store.update({
                searchIndexStatus: 'error',
                searchIndexError: String((e && e.message) || e)
            });
        } catch {
            /* ignore */
        }
    }
}

/**
 * @param {import('../ui-store.js').UIStore} store
 * @param {string} treeKey
 * @param {string} fp
 * @param {Record<string, object[]>} shardMap — keys `LANG_prefix`
 */
async function persistShardMap(store, treeKey, fp, shardMap) {
    await SearchIndexStore.clearTree(treeKey);
    for (const [k, arr] of Object.entries(shardMap)) {
        const us = k.indexOf('_');
        if (us < 0) continue;
        const lang = k.slice(0, us);
        const prefix = k.slice(us + 1);
        if (prefix.length !== 2) continue;
        await SearchIndexStore.putShard(treeKey, lang, prefix, arr);
    }
    await SearchIndexStore.putMeta(treeKey, { fingerprint: fp });
    store.update({
        searchCache: {},
        searchIndexStatus: 'ready',
        searchIndexError: null
    });
}

/**
 * @param {object} activeSource
 * @param {object|null} rawGraphData
 * @param {string} langUi
 * @param {string} prefix — 2 chars clean
 */
export async function getLocalShardOverlay(activeSource, rawGraphData, langUi, prefix) {
    if (!(activeSource && activeSource.id) || !rawGraphData) return [];
    const treeKey = computeTreeStorageKey(activeSource.id);
    const rows = await SearchIndexStore.getShard(treeKey, langUi, prefix);
    if (!rows || !rows.length) return [];
    return rows.map((item) => ({
        id: item.id,
        name: item.n != null ? item.n : item.name,
        type: item.t != null ? item.t : item.type,
        icon: item.i != null ? item.i : item.icon,
        description: item.d != null ? item.d : item.description,
        path: item.p != null ? item.p : item.path,
        lang: item.l != null ? item.l : item.lang,
        isCertifiable: item.c != null ? item.c : item.isCertifiable,
        searchBody: item.sb != null ? item.sb : item.searchBody
    }));
}

/**
 * @param {string} treeId
 * @param {object} treeData
 */
export async function exportSearchIndexPack(treeId, treeData) {
    const raw = treeData && typeof treeData === 'object' ? treeData : null;
    if (!(raw && raw.languages)) return null;
    const treeKey = computeTreeStorageKey(treeId);
    return SearchIndexStore.exportPack(treeKey);
}

/**
 * After importing a .arborito archive
 */
export async function hydrateSearchIndexFromArchive(treeId, pack) {
    if (!pack || typeof pack !== 'object') return;
    const treeKey = computeTreeStorageKey(treeId);
    await SearchIndexStore.importPack(treeKey, pack);
}

/** Clear local index when removing a local garden or revoking that `sourceId`. (G2 checklist) */
export async function clearSearchIndexForTreeId(treeId) {
    const treeKey = computeTreeStorageKey(treeId);
    await SearchIndexStore.clearTree(treeKey);
}
