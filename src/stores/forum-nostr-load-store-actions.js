import { getArboritoStore } from '../core/store-singleton.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';

function shell() {
    return getArboritoStore();
}

/** Nostr forum methods on `Store.prototype`. */

export function canModerateForumAction() {
    const store = shell();
    if (!store) return undefined;
    const treeRef = store.getActivePublicTreeRef();
    if (treeRef) {
        // Network forums are live; allow owner + invited editors to moderate without requiring construction mode.
        const r = typeof store.getMyTreeNetworkRole === 'function' ? store.getMyTreeNetworkRole() : null;
        return r === 'owner' || r === 'editor';
    }
    if (!store.state.constructionMode) return false;
    if (!store.state.activeSource || !store.state.rawGraphData) return false;
    return fileSystem.isLocal;

}
export async function hydrateTreeForumIfNeededAction() {
    const store = shell();
    if (!store) return undefined;
    const src = store.state.activeSource;
    const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
    if (!ref || !isNostrNetworkAvailable()) return;
    const sid = String(src.id || '');
    if (!sid) return;

    try {
        // Forum: no global census. Threads/messages are loaded lazily per place/thread.
        if (store._treeForumHydratedForSourceId !== sid) {
            store._treeForumLoadedPlaces = new Set();
            store._treeForumLoadedThreads = new Set();
            store._treeForumLoadedThreadWeeks = new Map();
            store._treeForumHydratedForSourceId = sid;
        }
        store.update({});
    } catch (e) {
    console.warn('hydrateTreeForumIfNeeded', e);
    }

}
export function _treeForumPlaceKeyAction(placeId) {
    const store = shell();
    if (!store) return undefined;
    return placeId == null || placeId === '' ? '_general' : String(placeId);

}
export function _isoWeekKeyAction(isoString) {
    const store = shell();
    if (!store) return undefined;
    const d = isoString ? new Date(isoString) : new Date();
    // ISO week in UTC
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    const yyyy = date.getUTCFullYear();
    const ww = String(weekNo).padStart(2, '0');
    return `${yyyy}-W${ww}`;

}
export async function ensureTreeForumPlaceLoadedAction(placeId) {
    const store = shell();
    if (!store) return undefined;
    const src = store.state.activeSource;
    const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
    if (!ref || !isNostrNetworkAvailable()) return false;
    const sid = String(src.id || '');
    if (!sid) return false;
    const key = store._treeForumPlaceKey(placeId);
    if (store._treeForumLoadedPlaces.has(key)) return true;
    try {
        const threads = await store.nostr.loadThreadsByPlaceV3({ ...ref, placeId });
        store.forumStore.mergeThreads(sid, threads);
        store._treeForumLoadedPlaces.add(key);
        store.update({});
        return true;
} catch (e) {
    console.warn('ensureTreeForumPlaceLoaded', e);
    return false;
            }

}
export async function ensureTreeForumThreadLoadedAction(threadId, opts = {}) {
    const store = shell();
    if (!store) return undefined;
    const src = store.state.activeSource;
    const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
    if (!ref || !isNostrNetworkAvailable()) return false;
    const sid = String(src.id || '');
    if (!sid) return false;
    const tid = String(threadId || '');
    if (!tid) return false;
    if (store._treeForumLoadedThreads.has(tid)) return true;
    try {
        const wk = store._isoWeekKey(new Date().toISOString());
        await store.ensureTreeForumThreadWeekLoaded(tid, wk);
        store._treeForumLoadedThreads.add(tid);
        store.update({});
        return true;
} catch (e) {
    console.warn('ensureTreeForumThreadLoaded', e);
    return false;
            }

}
export async function ensureTreeForumThreadWeekLoadedAction(threadId, weekKey) {
    const store = shell();
    if (!store) return undefined;
    const src = store.state.activeSource;
    const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
    if (!ref || !isNostrNetworkAvailable()) return false;
    const sid = String(src.id || '');
    if (!sid) return false;
    const tid = String(threadId || '');
    const wk = String(weekKey || '');
    if (!tid || !wk) return false;
    const loaded = store._treeForumLoadedThreadWeeks.get(tid) || new Set();
    if (loaded.has(wk)) return true;
    try {
        const pageRef = await store.nostr.loadThreadPageRefV3({ ...ref, threadId: tid, pageKey: wk });
        if ((pageRef && pageRef.magnet) && (pageRef && pageRef.path) && (store.webtorrent && store.webtorrent.available ? store.webtorrent.available() : false)) {
            const text = await store.webtorrent.readTextFile({
                magnet: String(pageRef.magnet),
                path: String(pageRef.path)
            });
            const page = JSON.parse(String(text || '').trim());
            // TTL: keep only recent posts (best-effort, client-side).
            const ttlMs = 30 * 24 * 60 * 60 * 1000;
            const cutoff = Date.now() - ttlMs;
            const fresh = Array.isArray((page && page.messages))
            ? page.messages.filter((m) => {
                try {
                    const t = new Date(String((m && m.createdAt) || '')).getTime();
                    return Number.isFinite(t) && t >= cutoff;
                } catch {
                return false;
            }
        })
        : [];
        /* Drop messages whose signature does not match the claimed
        * author: a page file is just untrusted JSON pulled from a peer,
        * so without store check anyone could inject posts attributed to
        * another pubkey. `verifyForumMessage` is lenient toward
        * unsigned legacy-shaped entries but rejects a present-but-bad
        * signature, so honest content is kept and forgeries are cut. */
        const msgs = [];
        for (const m of fresh) {
            try {
                if (await store.nostr.verifyForumMessage({ message: m })) msgs.push(m);
            } catch {
            /* malformed entry — skip */
        }
    }
    store.forumStore.mergeMessages(sid, msgs);
    }
    loaded.add(wk);
    store._treeForumLoadedThreadWeeks.set(tid, loaded);
    store.update({});
    return true;
    } catch (e) {
    console.warn('ensureTreeForumThreadWeekLoaded', e);
    return false;
    }

}
export function getLoadedForumThreadWeeksAction(threadId) {
    const store = shell();
    if (!store) return undefined;
    const tid = String(threadId || '');
    const s = store._treeForumLoadedThreadWeeks.get(tid);
    return s ? [...s.values()] : [];

}
export async function getTreeForumThreadWeeksAction(threadId) {
    const store = shell();
    if (!store) return undefined;
    const src = store.state.activeSource;
    const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
    if (!ref || !isNostrNetworkAvailable()) return [];
    const tid = String(threadId || '');
    if (!tid) return [];
    try {
        const map = await store.nostr.loadThreadPageRefsV3({ ...ref, threadId: tid });
        const keys = [...map.keys()].filter((k) => k && k !== '_');
        keys.sort((a, b) => String(b).localeCompare(String(a)));
        return keys;
} catch (e) {
    console.warn('getTreeForumThreadWeeks', e);
    return [];
            }

}
export async function searchTreeForumV3Action(query, opts = {}) {
    const store = shell();
    if (!store) return undefined;
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const src = store.state.activeSource;
    const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
    if (!ref || !isNostrNetworkAvailable()) return [];
    const maxWeeks = Math.max(1, Math.min(80, Number(opts.maxWeeks) || 16));
    const maxResults = Math.max(1, Math.min(200, Number(opts.maxResults) || 60));
    const ttlMs = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ttlMs;
    try {
        const refs = await store.nostr.loadForumSearchRefsV3(ref);
        const keys = [...refs.keys()].filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)));
        const out = [];
        for (const wk of keys.slice(0, maxWeeks)) {
            const r = refs.get(wk);
            if (!(r && r.magnet) || !(r && r.path) || !(store.webtorrent && store.webtorrent.available ? store.webtorrent.available() : false)) continue;
            let pack;
            try {
                const text = await store.webtorrent.readTextFile({ magnet: String(r.magnet), path: String(r.path) });
                pack = JSON.parse(String(text || '').trim());
            } catch {
            continue;
        }
        const entries = Array.isArray((pack && pack.entries)) ? pack.entries : [];
        for (const e of entries) {
            const body = String((e && e.body) || '');
            if (!body) continue;
            try {
                const t = new Date(String((e && e.createdAt) || '')).getTime();
                if (!Number.isFinite(t) || t < cutoff) continue;
            } catch {
            continue;
        }
        if (body.includes(q)) {
            out.push({
                weekKey: wk,
                threadId: String(e.threadId || ''),
                placeId: e.placeId != null && e.placeId !== '' ? String(e.placeId) : null,
                createdAt: String(e.createdAt || ''),
                msgId: String(e.id || ''),
                snippet: body.length > 140 ? `${body.slice(0, 140)}…` : body
            });
            if (out.length >= maxResults) return out;
        }
    }
    }
    return out;
    } catch (e) {
    console.warn('searchTreeForumV3', e);
    return [];
    }

}
