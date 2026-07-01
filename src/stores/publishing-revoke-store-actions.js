import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../features/nostr/api/nostr-refs.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { generateTreeShareCode } from '../features/sources/api/share-code.js';
import { randomUUIDSafe } from '../shared/lib/secure-web-crypto.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import { yieldToPaint } from '../shared/lib/yield-to-paint.js';
import { usesGlobalDirectoryPointerForTorrent } from '../features/p2p-webtorrent/api/global-directory-torrent-runtime.js';
import { escHtml as esc, escHtml as escAttr } from '../shared/lib/html-escape.js';

import { shell } from './publishing-publish-revoke-helpers.js';

export async function _revokePublicTreeCoreAction(treeRef, opts = {}) {
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    if (!treeRef) return { ok: false, reason: 'no-tree' };
    if (!isNostrNetworkAvailable()) {
        store.notify(
        ui.nostrNotLoadedHint ||
        'Nostr relays unavailable (see index.html). Configure relays and reload to retract.',
        true
        );
        return { ok: false, reason: 'nostr-unavailable' };
    }
    await ensureConnectedNostr(store);
    const pair = store.getNostrPublisherPair(treeRef.pub);
    if (!(pair && pair.priv)) {
        await store.showDialog({
            type: 'alert',
            title: ui.revokePublicTreeNoKeyTitle || 'Publisher key not found',
            body:
            ui.revokePublicTreeNoKeyBody ||
            'Retracting requires the same browser profile that published store tree. If you cleared storage or use another device, you cannot sign a retraction from here.',
            confirmText: ui.dialogOkButton || 'OK'
        });
        return { ok: false, reason: 'no-key' };
    }
    const ok = await store.showDialog({
        type: 'confirm',
        title: ui.revokePublicTreeConfirmTitle || 'Retract store public tree?',
        body:
        ui.revokePublicTreeConfirmBody ||
        'This will publish a <strong>retraction</strong> on the network and clear the bundle for cooperating peers. People who already copied data elsewhere might still have it. Continue?',
        bodyHtml: true,
        danger: true,
        confirmText: ui.revokePublicTreeConfirmButton || 'Retract',
        cancelText: ui.cancel || 'Cancel'
    });
    if (!ok) return { ok: false, reason: 'cancelled' };
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
    await store.showDialog({
        type: 'alert',
        title: ui.revokePublicTreeSuccessTitle || 'Tree retracted',
        body:
        ui.revokePublicTreeSuccessBody ||
        'The public network was asked to stop serving store tree. You can publish again with a new link anytime.',
        confirmText: ui.dialogOkButton || 'OK'
    });
    store.update({});
    return { ok: true };
    } catch (e) {
    console.warn('_revokePublicTreeCore', e);
    store.notify(ui.revokePublicTreeError || 'Could not complete retraction.', true);
    return { ok: false, reason: 'error' };
    }

}
export async function revokePublicTreeInteractiveAction(opts = {}) {
    const store = shell();
    if (!store) return undefined;
    const treeUrl = String((opts && (opts.publicTreeUrl || opts.nostrTreeUrl)) || '');
    const treeRef = treeUrl ? parseNostrTreeUrl(treeUrl) : store.getActivePublicTreeRef();
    if (!treeRef) {
        await store.revokeActivePublicTreeInteractive();
        return;
    }
    await store._revokePublicTreeCore(treeRef, {
        branchIdToUnlink: opts?.branchIdToUnlink || null
    });

}
export async function revokeActivePublicTreeInteractiveAction() {
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    const treeRef = store.getActivePublicTreeRef();
    if (!treeRef) {
        store.notify(ui.revokePublicTreeNoUniverse || 'Switch to a public tree first.', true);
        return;
    }
    const result = await store._revokePublicTreeCore(treeRef);
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
        path: []
    });
    try {
        localStorage.removeItem('arborito-active-source-id');
        localStorage.removeItem('arborito-active-source-meta');
    } catch {
    /* ignore */
    }
    }

}
