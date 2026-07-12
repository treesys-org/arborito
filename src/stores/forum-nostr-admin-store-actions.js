import { getArboritoStore } from '../core/store-singleton.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { getConnectedNostr } from '../shared/lib/connected-services/index.js';

function shell() {
    return getArboritoStore();
}

async function nostrClient() {
    const store = shell();
    if (!store) return null;
    return getConnectedNostr(store);
}

/** Nostr forum methods on `Store.prototype`. */

export async function setForumBanForActiveTreeAction({ targetPub, banned }) {
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    const treeRef = store.getActivePublicTreeRef();
    if (!treeRef || !isNostrNetworkAvailable()) return false;
    if (!store.canModerateForum()) {
        store.notify(ui.governanceForumPolicyNoPermission || 'Only the tree owner or an invited editor can do store.', true);
        return false;
    }
    const actorPair = store.getNostrPublisherPair(treeRef.pub) || (await store.ensureNetworkUserPair());
    if (!(actorPair && actorPair.pub)) {
        store.notify(ui.nostrIdentityUnavailable || 'Online identity unavailable.', true);
        return false;
    }
    const tp = String(targetPub || '').trim();
    if (!tp) return false;
    const net = await nostrClient();
    if (!net) return false;
    try {
        await net.putForumBanV3({
            ownerPub: treeRef.pub,
            universeId: treeRef.universeId,
            pair: actorPair,
            targetPub: tp,
            action: banned ? 'ban' : 'unban'
        });
        if (banned) {
            const src = store.state.activeSource;
            if (src && src.id) {
                store.forumStore.deleteMessagesByAuthorPub(src.id, tp);
            }
            try {
                await net.deleteAccountByAdmin({
                    pub: treeRef.pub,
                    universeId: treeRef.universeId,
                    userPub: tp,
                    adminPair: actorPair
                });
            } catch (e) {
            console.warn('setForumBanForActiveTree: deleteAccountByAdmin failed', e);
        }
    }
    store.notify(banned ? (ui.forumBanOk || 'User banned and their messages removed.') : (ui.forumUnbanOk || 'User unbanned.'), false);
    return true;
    } catch (e) {
    console.warn('setForumBanForActiveTree', e);
    store.notify(ui.forumBanFail || 'Could not change ban.', true);
    return false;
    }

}
export async function selfDeleteForumMessageAction(sourceId, messageId) {
    const store = shell();
    if (!store) return undefined;
    const treeRef = store.getActivePublicTreeRef();
    const pair = await store.ensureNetworkUserPair();
    const ok = store.forumStore.deleteMessage(sourceId, messageId, {
        actor: (pair && pair.pub) || null
});
if (!treeRef || !ok) return ok;
if (!(pair && pair.pub) || !isNostrNetworkAvailable()) return ok;
const net = await nostrClient();
if (!net) return ok;
try {
    const rec = await net.signDeletion({ adminPair: pair, kind: 'delete_message', targetId: messageId });
    net.putDeletedMessage({ ...treeRef, messageId, record: rec });
} catch (e) {
    console.warn('Network forum self delete failed', e);
            }
            return ok;

}
export function moderateDeleteForumMessageAction(sourceId, messageId, meta = {}) {
    const store = shell();
    if (!store) return undefined;
    const ok = store.forumStore.deleteMessage(sourceId, messageId, meta);
    const treeRef = store.getActivePublicTreeRef();
    if (treeRef && ok && isNostrNetworkAvailable()) {
        void (async () => {
            try {
                const net = await nostrClient();
                const adminPair = store.getNostrPublisherPair(treeRef.pub);
                if (net && adminPair) net.deleteMessage({ ...treeRef, messageId, adminPair });
            } catch (e) {
                console.warn('Network forum deleteMessage failed', e);
            }
        })();
    }
    return ok;

}
export function moderateDeleteForumThreadAction(sourceId, threadId, meta = {}) {
    const store = shell();
    if (!store) return undefined;
    const ok = store.forumStore.deleteThread(sourceId, threadId, meta);
    const treeRef = store.getActivePublicTreeRef();
    if (treeRef && ok && isNostrNetworkAvailable()) {
        void (async () => {
            try {
                const net = await nostrClient();
                const adminPair = store.getNostrPublisherPair(treeRef.pub);
                if (net && adminPair) net.deleteThread({ ...treeRef, threadId, adminPair });
            } catch (e) {
                console.warn('Network forum deleteThread failed', e);
            }
        })();
    }
    return ok;

}
