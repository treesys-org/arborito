import { getArboritoStore } from '../core/store-singleton.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { getConnectedNostr } from '../shared/lib/connected-services/index.js';
import { isTreeForumEnabled } from '../shared/lib/tree-forum-enabled.js';

function shell() {
    return getArboritoStore();
}

async function nostrClient() {
    const store = shell();
    if (!store) return null;
    return getConnectedNostr(store);
}

/** Nostr forum methods on `Store.prototype`. */

export async function publishSignedForumMessageV3Action(sourceId, treeRef, signed, threadForPlace) {
    const store = shell();
    if (!store) return undefined;
    const net = await nostrClient();
    if (!net) return false;
    try {
        const pageKey = store._isoWeekKey(signed.createdAt);
        const pagePath = `forum-pages/${String(signed.threadId)}/${pageKey}.json`;
        let existing = { version: 1, threadId: String(signed.threadId), pageKey, messages: [] };
        try {
            const prevRef = await net.loadThreadPageRefV3({ ...treeRef, threadId: signed.threadId, pageKey });
            if ((prevRef && prevRef.magnet) && (prevRef && prevRef.path) && (store.webtorrent && store.webtorrent.available ? store.webtorrent.available() : false)) {
                const text = await store.webtorrent.readTextFile({
                    magnet: String(prevRef.magnet),
                    path: String(prevRef.path)
                });
                const parsed = JSON.parse(String(text || '').trim());
                if (parsed && Array.isArray(parsed.messages)) existing = parsed;
            }
        } catch {
        /* ignore */
    }
    existing.messages = Array.isArray(existing.messages) ? existing.messages : [];
    const sid = String(sourceId || '');
    const already = existing.messages.some((m) => m && String(m.id) === String(signed.id));
    if (!already) existing.messages.push(signed);
    if ((store.webtorrent && store.webtorrent.available ? store.webtorrent.available() : false)) {
        const blob = new Blob([JSON.stringify(existing)], { type: 'application/json' });
        const file = new File([blob], pagePath, { type: 'application/json' });
        const magnet = await store.webtorrent.seedFiles({
            key: `forum-${signed.threadId}-${pageKey}`,
            files: [file]
        });
        net.putThreadPageRefV3({
            ...treeRef,
            threadId: signed.threadId,
            pageKey,
            ref: { version: 1, magnet, path: pagePath, updatedAt: new Date().toISOString() }
        });
        const searchPath = `forum-search/${pageKey}.json`;
        let searchPack = { version: 1, pageKey, entries: [] };
        try {
            const refs = await net.loadForumSearchRefsV3(treeRef);
            const sref = refs.get(pageKey);
            if ((sref && sref.magnet) && (sref && sref.path) && (store.webtorrent && store.webtorrent.available ? store.webtorrent.available() : false)) {
                const text = await store.webtorrent.readTextFile({
                    magnet: String(sref.magnet),
                    path: String(sref.path)
                });
                const parsed = JSON.parse(String(text || '').trim());
                if (parsed && Array.isArray(parsed.entries)) searchPack = parsed;
            }
        } catch {
        /* ignore */
    }
    const norm = String(signed.body || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 400);
    searchPack.entries = Array.isArray(searchPack.entries) ? searchPack.entries : [];
    const hasEntry = searchPack.entries.some((e) => e && String(e.id) === String(signed.id));
    if (!hasEntry) {
        searchPack.entries.push({
            id: signed.id,
            threadId: signed.threadId,
            placeId:
            (threadForPlace && threadForPlace.nodeId) != null && threadForPlace.nodeId !== ''
            ? String(threadForPlace.nodeId)
            : null,
            createdAt: signed.createdAt,
            body: norm
        });
    }
    const sblob = new Blob([JSON.stringify(searchPack)], { type: 'application/json' });
    const sfile = new File([sblob], searchPath, { type: 'application/json' });
    const smagnet = await store.webtorrent.seedFiles({ key: `forum-search-${pageKey}`, files: [sfile] });
    net.putForumSearchRefV3({
        ...treeRef,
        pageKey,
        ref: { version: 1, magnet: smagnet, path: searchPath, updatedAt: new Date().toISOString() }
    });
    }
    return true;
    } catch (e) {
    console.warn('publishSignedForumMessageV3', e);
    return false;
    }

}
export function addForumThreadAction(sourceId, opts = {}) {
    const store = shell();
    if (!store) return undefined;
    const th = store.forumStore.addThread(sourceId, opts);
    const treeRef = store.getActivePublicTreeRef();
    if (treeRef && th && isNostrNetworkAvailable()) {
        if (!isTreeForumEnabled(store.state.rawGraphData?.meta, store.state.activeSource)) {
            store.notify(
                store.ui.forumDisabledForTree ||
                    'This public tree was published without a forum.',
                true
            );
            return th;
        }
        /* addThreadV3 is async (solves the thread PoW before publishing). */
        void (async () => {
            const net = await nostrClient();
            if (!net) return;
            net.addThreadV3({ ...treeRef, placeId: th.nodeId, thread: th }).catch((e) => {
                console.warn('Network forum addThread failed', e);
            });
        })();
    }
    return th;

}
export async function addForumMessageAction(sourceId, payload) {
    const store = shell();
    if (!store) return undefined;
    const treeRef = store.getActivePublicTreeRef();
    if (!treeRef || !isNostrNetworkAvailable()) return store.forumStore.addMessage(sourceId, payload);

    const net = await nostrClient();
    if (!net) return store.forumStore.addMessage(sourceId, payload);

    if (!isTreeForumEnabled(store.state.rawGraphData?.meta, store.state.activeSource)) {
        store.notify(
            store.ui.forumDisabledForTree ||
                'This public tree was published without a forum.',
            true
        );
        return null;
    }

    // Require cloud account (sync code).
    if (typeof store.isSignedIn === 'function' && !store.isSignedIn()) {
        store.notify(
        store.ui.forumNeedSyncLogin || 'Open Profile and sign in with your sync code before posting.',
        true
        );
        return null;
    }

    if (typeof store.grantNetworkSocialConsent === 'function' && !store.hasNetworkSocialConsent()) {
        store.grantNetworkSocialConsent();
    }

    // Minimal anti-spam / safety limits (client-side).
    const bodyRaw = String((payload && payload.body) || '');
    const body = bodyRaw.trim();
    if (!body) return null;
    if (body.length > 2000) {
        store.notify(store.ui.forumPostTooLong || 'Message is too long.', true);
        return null;
    }
    if (!store._forumRate) store._forumRate = { t: 0, n: 0 };
    const now = Date.now();
    if (now - store._forumRate.t > 60_000) {
        store._forumRate.t = now;
        store._forumRate.n = 0;
    }
    store._forumRate.n += 1;
    if (store._forumRate.n > 20) {
        store.notify(store.ui.forumRateLimited || 'Slow down a bit.', true);
        return null;
    }

    // Per-day rate limit (client-side; best-effort).
    try {
        const day = new Date().toISOString().slice(0, 10);
        const key = `arborito-forum-rate-day:${String(sourceId || '')}:${day}`;
        const prev = Number(localStorage.getItem(key) || '0') || 0;
        const next = prev + 1;
        const limit = 80;
        if (next > limit) {
            store.notify(store.ui.forumDailyLimit || 'Daily posting limit reached. Try again tomorrow.', true);
            return null;
        }
        localStorage.setItem(key, String(next));
    } catch {
    /* ignore */
    }

    const author = payload.author || {};
    const pair = await store.ensureNetworkUserPair();
    if (!(pair && pair.pub)) {
        return store.forumStore.addMessage(sourceId, payload);
    }

    // Forum bans (per tree): owner + invited editors can ban pubkeys.
    try {
        const bans = await net.loadForumBansV3({ ownerPub: treeRef.pub, universeId: treeRef.universeId });
        if (bans && typeof bans.has === 'function' && bans.has(String(pair.pub))) {
            store.notify(store.ui.forumBannedCannotPost || 'You cannot post in store forum.', true);
            return null;
        }
    } catch {
    /* ignore */
    }

    /* Strict moderation: owner-set policy holds non-moderator messages until
    * the owner approves them. Moderators (owner + invited editors) bypass the
    * queue so they can answer in real time. */
    const modMode = await store.getForumModerationModeForActiveTree(treeRef);
    const holdForApproval = modMode === 'strict' && !store.canModerateForum();

    const msg = store.forumStore.addMessage(sourceId, {
        ...payload,
        ...(holdForApproval ? { pendingApproval: true } : {}),
        author: {
            ...author,
            pub: pair.pub,
            name: '',
            avatar: '💬'
        }
    });
    if (!msg) return msg;

    const threadsSnap = (store.forumStore.bySourceId[String(sourceId)] ? store.forumStore.bySourceId[String(sourceId)].threads : undefined);
    const threadForPlace = Array.isArray(threadsSnap)
    ? threadsSnap.find((t) => t.id === msg.threadId)
    : null;

    try {
        const signed = await net.signForumMessage({
            pair,
            treeRef: { pub: treeRef.pub, universeId: treeRef.universeId },
            message: {
                ...msg,
                author: { pub: pair.pub, name: '', avatar: '💬' }
            }
        });
        if (holdForApproval) {
            net.putPendingForumMessageV3({
                ...treeRef,
                messageId: signed.id,
                record: signed
            });
            store.notify(
            store.ui.forumPendingModerationToast ||
            'Your message was sent for review. The tree owner will publish it when approved.',
            false
            );
        } else {
        await store.publishSignedForumMessageV3(sourceId, treeRef, signed, threadForPlace);
    }
    } catch (e) {
    console.warn('Network forum addMessage failed', e);
    }
    return msg;

}
