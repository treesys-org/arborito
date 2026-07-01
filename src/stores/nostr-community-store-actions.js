import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../features/nostr/api/nostr-refs.js';
import { resolveTreeInput } from '../features/sources/api/tree-aliases.js';
import { notifyAction, showDialogAction } from './shell-ui-store-actions.js';
import { maybeAutoLoadCommunityAfterAddAction } from './sources-store-actions.js';
import { maybeSyncNetworkProgressAction } from './garden-progress-store-actions.js';

function shell() {
    return getArboritoStore();
}

export async function selfDeleteNostrForumAccountAction(sourceId) {
    const store = shell();
    if (!store) return false;
    const treeRef = store.getActivePublicTreeRef?.();
    if (!treeRef) {
        notifyAction(store.ui.forumNoPublicUniverse || 'This tree is not an online public universe.', true);
        return false;
    }
    if (!isNostrNetworkAvailable()) {
        notifyAction(
            store.ui.nostrNotLoadedHint ||
                'Nostr relays unavailable (see index.html). Configure relays and reload for online identity actions.',
            true
        );
        return false;
    }
    const pair = await store.ensureNetworkUserPair?.();
    if (!pair?.pub) {
        notifyAction(
            store.ui.nostrIdentityUnavailable || 'Online identity needs HTTPS or localhost on this browser.',
            true
        );
        return false;
    }
    const uid = String(pair.pub);
    try {
        await store.nostr.deleteAccountSelf({ ...treeRef, pair });
        store.nostr.clearUserProgress({ ...treeRef, userPub: uid });
        store.forumStore.deleteMessagesByAuthorPub(sourceId, uid);
        const newPair = await createNostrPair();
        store.saveNetworkUserPair?.(newPair);
        maybeSyncNetworkProgressAction(store.userStore.getPersistenceData());
        store.update({});
        await showDialogAction({
            type: 'alert',
            title: store.ui.forumSelfAccountRemovedTitle || 'Online presence removed',
            body: store.ui.forumSelfAccountRemovedBody || '',
        });
        return true;
    } catch (e) {
        console.warn('selfDeleteNostrForumAccount', e);
        notifyAction(store.ui.forumAccountActionError || 'Could not complete the request.', true);
        return false;
    }
}

