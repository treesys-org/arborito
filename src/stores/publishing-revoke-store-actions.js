import { isNostrNetworkAvailable, parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import {
    resolvePublishContentKind,
    resolveUnpublishDialogCopy,
} from '../features/publishing/api/resolve-publish-content-copy.js';

import { shell } from './publishing-publish-revoke-helpers.js';
import { notifyPublishingChanged } from './store-notify.js';

export async function _revokePublicTreeCoreAction(treeRef, opts = {}) {
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    if (!treeRef) return { ok: false, reason: 'no-tree' };
    const copy = resolveUnpublishDialogCopy(ui, resolvePublishContentKind(opts));
    if (!isNostrNetworkAvailable()) {
        store.notify(
            ui.nostrNotLoadedHint ||
                'Nostr relays unavailable (see index.html). Configure relays and reload to unpublish.',
            true
        );
        return { ok: false, reason: 'nostr-unavailable' };
    }
    await ensureConnectedNostr(store);
    const pair = store.getNostrPublisherPair(treeRef.pub);
    if (!(pair && pair.priv)) {
        if (opts.silent) return { ok: false, reason: 'no-key' };
        await store.alert(copy.noKeyBody, ui.revokePublicTreeNoKeyTitle || 'Publisher key not found', {
            confirmText: ui.dialogOkButton || 'OK',
            dialogIcon: '🔑',
        });
        return { ok: false, reason: 'no-key' };
    }
    if (!opts.skipConfirm) {
        const ok = await store.showDialog({
            type: 'confirm',
            title: copy.confirmTitle,
            body: copy.confirmBody,
            bodyHtml: false,
            danger: true,
            confirmText: ui.revokePublicTreeConfirmButton || 'Unpublish',
            cancelText: ui.cancel || 'Cancel',
        });
        if (!ok) return { ok: false, reason: 'cancelled' };
    }
    try {
        await store.nostr.revokeUniverse({ pair, universeId: treeRef.universeId, reason: '' });
        try {
            await store.nostr.putGlobalTreeDirectoryDelist({ pair, universeId: treeRef.universeId });
        } catch (e2) {
            console.warn('global directory delist failed', e2);
        }
        if (opts.branchIdToUnlink && store.userStore?.clearBranchPublishedNetworkUrl) {
            store.userStore.clearBranchPublishedNetworkUrl(opts.branchIdToUnlink);
        }
        if (opts.treeIdToUnlink && store.userStore?.clearTreePublishedNetworkUrl) {
            store.userStore.clearTreePublishedNetworkUrl(opts.treeIdToUnlink);
        }
        try {
            const revokedUrl = `nostr://${treeRef.pub}/${treeRef.universeId}`;
            const sm = store.sourceManager;
            const list = Array.isArray(sm?.state?.communitySources) ? sm.state.communitySources : [];
            for (const s of list) {
                const u = String(s?.url || '');
                if (u === revokedUrl) sm.removeCommunitySource(s.id);
            }
        } catch (e3) {
            console.warn('post-revoke source cleanup failed', e3);
        }
        if (!opts.silent) {
            await store.alert(copy.successBody, copy.successTitle, {
                confirmText: ui.dialogOkButton || 'OK',
                dialogIcon: '✅',
            });
        }
        notifyPublishingChanged(store);
        return { ok: true };
    } catch (e) {
        console.warn('_revokePublicTreeCore', e);
        store.notify(ui.revokePublicTreeError || 'Could not unpublish.', true);
        return { ok: false, reason: 'error' };
    }
}

export async function revokePublicTreeInteractiveAction(opts = {}) {
    const store = shell();
    if (!store) return undefined;
    const treeUrl = String((opts && (opts.publicTreeUrl || opts.nostrTreeUrl)) || '');
    const treeRef = treeUrl ? parseNostrTreeUrl(treeUrl) : store.getActivePublicTreeRef();
    if (!treeRef) {
        return store.revokeActivePublicTreeInteractive();
    }
    return store._revokePublicTreeCore(treeRef, {
        branchIdToUnlink: opts?.branchIdToUnlink || null,
        treeIdToUnlink: opts?.treeIdToUnlink || null,
        contentKind: opts?.contentKind || null,
    });
}

export async function revokeActivePublicTreeInteractiveAction() {
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    const treeRef = store.getActivePublicTreeRef();
    if (!treeRef) {
        store.notify(ui.revokePublicTreeNoUniverse || 'Open your own public online branch first.', true);
        return;
    }
    const result = await store._revokePublicTreeCore(treeRef, { contentKind: 'network' });
    if (!result?.ok) return;
    const defaultSrc = await store.sourceManager.getDefaultSource();
    if (defaultSrc) {
        await store.loadData(defaultSrc, true);
    } else {
        store.update({
            activeSource: null,
            data: null,
            rawGraphData: null,
            loading: false,
            selectedNode: null,
            previewNode: null,
            path: [],
        });
        try {
            localStorage.removeItem('arborito-active-source-id');
            localStorage.removeItem('arborito-active-source-meta');
        } catch {
            /* ignore */
        }
    }
}
