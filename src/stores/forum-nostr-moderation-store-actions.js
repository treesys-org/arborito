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

export function _forumModerationCacheKeyAction(treeRef) {
    const store = shell();
    if (!store) return undefined;
    return treeRef ? `${String(treeRef.pub)}:${String(treeRef.universeId)}` : '';

}
export async function getForumModerationModeForActiveTreeAction(treeRef) {
    const store = shell();
    if (!store) return undefined;
    if (!treeRef || !isNostrNetworkAvailable()) return 'free';
    const k = store._forumModerationCacheKey(treeRef);
    const now = Date.now();
    if ((store._forumModCache && store._forumModCache.key) === k && now - (store._forumModCache.t || 0) < 90_000) {
        return store._forumModCache.mode === 'strict' ? 'strict' : 'free';
    }
    let mode = 'free';
    const net = await nostrClient();
    if (net) {
        try {
            mode = await net.loadForumModerationPolicyV3({ ...treeRef });
        } catch (e) {
            console.warn('getForumModerationModeForActiveTree', e);
        }
    }
    store._forumModCache = { key: k, mode, t: now };
    return mode === 'strict' ? 'strict' : 'free';

}
export function invalidateForumModerationCacheAction() {
    const store = shell();
    if (!store) return undefined;
    store._forumModCache = null;

}
export async function setForumModerationPolicyModeAction(mode) {
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    const treeRef = store.getActivePublicTreeRef();
    if (!treeRef || !isNostrNetworkAvailable()) {
        store.notify(ui.governanceForumPolicyNeedNetwork || 'Open your published public tree to change forum settings.', true);
        return false;
    }
    if (!store.canModerateForum()) {
        store.notify(ui.governanceForumPolicyNoPermission || 'Only the tree owner (publisher key on store device) can change store.', true);
        return false;
    }
    const adminPair = store.getNostrPublisherPair(treeRef.pub);
    if (!(adminPair && adminPair.priv)) {
        store.notify(ui.governanceForumPolicyNoPermission || 'Only the tree owner can change store.', true);
        return false;
    }
    try {
        const net = await nostrClient();
        if (!net) throw new Error('nostr unavailable');
        await net.putForumModerationPolicyV3({
            ...treeRef,
            adminPair,
            mode: mode === 'strict' ? 'strict' : 'free'
        });
        store.invalidateForumModerationCache();
        store.notify(ui.forumPolicySavedOk || 'Forum moderation setting saved.', false);
        notifyForumChanged(store);
        return true;
    } catch (e) {
    console.warn('setForumModerationPolicyMode', e);
    store.notify(ui.forumPolicySaveError || 'Could not save forum setting.', true);
    return false;
    }

}
export async function listForumPendingSummariesForActiveTreeAction() {
    const store = shell();
    if (!store) return undefined;
    const treeRef = store.getActivePublicTreeRef();
    if (!treeRef || !isNostrNetworkAvailable()) return [];
    const net = await nostrClient();
    if (!net) return [];
    try {
        const ids = await net.listPendingForumMessageIdsV3({ ...treeRef });
        const out = [];
        for (const id of ids) {
            const rec = await net.loadPendingForumMessageV3({ ...treeRef, messageId: id });
            if (!rec || typeof rec !== 'object' || !String(rec.body || '').trim()) continue;
            out.push({
                id: String(rec.id || id),
                threadId: String(rec.threadId || ''),
                createdAt: String(rec.createdAt || ''),
                bodyPreview:
                String(rec.body || '').length > 140
                ? `${String(rec.body || '').slice(0, 140)}…`
                : String(rec.body || '')
            });
        }
        return out;
    } catch (e) {
    console.warn('listForumPendingSummariesForActiveTree', e);
    return [];
    }

}
export async function approveForumPendingMessageAction(sourceId, messageId) {
    const store = shell();
    if (!store) return undefined;
    if (!store.canModerateForum()) return false;
    const treeRef = store.getActivePublicTreeRef();
    if (!treeRef || !isNostrNetworkAvailable()) return false;
    const mid = String(messageId || '');
    if (!mid) return false;
    const net = await nostrClient();
    if (!net) return false;
    try {
        const signed = await net.loadPendingForumMessageV3({ ...treeRef, messageId: mid });
        if (!signed || typeof signed !== 'object' || !signed.sig) return false;
        const threadsSnap = (store.forumStore.bySourceId[String(sourceId)] ? store.forumStore.bySourceId[String(sourceId)].threads : undefined);
        const threadForPlace = Array.isArray(threadsSnap)
        ? threadsSnap.find((t) => t.id === signed.threadId)
        : null;
        const ok = await store.publishSignedForumMessageV3(sourceId, treeRef, signed, threadForPlace);
        if (!ok) {
            store.notify(store.ui.forumApproveFailed || 'Could not publish approved message.', true);
            return false;
        }
        net.clearPendingForumMessageV3({ ...treeRef, messageId: mid });
        store.forumStore.setMessagePendingApproval(sourceId, mid, false);
        notifyForumChanged(store);
        store.notify(store.ui.forumApprovedOk || 'Message approved and published.', false);
        return true;
    } catch (e) {
    console.warn('approveForumPendingMessage', e);
    store.notify(store.ui.forumApproveFailed || 'Could not approve message.', true);
    return false;
    }

}
export async function rejectForumPendingMessageAction(sourceId, messageId) {
    const store = shell();
    if (!store) return undefined;
    if (!store.canModerateForum()) return false;
    const treeRef = store.getActivePublicTreeRef();
    if (!treeRef || !isNostrNetworkAvailable()) return false;
    const mid = String(messageId || '');
    if (!mid) return false;
    const net = await nostrClient();
    if (!net) return false;
    try {
        net.clearPendingForumMessageV3({ ...treeRef, messageId: mid });
        store.forumStore.deleteMessage(sourceId, mid, {
            actor: (store.getNetworkUserPair() ? store.getNetworkUserPair().pub : undefined) || 'moderator'
        });
        notifyForumChanged(store);
        store.notify(store.ui.forumRejectedOk || 'Pending message removed.', false);
        return true;
} catch (e) {
    console.warn('rejectForumPendingMessage', e);
    return false;
            }

}
