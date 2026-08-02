import { getArboritoStore } from '../core/store-singleton.js';
import { DEMO_BRANCH_ID } from '../core/demo/arborito-demo-ids.js';
import { isNostrNetworkAvailable } from '../features/nostr/api/nostr-network-env.js';
import { formatNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import {
    getConnectedNostr,
    warmNostrRelayConnections,
} from '../shared/lib/connected-services/index.js';
import { pickTitleForLang, resolveDirectoryRowTitle } from '../shared/lib/catalog-titles.js';
import { notifyCommunityChanged, notifyIdentityChanged } from './store-notify.js';
import {
    isPrivateAccountDeleted,
    prunePrivateAccountDeletedAgainstLive,
} from '../core/user-store/private-account-delete-tombstones.js';

function shell() {
    return getArboritoStore();
}

export function _scheduleLoadPrivateTreesAfterSignInAction(username) {
    const store = shell();
    if (!store) return undefined;

            const name = String(username || '').trim();
            if (!name) return;
            queueMicrotask(async () => {
                try {
                    await store.loadPrivateTreesFromAccount(name);
                } catch (e) {
                    console.warn('Private trees pull failed', e);
                }
            });

}

/**
 * Pull encrypted private branch/tree drafts from the account into the local garden.
 * Safe to call on boot and when opening Fuentes (idempotent upserts).
 * @param {string} username
 * @param {{ retry?: boolean }} [opts] retry (default true): one extra pull after warm when
 *   nothing was restored — useful on boot/F5, skip from Fuentes to keep UI snappy.
 * @returns {Promise<number>} newly ingested or updated entries
 */
export async function loadPrivateTreesFromAccountAction(username, opts = {}) {
    const store = shell();
    if (!store) return 0;

    const wantRetry = opts.retry !== false;
    if (wantRetry) store._privateTreesPullWantRetry = true;

    if (store._privateTreesPullInFlight) {
        try {
            const n = await store._privateTreesPullInFlight;
            /* Shared pull already restored something, or this caller did not need retry. */
            if (n > 0 || !wantRetry) return n;
            /* Boot wanted retry but coalesced into a no-retry Fuentes pull that got 0 — fall through. */
        } catch {
            if (!wantRetry) return 0;
        }
    }

    const run = (async () => {
        if (!isNostrNetworkAvailable()) return 0;
        const name = String(username || '').trim();
        if (!name) return 0;
        /* Honor retry if this caller or a waiter coalesced into this pull needs it. */
        const allowRetry = wantRetry || !!store._privateTreesPullWantRetry;
        store._privateTreesPullWantRetry = false;

        const net = await getConnectedNostr(store);
        if (!net || typeof net.listPrivateTreeBlobsOnce !== 'function') {
            console.warn('[arborito] private trees pull skipped: nostr not ready');
            return 0;
        }

        try {
            await store.userStore?.ensureBranchesHydrated?.();
        } catch {
            /* ignore */
        }

        let pair = await store.ensureNetworkUserPair();
        if (!(pair && pair.pub)) {
            console.warn('[arborito] private trees pull skipped: no network user pair');
            return 0;
        }

        const ingestList = async (rows) => {
            let added = 0;
            const restoredIds = new Set();
            let decryptFailures = 0;
            for (const row of rows || []) {
                try {
                    const treeId = String(row.treeId || '').trim();
                    if (!treeId || restoredIds.has(treeId)) continue;
                    const body = await net.unpackPrivateTreeFromSync({
                        pair,
                        manifestCiphertext: row.manifestCiphertext,
                        partCiphertexts: row.partCiphertexts,
                    });
                    if (!body || typeof body !== 'object') {
                        decryptFailures += 1;
                        continue;
                    }
                    const id = String(body.id || treeId).trim();
                    if (!id || restoredIds.has(id)) continue;
                    if (isPrivateAccountDeleted(id)) {
                        restoredIds.add(id);
                        continue;
                    }
                    const isComposed =
                        body.kind === 'composed-tree' ||
                        (Array.isArray(body.branchRefs) && !body.data);
                    let ok = false;
                    if (isComposed) {
                        ok = !!store.userStore.upsertPrivateComposedTreeFromAccount?.({
                            id,
                            name: String(body.name || id),
                            branchRefs: Array.isArray(body.branchRefs) ? body.branchRefs : [],
                            presentation: body.presentation || null,
                            forkOf: body.forkOf || null,
                            updatedAt: row.updatedAt || body.updatedAt,
                        });
                    } else {
                        const data = body.data && typeof body.data === 'object' ? body.data : null;
                        if (!data) continue;
                        ok = !!store.userStore.upsertPrivateBranchFromAccount({
                            id,
                            name: String(body.name || data.universeName || id),
                            data,
                            updatedAt: row.updatedAt,
                        });
                    }
                    if (ok) {
                        restoredIds.add(id);
                        added += 1;
                    } else if (
                        store.userStore?.isBranchPrivateSyncedFromAccount?.(id) ||
                        store.userStore?.isTreePrivateSyncedFromAccount?.(id)
                    ) {
                        restoredIds.add(id);
                    }
                } catch (e) {
                    decryptFailures += 1;
                    console.warn('[arborito] private tree ingest failed', e);
                }
            }
            return { added, restored: restoredIds.size, decryptFailures };
        };

        let list = [];
        try {
            list = await net.listPrivateTreeBlobsOnce(name);
        } catch (e) {
            console.warn('[arborito] listPrivateTreeBlobsOnce failed', e);
            list = [];
        }
        if (!Array.isArray(list)) list = [];

        let result = await ingestList(list);

        /*
         * Retry only when relays returned blobs but none could be restored (incomplete
         * multipart / wrong pair). Do NOT retry on an empty list — that is the common
         * case (no private drafts) and would slow every sign-in/F5 by >1s.
         * Re-read want-retry flag in case another caller joined mid-flight.
         */
        const shouldRetry =
            (allowRetry || !!store._privateTreesPullWantRetry) &&
            list.length > 0 &&
            result.restored === 0;
        store._privateTreesPullWantRetry = false;
        if (shouldRetry) {
            try {
                await warmNostrRelayConnections(store, { probe: false, timeoutMs: 8000 });
            } catch {
                /* ignore */
            }
            await new Promise((r) => setTimeout(r, 1200));
            try {
                await store._restoreOrPublishUserPairEscrow?.(name);
            } catch {
                /* ignore */
            }
            const pair2 = await store.ensureNetworkUserPair();
            if (pair2?.pub) pair = pair2;
            try {
                list = await net.listPrivateTreeBlobsOnce(name);
            } catch {
                list = [];
            }
            if (Array.isArray(list) && list.length) {
                result = await ingestList(list);
            }
        }

        const liveIds = (Array.isArray(list) ? list : [])
            .map((row) => String(row?.treeId || '').trim())
            .filter(Boolean);
        prunePrivateAccountDeletedAgainstLive(liveIds);
        /* Re-tombstone drafts the user deleted locally but relays still list as live. */
        for (const id of liveIds) {
            if (!isPrivateAccountDeleted(id)) continue;
            try {
                await store.unpublishPrivateBranch?.(id);
            } catch (e) {
                console.warn('[arborito] re-tombstone deleted private draft failed', id, e);
            }
        }

        store.sourceManager.refreshPrivateAccountSources?.();
        /* Only broadcast when the garden actually gained/updated entries. */
        if (result.added > 0) {
            try {
                store.userStore?.notifyCatalogChanged?.();
            } catch {
                /* ignore */
            }
            notifyCommunityChanged(store);
            notifyIdentityChanged(store);
        }
        if (result.decryptFailures && !result.restored) {
            console.warn(
                '[arborito] private trees listed but none decrypted — check same password/sync key on both devices'
            );
        }
        return result.added;
    })();

    store._privateTreesPullInFlight = run;
    try {
        return await run;
    } finally {
        if (store._privateTreesPullInFlight === run) {
            store._privateTreesPullInFlight = null;
        }
    }
}

/**
 * Upload a local branch as an encrypted account draft (kind 30292).
 * @param {string} [treeId] Branch id; defaults to the active `branch://` source.
 * @param {{ quiet?: boolean }} [opts] quiet: skip toast (used for auto-republish on edit).
 */
export async function publishBranchAsPrivateAction(treeId, opts = {}) {
    const store = shell();
    if (!store) return undefined;

    const ui = store.ui;
    const quiet = !!opts.quiet;
    /* Full first upload without success toast (auto-sync / bulk register). */
    const silent = !!opts.silent;
    if (!store.isSignedIn()) {
        throw new Error(ui.syncLoginNoAccount || 'Sign in with your account first.');
    }
    const sess = store._authSession;
    const name = String(sess?.username || '').trim();
    if (!name) {
        throw new Error(ui.syncLoginNoAccount || 'Sign in with your account first.');
    }
    if (!isNostrNetworkAvailable()) {
        throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
    }
    if (typeof store.hasGdprNetworkConsent === 'function' && !store.hasGdprNetworkConsent()) {
        throw new Error(
            ui.privateTreesSyncNetworkHint ||
                'Turn on the network in Privacy & data to sync this branch.'
        );
    }
    let localId = String(treeId || '').trim();
    if (!localId) {
        const srcUrl = String(store.state.activeSource?.url || '');
        if (!srcUrl.startsWith('branch://')) {
            throw new Error(ui.privateTreesOnlyLocalSource || 'Open a local tree first.');
        }
        localId = srcUrl.slice('branch://'.length);
    }
    /* Bundled demo is local-only; never upload as an account draft. */
    if (localId === DEMO_BRANCH_ID) {
        throw new Error(
            ui.sourcesDemoBranchDeleteBlocked || 'Demo branch cannot sync to account.'
        );
    }
    const entry = (store.userStore.state.branches || []).find((t) => t.id === localId);
    if (!entry) {
        throw new Error(ui.privateTreesLocalMissing || 'That local tree is missing.');
    }
    const pair = await store.ensureNetworkUserPair();
    if (!(pair && pair.pub)) {
        throw new Error(ui.nostrNotLoadedHint || 'Could not derive your user key.');
    }
    /* Quiet path: abort if user already turned sync off (or never on). */
    if (quiet && !store.userStore.isBranchPrivateSyncedFromAccount?.(localId)) {
        return;
    }
    const net = await getConnectedNostr(store);
    if (!net || typeof net.putPrivateTreeBlob !== 'function') {
        throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
    }
    const publishedNetworkUrl = String(entry.publishedNetworkUrl || '').trim() || null;
    const publishedShareCode =
        String(entry.publishedShareCode || entry.data?.meta?.shareCode || '').trim() || null;
    const body = {
        v: 1,
        id: localId,
        name: entry.name || entry.data?.universeName || localId,
        data: entry.data,
        updatedAt: new Date().toISOString(),
        /* Keep public bind across devices so delete can revoke/delist Discover. */
        ...(publishedNetworkUrl ? { publishedNetworkUrl } : {}),
        ...(publishedShareCode ? { publishedShareCode } : {}),
    };
    await net.putPrivateTreeBlob({ username: name, treeId: localId, pair, body });
    /*
     * Race: Stop sync may have run while put was in flight. Do not re-mark;
     * tombstone again so the just-uploaded blob does not stick.
     */
    if (quiet) {
        if (!store.userStore.isBranchPrivateSyncedFromAccount?.(localId)) {
            try {
                await store.unpublishPrivateBranch?.(localId);
            } catch (e) {
                console.warn('Private account branch race tombstone failed', e);
            }
        }
        return;
    }
    store.userStore.markBranchAsPrivateSyncedFromAccount?.(localId);
    store.sourceManager.refreshPrivateAccountSources?.();
    notifyCommunityChanged(store);
    notifyIdentityChanged(store);
    try {
        store.publishInstalledSourcesForAccount?.({ immediate: true });
    } catch {
        /* ignore */
    }
    try {
        /* Private branches have no public treeRef; push care via account channel. */
        void store.reconcileNetworkProgress?.();
    } catch {
        /* ignore */
    }
    if (!silent) {
        store.notify(ui.privateTreesPublishedOk || 'Private tree synced to your account.', false);
    }
}

export async function publishActiveBranchAsPrivateAction() {
    return publishBranchAsPrivateAction();
}

/**
 * After register: upload every local authored branch as an encrypted account draft.
 * Silent by default (no per-branch toasts). Skips demo and already-synced ids.
 * @param {{ quiet?: boolean, silent?: boolean }} [opts]
 * @returns {Promise<{ synced: number }>}
 */
export async function syncAllLocalPrivateBranchesToAccountAction(opts = {}) {
    const store = shell();
    if (!store) return { synced: 0 };
    if (!store.isSignedIn?.()) return { synced: 0 };

    const silent = opts.silent !== false;
    try {
        await store.userStore?.ensureBranchesHydrated?.();
    } catch {
        /* ignore */
    }
    const branches = Array.isArray(store.userStore?.state?.branches)
        ? store.userStore.state.branches
        : [];
    let synced = 0;
    for (const entry of branches) {
        const id = String(entry?.id || '').trim();
        if (!id || id === DEMO_BRANCH_ID) continue;
        if (store.userStore?.isBranchPrivateSyncedFromAccount?.(id)) continue;
        try {
            await publishBranchAsPrivateAction(id, { silent: true });
            synced += 1;
        } catch (e) {
            console.warn('[arborito] register bulk private sync failed', id, e);
        }
    }
    if (!silent && synced > 0) {
        const ui = store.ui;
        store.notify(
            (ui.registerSyncLocalDone || 'Local courses synced to your account.').replace(
                '{count}',
                String(synced)
            ),
            false
        );
    }
    return { synced };
}

/** Debounced quiet republish for branches marked account-synced that were just dirtied. */
export function maybeSyncPrivateAccountBranchesAction() {
    const store = shell();
    if (!store?.userStore) return;
    if (!store.isSignedIn?.()) return;
    if (!isNostrNetworkAvailable()) return;
    try {
        if (typeof store.hasGdprNetworkConsent === 'function' && !store.hasGdprNetworkConsent()) {
            return;
        }
    } catch {
        /* ignore */
    }
    const ids = store.userStore.takePrivateAccountSyncDirtyIds?.() || [];
    if (!ids.length) return;
    if (!store._privateAccountSyncPending) store._privateAccountSyncPending = new Set();
    for (const id of ids) store._privateAccountSyncPending.add(id);
    clearTimeout(store._privateAccountSyncTimer);
    store._privateAccountSyncTimer = setTimeout(() => {
        const pending = [...(store._privateAccountSyncPending || [])];
        store._privateAccountSyncPending = new Set();
        if (!store.isSignedIn?.()) return;
        try {
            if (typeof store.hasGdprNetworkConsent === 'function' && !store.hasGdprNetworkConsent()) {
                return;
            }
        } catch {
            /* ignore */
        }
        for (const id of pending) {
            if (id === DEMO_BRANCH_ID) continue;
            if (!store.userStore?.isBranchPrivateSyncedFromAccount?.(id)) continue;
            void publishBranchAsPrivateAction(id, { quiet: true }).catch((e) => {
                console.warn('Private account branch sync failed', e);
                /* Re-queue so a later edit/consent restore can retry. */
                if (store.userStore?.isBranchPrivateSyncedFromAccount?.(id)) {
                    store.userStore.markBranchDirty?.(id);
                }
            });
        }
    }, 1200);
}

/** Cancel debounced Care / private-branch / installed-sources publishes (consent off, sign-out). */
export function cancelPendingAccountSyncTimersAction() {
    const store = shell();
    if (!store) return;
    clearTimeout(store._privateAccountSyncTimer);
    store._privateAccountSyncTimer = null;
    store._privateAccountSyncPending = new Set();
    clearTimeout(store._nostrProgressSyncTimer);
    store._nostrProgressSyncTimer = null;
    clearTimeout(store._installedSourcesPublishTimer);
    store._installedSourcesPublishTimer = null;
    if (store._installedSourcesBgTimer) {
        clearInterval(store._installedSourcesBgTimer);
        store._installedSourcesBgTimer = null;
    }
    store._installedSourcesLastRemote = null;
    store._installedSourcesPullOk = false;
    store._installedSourcesEverHadRemote = false;
    store._installedSourcesRemoved = new Set();
    store._installedSourcesRefreshForcePublish = false;
    store._installedSourcesRefreshAgain = false;
    try {
        store.userStore?.takePrivateAccountSyncDirtyIds?.();
    } catch {
        /* ignore */
    }
}

/**
 * Upload composed playlist (refs + presentation) as encrypted account draft.
 * Member branch curricula stay on their own private sync / network URLs.
 */
export async function publishComposedTreeAsPrivateAction(treeId, opts = {}) {
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    const silent = !!opts.silent;
    if (!store.isSignedIn()) {
        throw new Error(ui.syncLoginNoAccount || 'Sign in with your account first.');
    }
    const name = String(store._authSession?.username || '').trim();
    if (!name) {
        throw new Error(ui.syncLoginNoAccount || 'Sign in with your account first.');
    }
    if (!isNostrNetworkAvailable()) {
        throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
    }
    if (typeof store.hasGdprNetworkConsent === 'function' && !store.hasGdprNetworkConsent()) {
        throw new Error(
            ui.privateTreesSyncNetworkHint ||
                'Turn on the network in Privacy & data to sync this tree.'
        );
    }
    const tid = String(treeId || store.state.activeSource?.treeId || '').trim();
    const entry = tid ? store.userStore.getTree?.(tid) : null;
    if (!entry) {
        throw new Error(ui.privateTreesLocalMissing || 'That local tree is missing.');
    }
    const pair = await store.ensureNetworkUserPair();
    if (!(pair && pair.pub)) {
        throw new Error(ui.nostrNotLoadedHint || 'Could not derive your user key.');
    }
    const net = await getConnectedNostr(store);
    if (!net || typeof net.putPrivateTreeBlob !== 'function') {
        throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
    }
    const publishedNetworkUrl = String(entry.publishedNetworkUrl || '').trim() || null;
    const publishedShareCode = String(entry.publishedShareCode || '').trim() || null;
    const body = {
        v: 1,
        kind: 'composed-tree',
        id: tid,
        name: entry.name || tid,
        branchRefs: Array.isArray(entry.branchRefs) ? entry.branchRefs : [],
        presentation: entry.presentation || null,
        forkOf: entry.forkOf || null,
        updatedAt: new Date().toISOString(),
        ...(publishedNetworkUrl ? { publishedNetworkUrl } : {}),
        ...(publishedShareCode ? { publishedShareCode } : {}),
    };
    await net.putPrivateTreeBlob({ username: name, treeId: tid, pair, body });
    store.userStore.markTreeAsPrivateSyncedFromAccount?.(tid);
    store.sourceManager.refreshPrivateAccountSources?.();
    notifyCommunityChanged(store);
    notifyIdentityChanged(store);
    try {
        /* If this composed tree is open, last-active becomes tree://… for other devices. */
        store.publishInstalledSourcesForAccount?.({ immediate: true });
    } catch {
        /* ignore */
    }
    if (!silent) {
        store.notify(
            ui.privateComposedTreePublishedOk ||
                ui.privateTreesPublishedOk ||
                'Tree playlist synced to your account.',
            false
        );
    }
}

export async function unpublishPrivateComposedTreeAction(treeId) {
    const store = shell();
    if (!store) return undefined;
    const id = String(treeId || '').trim();
    if (!id || !store.isSignedIn()) return;
    const name = String(store._authSession?.username || '').trim();
    if (!name || !isNostrNetworkAvailable()) return;
    const wasSynced = !!store.userStore?.isTreePrivateSyncedFromAccount?.(id);
    store.userStore.unmarkTreePrivateSyncedFromAccount?.(id);
    let partCount = 0;
    try {
        const list = await store.nostr.listPrivateTreeBlobsOnce(name);
        const row = (list || []).find((r) => String(r.treeId) === id);
        if (row) partCount = row.partCiphertexts?.length || 0;
    } catch {
        /* ignore */
    }
    try {
        const ok = await store.nostr.clearPrivateTreeBlob({
            username: name,
            treeId: id,
            partCount,
            pair: await store.ensureNetworkUserPair?.(),
        });
        if (!ok) throw new Error('clearPrivateTreeBlob returned false');
    } catch (e) {
        if (wasSynced) {
            try {
                store.userStore.markTreeAsPrivateSyncedFromAccount?.(id);
            } catch {
                /* ignore */
            }
        }
        throw e;
    }
    store.sourceManager.refreshPrivateAccountSources?.();
    notifyCommunityChanged(store);
    notifyIdentityChanged(store);
}

export async function unpublishPrivateBranchAction(treeId) {
    const store = shell();
    if (!store) return undefined;

    const id = String(treeId || '').trim();
    if (!id) return;
    if (!store.isSignedIn()) return;
    const name = String(store._authSession?.username || '').trim();
    if (!name || !isNostrNetworkAvailable()) return;
    const wasSynced = !!store.userStore?.isBranchPrivateSyncedFromAccount?.(id);
    /* Unmark first so in-flight quiet publishes cannot re-mark after upload. */
    store.userStore.unmarkBranchPrivateSyncedFromAccount?.(id);
    if (store._privateAccountSyncPending) store._privateAccountSyncPending.delete(id);
    if (!store._privateAccountSyncPending?.size) {
        clearTimeout(store._privateAccountSyncTimer);
        store._privateAccountSyncTimer = null;
    }
    let partCount = 0;
    try {
        const list = await store.nostr.listPrivateTreeBlobsOnce(name);
        const row = (list || []).find((r) => String(r.treeId) === id);
        if (row) partCount = row.partCiphertexts?.length || 0;
    } catch {
        /* best-effort — still attempt header tombstone */
    }
    try {
        const ok = await store.nostr.clearPrivateTreeBlob({
            username: name,
            treeId: id,
            partCount,
            pair: await store.ensureNetworkUserPair?.(),
        });
        if (!ok) throw new Error('clearPrivateTreeBlob returned false');
    } catch (e) {
        if (wasSynced) {
            try {
                store.userStore.markBranchAsPrivateSyncedFromAccount?.(id);
            } catch {
                /* ignore */
            }
        }
        throw e;
    }
    store.sourceManager.refreshPrivateAccountSources?.();
    notifyCommunityChanged(store);
    notifyIdentityChanged(store);
}

export function _scheduleLoadOwnedTreesAfterSignInAction(username) {
    const store = shell();
    if (!store) return undefined;

            const name = String(username || '').trim();
            if (!name) return;
            queueMicrotask(async () => {
                try {
                    await store.loadOwnedTreesFromDirectory(name);
                } catch { /* best-effort */ }
            });

}

export async function loadOwnedTreesFromDirectoryAction(username) {
    const store = shell();
    if (!store) return undefined;

            const name = String(username || '').trim();
            if (!name || !isNostrNetworkAvailable()) return 0;
            const rows = await store._listOwnedDirectoryRowsForUser(name);
            const matches = store._filterOwnedDirectoryRows(rows, name);
            let added = 0;
            for (const meta of matches) {
                const ownerPub = String(meta.ownerPub || '');
                const universeId = String(meta.universeId || '');
                if (!ownerPub || !universeId) continue;
                const url = formatNostrTreeUrl(ownerPub, universeId);
                const res = store.sourceManager.addCommunitySource(null, {
                    resolvedNostrTreeUrl: url,
                    listMeta: {
                        title: resolveDirectoryRowTitle(meta, store.state?.lang),
                        titles: meta.titles,
                        authorName: meta.authorName,
                        description:
                            pickTitleForLang(meta.descriptions, store.state?.lang, '') ||
                            meta.description,
                        descriptions: meta.descriptions,
                        languages: Array.isArray(meta.languages) ? meta.languages : undefined,
                        contentKind: meta.contentKind || undefined,
                    },
                    contentKind: meta.contentKind || undefined,
                    skipAccountPublish: true,
                    recommendedRelays: Array.isArray(meta.recommendedRelays) ? meta.recommendedRelays : []
                });
                if (res && res.ok) added += 1;
            }
            if (added) {
                notifyCommunityChanged(store);
                store.publishInstalledSourcesForAccount();
            }
            return added;

}

/** Store.prototype, explicit actions (no bindStoreContext). */