export async function maybeNotifyNetworkAccountRemovedAction(treeRef) {
    const store = shell();
    if (!store || !treeRef || !isNostrNetworkAvailable()) return;
    try {
        const pair = await store.ensureNetworkUserPair?.();
        if (!pair?.pub) return;
        const userPub = pair.pub;
        const rec = await store.nostr.getDeletedAccountRecord({ ...treeRef, userPub });
        if (!rec) return;
        const by = String(rec.by || '');
        const adminPub = String(treeRef.pub);
        if (by === userPub || by !== adminPub) return;
        const key = `arborito-nostr-admin-removal-${adminPub}-${treeRef.universeId}-${userPub}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
        const ui = store.ui;
        await showDialogAction({
            type: 'alert',
            title: ui.nostrAccountRemovedByAdminTitle || 'Account removed on this tree',
            body: ui.nostrAccountRemovedByAdminBody || '',
        });
    } catch (e) {
        console.warn('maybeNotifyNetworkAccountRemoved', e);
    }
}

export function notifyCommunityAddResultAction(res) {
    const store = shell();
    if (!store || !res) return;
    if (res.ok) {
        notifyAction(store.ui.sourcesAddNewOk || 'Added to your tree list.', false);
        return;
    }
    if (res.reason === 'maintainer_blocklist') {
        notifyAction(
            store.ui.maintainerBlocklistAddRefused ||
                store.ui.maintainerBlocklistLoadRefused ||
                'This tree is blocked in this app build (maintainer list).',
            true
        );
        return;
    }
    if (res.reason === 'duplicate') {
        const hint = res.existing?.name ? ` (${res.existing.name})` : '';
        const msg = store.ui.sourcesAddDuplicate || 'That tree is already in your list.{hint}';
        notifyAction(msg.replace(/\{hint\}/g, hint), false);
    }
}

export async function requestAddCommunitySourceAction(rawInput) {
    const store = shell();
    if (!store) return;
    const trimmed = String(rawInput || '').trim();
    if (!trimmed) return;
    const pre = resolveTreeInput(trimmed);
    if (pre.kind === 'unknown_alias') {
        const msg =
            store.ui.sourcesUnknownAlias ||
            'Unknown name “{name}”. Try an 8-character code or paste a full link.';
        notifyAction(msg.replace(/\{name\}/g, pre.tried), true);
        return;
    }
    if (pre.kind === 'code') {
        if (!isNostrNetworkAvailable()) {
            notifyAction(
                store.ui.nostrNotLoadedHint ||
                    'Nostr relays unavailable (see index.html). Configure relays and reload to use share codes.',
                true
            );
            return;
        }
        let ref = null;
        try {
            ref = await store.nostr.resolveTreeShareCode(pre.code);
        } catch (e) {
            console.warn('Share code lookup failed', e);
        }
        if (!ref) {
            notifyAction(store.ui.sourcesUnknownCode || 'Unknown or invalid code.', true);
            return;
        }
        if (store.isNostrTreeMaintainerBlocked?.(ref.pub, ref.universeId)) {
            notifyAction(
                store.ui.maintainerBlocklistLoadRefused ||
                    'This tree is blocked in this app build (maintainer list).',
                true
            );
            return;
        }
        const effective = formatNostrTreeUrl(ref.pub, ref.universeId);
        const treeRef = parseNostrTreeUrl(effective);
        let ack = false;
        try {
            ack = localStorage.getItem(`arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`) === '1';
        } catch {
            /* ignore */
        }
        if (ack || store.sourceManager.isUrlTrusted(effective)) {
            const res = store.sourceManager.addCommunitySource(trimmed, {
                resolvedNostrTreeUrl: effective,
                codeLabel: pre.code,
            });
            notifyCommunityAddResultAction(res);
            await maybeAutoLoadCommunityAfterAddAction(res);
        } else {
            store.update({ modal: { type: 'security-warning', url: effective } });
        }
        return;
    }
    const effective = pre.kind === 'resolved' ? pre.url : pre.kind === 'raw' ? pre.value : trimmed;
    const treeRef = parseNostrTreeUrl(effective);
    if (treeRef) {
        if (store.isNostrTreeMaintainerBlocked?.(treeRef.pub, treeRef.universeId)) {
            notifyAction(
                store.ui.maintainerBlocklistLoadRefused ||
                    'This tree is blocked in this app build (maintainer list).',
                true
            );
            return;
        }
        if (!isNostrNetworkAvailable()) {
            notifyAction(
                store.ui.nostrNotLoadedHint ||
                    'Nostr relays unavailable (see index.html). Configure relays and reload to open nostr:// trees.',
                true
            );
            return;
        }
        let ack = false;
        try {
            ack = localStorage.getItem(`arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`) === '1';
        } catch {
            /* ignore */
        }
        if (ack || store.sourceManager.isUrlTrusted(effective)) {
            const res = store.sourceManager.addCommunitySource(trimmed);
            notifyCommunityAddResultAction(res);
            await maybeAutoLoadCommunityAfterAddAction(res);
        } else {
            store.update({ modal: { type: 'security-warning', url: effective } });
        }
        return;
    }
    let candidate;
    try {
        candidate = new URL(effective, window.location.href).href;
    } catch {
        notifyAction(store.ui.sourcesInvalidLink || 'Could not understand that link.', true);
        return;
    }
    if (store.sourceManager.isUrlTrusted(candidate)) {
        const res = store.sourceManager.addCommunitySource(trimmed);
        notifyCommunityAddResultAction(res);
        await maybeAutoLoadCommunityAfterAddAction(res);
    } else {
        store.update({ modal: { type: 'security-warning', url: candidate } });
    }
}

/** Store.prototype — Nostr community directory. */
export const storeNostrCommunityMethods = {
    selfDeleteNostrForumAccount: selfDeleteNostrForumAccountAction,
    maybeNotifyNetworkAccountRemoved: maybeNotifyNetworkAccountRemovedAction,
    notifyCommunityAddResult: notifyCommunityAddResultAction,
    requestAddCommunitySource: requestAddCommunitySourceAction,
};
