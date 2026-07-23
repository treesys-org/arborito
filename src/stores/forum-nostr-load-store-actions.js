import { getArboritoStore } from '../core/store-singleton.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { getConnectedNostr } from '../shared/lib/connected-services/index.js';
import { notifyForumChanged } from './store-notify.js';

function shell() {
    return getArboritoStore();
}

async function nostrClient() {
    const store = shell();
    if (!store) return null;
    return getConnectedNostr(store);
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
        notifyForumChanged(store);
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
    const net = await nostrClient();
    if (!net) return false;
    try {
        const threads = await net.loadThreadsByPlaceV3({ ...ref, placeId });
        let deletedThreads = null;
        try {
            deletedThreads = await net.loadDeletedThreadIds?.({ pub: ref.pub, universeId: ref.universeId });
        } catch {
            deletedThreads = null;
        }
        const kept = deletedThreads
            ? (threads || []).filter((t) => t && !deletedThreads.has(String(t.id || '')))
            : threads;
        store.forumStore.mergeThreads(sid, kept);
        store._treeForumLoadedPlaces.add(key);
        notifyForumChanged(store);
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
        notifyForumChanged(store);
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
    const net = await nostrClient();
    if (!net) return false;
    try {
        const candidates =
            typeof net.loadThreadPageRefCandidatesV3 === 'function'
                ? await net.loadThreadPageRefCandidatesV3({ ...ref, threadId: tid, pageKey: wk })
                : [];
        const pageRefFallback =
            !candidates.length && (await net.loadThreadPageRefV3({ ...ref, threadId: tid, pageKey: wk }));
        const refs = candidates.length
            ? candidates.map((c) => c.ref)
            : pageRefFallback
              ? [pageRefFallback]
              : [];
        const wtOk = store.webtorrent && store.webtorrent.available ? store.webtorrent.available() : false;
        if (!wtOk || !refs.length) {
            loaded.add(wk);
            store._treeForumLoadedThreadWeeks.set(tid, loaded);
            notifyForumChanged(store);
            return true;
        }
        const ttlMs = 30 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - ttlMs;
        const byId = new Map();
        for (const pageRef of refs) {
            if (!(pageRef && pageRef.magnet && pageRef.path)) continue;
            try {
                const text = await store.webtorrent.readTextFile({
                    magnet: String(pageRef.magnet),
                    path: String(pageRef.path)
                });
                const page = JSON.parse(String(text || '').trim());
                const list = Array.isArray(page?.messages) ? page.messages : [];
                for (const m of list) {
                    try {
                        const t = new Date(String((m && m.createdAt) || '')).getTime();
                        if (!(Number.isFinite(t) && t >= cutoff)) continue;
                        if (m?.id) byId.set(String(m.id), m);
                    } catch {
                        /* skip */
                    }
                }
            } catch {
                /* ignore one magnet */
            }
        }
        const fresh = [...byId.values()];
        const msgs = [];
        let deletedRecords = null;
        try {
            deletedRecords = await net.loadDeletedMessageRecords?.({ pub: ref.pub, universeId: ref.universeId });
        } catch {
            deletedRecords = null;
        }
        for (const m of fresh) {
            try {
                const mid = String(m?.id || '');
                if (mid && deletedRecords && deletedRecords.has(mid)) {
                    const authorPub = m?.author?.pub || m?.authorPub || null;
                    const rows = deletedRecords.get(mid);
                    const list = Array.isArray(rows) ? rows : [rows];
                    let drop = false;
                    for (const record of list) {
                        if (
                            await net.isAuthorizedForumDeletion?.({
                                record,
                                kind: 'delete_message',
                                targetId: mid,
                                ownerPub: ref.pub,
                                universeId: ref.universeId,
                                messageAuthorPub: authorPub
                            })
                        ) {
                            drop = true;
                            break;
                        }
                    }
                    if (drop) continue;
                }
                if (await net.verifyForumMessage({ message: m, treeRef: { pub: ref.pub, universeId: ref.universeId } })) {
                    msgs.push(m);
                }
            } catch {
                /* malformed entry, skip */
            }
        }
        store.forumStore.mergeMessages(sid, msgs);
        loaded.add(wk);
        store._treeForumLoadedThreadWeeks.set(tid, loaded);
        notifyForumChanged(store);
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
    const net = await nostrClient();
    if (!net) return [];
    try {
        const map = await net.loadThreadPageRefsV3({ ...ref, threadId: tid });
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
    const net = await nostrClient();
    if (!net) return [];
    try {
        const refs = await net.loadForumSearchRefsV3(ref);
        const keys = [...refs.keys()].filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)));
        const out = [];
        const seenMsg = new Set();
        for (const wk of keys.slice(0, maxWeeks)) {
            const candidates =
                typeof net.loadForumSearchRefCandidatesV3 === 'function'
                    ? await net.loadForumSearchRefCandidatesV3({ ...ref, pageKey: wk })
                    : [{ ref: refs.get(wk) }];
            if (!(store.webtorrent && store.webtorrent.available ? store.webtorrent.available() : false)) continue;
            for (const row of candidates) {
                const r = row?.ref || row;
                if (!(r && r.magnet) || !(r && r.path)) continue;
                let pack;
                try {
                    const text = await store.webtorrent.readTextFile({
                        magnet: String(r.magnet),
                        path: String(r.path)
                    });
                    pack = JSON.parse(String(text || '').trim());
                } catch {
                    continue;
                }
                const entries = Array.isArray(pack?.entries) ? pack.entries : [];
                for (const e of entries) {
                    const body = String((e && e.body) || '');
                    if (!body) continue;
                    const msgId = String(e.id || '');
                    if (msgId && seenMsg.has(msgId)) continue;
                    try {
                        const t = new Date(String((e && e.createdAt) || '')).getTime();
                        if (!Number.isFinite(t) || t < cutoff) continue;
                    } catch {
                        continue;
                    }
                    if (body.includes(q)) {
                        if (msgId) seenMsg.add(msgId);
                        out.push({
                            weekKey: wk,
                            threadId: String(e.threadId || ''),
                            placeId: e.placeId != null && e.placeId !== '' ? String(e.placeId) : null,
                            createdAt: String(e.createdAt || ''),
                            msgId,
                            snippet: body.length > 140 ? `${body.slice(0, 140)}…` : body
                        });
                        if (out.length >= maxResults) return out;
                    }
                }
            }
        }
        return out;
    } catch (e) {
        console.warn('searchTreeForumV3', e);
        return [];
    }

}
