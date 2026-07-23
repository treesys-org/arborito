import { getArboritoStore } from '../core/store-singleton.js';
import { DEMO_BRANCH_ID } from '../core/demo/arborito-demo-ids.js';
import { isNostrNetworkAvailable } from '../features/nostr/api/nostr-network-env.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { resolveAccountCareTreeRef } from '../features/garden-progress/api/account-care-progress.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import { pickTitleForLang, resolveDirectoryRowTitle } from '../shared/lib/catalog-titles.js';
import { notifyCommunityChanged, notifyIdentityChanged } from './store-notify.js';

function shell() {
    return getArboritoStore();
}

/** After-sign-in restore flows: owned trees, installed sources, private trees, owned progress. */

export function _scheduleLoadOwnedProgressAfterSignInAction(username) {
    const store = shell();
    if (!store) return undefined;

            const name = String(username || '').trim();
            if (!name) return;
            queueMicrotask(async () => {
                try {
                    await store._loadProgressForOwnedTrees(name);
                    await store._loadAccountCareProgress?.();
                } catch (e) {
                    console.warn('Owned-progress pull failed', e);
                }
            });

}

export async function _listOwnedDirectoryRowsForUserAction(username) {
    const store = shell();
    if (!store) return undefined;

            const name = String(username || '').trim();
            if (!name || !isNostrNetworkAvailable()) return [];
            await ensureConnectedNostr(store);
            if (!store.nostr) return [];
            if (typeof store.nostr?.listGlobalTreeDirectoryEntriesOnce !== 'function') return [];
            const cacheKey = name.toLowerCase();
            const now = Date.now();
            if (
                store._ownedDirectoryRowsCache &&
                store._ownedDirectoryRowsCache.key === cacheKey &&
                now - store._ownedDirectoryRowsCache.at < 60000
            ) {
                return store._ownedDirectoryRowsCache.rows;
            }
            const rows = await store.nostr.listGlobalTreeDirectoryEntriesOnce({ limit: 200, query: name });
            const list = Array.isArray(rows) ? rows : [];
            store._ownedDirectoryRowsCache = { key: cacheKey, at: now, rows: list };
            return list;

}

export function _filterOwnedDirectoryRowsAction(rows, username) {
    const store = shell();
    if (!store) return undefined;

            const wanted = String(username || '').trim().toLowerCase();
            return (Array.isArray(rows) ? rows : []).filter(
                (r) => String(r?.authorName || '').trim().toLowerCase() === wanted
            );

}

export async function _loadProgressForOwnedTreesAction(username) {
    const store = shell();
    if (!store) return undefined;

            if (!isNostrNetworkAvailable()) return;
            const pair = await store.ensureNetworkUserPair();
            if (!(pair && pair.pub)) return;
            const rows = await store._listOwnedDirectoryRowsForUser(username);
            const matches = store._filterOwnedDirectoryRows(rows, username);
            const seen = new Set();
            for (const meta of matches) {
                const pub = String(meta.ownerPub || '');
                const universeId = String(meta.universeId || '');
                if (!pub || !universeId) continue;
                const key = `${pub}:${universeId}`;
                if (seen.has(key)) continue;
                seen.add(key);
                try {
                    await store.loadNetworkProgressIntoUserStore({ pub, universeId });
                } catch { /* per-tree best-effort */ }
            }

}

/** Pull progress for every installed public tree (not only trees you author). */
export async function _loadProgressForInstalledSourcesAction() {
    const store = shell();
    if (!store) return undefined;
    if (!isNostrNetworkAvailable()) return;
    const pair = await store.ensureNetworkUserPair?.();
    if (!(pair && pair.pub)) return;
    const sources = Array.isArray(store.state.communitySources) ? store.state.communitySources : [];
    const seen = new Set();
    for (const src of sources) {
        const url = String(src?.url || '').trim();
        const treeRef = parseNostrTreeUrl(url);
        if (!treeRef?.pub || !treeRef?.universeId) continue;
        const key = `${treeRef.pub}:${treeRef.universeId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
            await store.loadNetworkProgressIntoUserStore(treeRef);
        } catch {
            /* per-tree best-effort */
        }
    }
}

/** Account-care channel: progress while only private/local branches are open. */
export async function _loadAccountCareProgressAction() {
    const store = shell();
    if (!store) return undefined;
    if (!isNostrNetworkAvailable()) return;
    const pair = await store.ensureNetworkUserPair?.();
    const careRef = resolveAccountCareTreeRef(pair?.pub);
    if (!careRef) return;
    try {
        await store.loadNetworkProgressIntoUserStore(careRef);
    } catch (e) {
        console.warn('Account-care progress pull failed', e);
    }
}

export function _scheduleLoadInstalledSourcesAfterSignInAction(username) {
    const store = shell();
    if (!store) return undefined;

            const name = String(username || '').trim();
            if (!name) return;
            queueMicrotask(async () => {
                try {
                    await store.loadInstalledSourcesFromAccount(name);
                } catch (e) {
                    console.warn('Installed sources pull failed', e);
                }
            });

}

export async function loadInstalledSourcesFromAccountAction(username) {
    const store = shell();
    if (!store) return undefined;

            if (!isNostrNetworkAvailable()) return 0;
            const pair = await store.ensureNetworkUserPair();
            if (!(pair && pair.pub)) return 0;
            let body = null;
            if (typeof store.nostr.loadUserSourcesDecrypted !== 'function') {
                console.warn('loadUserSourcesDecrypted unavailable');
                return 0;
            }
            try {
                body = await store.nostr.loadUserSourcesDecrypted(username, pair);
            } catch {
                body = null;
            }
            if (!body || typeof body !== 'object') {
                console.warn('Installed sources decrypt failed for all candidates');
                return 0;
            }
            if (body?.profile && typeof body.profile === 'object') {
                const g = store.userStore?.state?.gamification;
                const p = body.profile;
                if (g) {
                    const remoteAt =
                        Date.parse(String(p.profileUpdatedAt || '')) || 0;
                    const localAt = Date.parse(String(g.profileUpdatedAt || '')) || 0;
                    const remoteWins = remoteAt > 0 && remoteAt >= localAt;
                    if (p.username && (!g.username || remoteWins)) {
                        g.username = String(p.username);
                    }
                    const av = String(p.avatar || '').trim();
                    const localAv = String(g.avatar || '').trim();
                    const localIsDefault = !localAv || localAv === '👤' || localAv === '🌱';
                    if (av && (localIsDefault || remoteWins)) {
                        g.avatar = av;
                        if (p.profileUpdatedAt) g.profileUpdatedAt = p.profileUpdatedAt;
                    }
                    store.userStore.persist();
                    notifyIdentityChanged(store);
                }
            }
            const activeUrl = String(body?.activeSourceUrl || '').trim();
            if (activeUrl) store._restoredActiveSourceUrl = activeUrl;
            else store._restoredActiveSourceUrl = '';
            if (activeUrl) store._lastPublishedActiveSourceUrl = activeUrl;
            const list = Array.isArray(body?.sources) ? body.sources : [];
            let added = 0;
            for (const src of list) {
                if (!src || typeof src !== 'object') continue;
                const url = String(src.url || '').trim();
                if (!url || url.startsWith('branch://') || url.startsWith('privtree://')) continue;
                try {
                    const res = store.sourceManager.addCommunitySource(null, {
                        resolvedNostrTreeUrl: url,
                        listMeta: {
                            title: src.name || src.title || '',
                            titles: src.titles,
                            authorName: src.authorName || '',
                            description: src.description || src.listDescription || '',
                            descriptions: src.descriptions,
                            languages: Array.isArray(src.languages) ? src.languages : undefined,
                            icon: String(src.icon || '').trim() || undefined,
                        },
                        recommendedRelays: Array.isArray(src.recommendedRelays) ? src.recommendedRelays : []
                    });
                    if (res && res.ok) added += 1;
                } catch { /* ignore one bad entry */ }
            }
            if (added) notifyCommunityChanged(store);
            return added;

}

export function publishInstalledSourcesForAccountAction(opts = {}) {
    const store = shell();
    if (!store) return undefined;

            if (!store.isSignedIn() || !isNostrNetworkAvailable()) return;
            const name = String(store._authSession?.username || '').trim();
            if (!name) return;
            const immediate = !!(opts && opts.immediate);
            if (store._installedSourcesPublishTimer) clearTimeout(store._installedSourcesPublishTimer);
            const run = async () => {
                store._installedSourcesPublishTimer = null;
                try {
                    if (!store.isSignedIn?.()) return;
                    try {
                        if (
                            typeof store.hasGdprNetworkConsent === 'function' &&
                            !store.hasGdprNetworkConsent()
                        ) {
                            return;
                        }
                    } catch {
                        /* ignore */
                    }
                    const liveName = String(store._authSession?.username || '').trim();
                    if (!liveName || liveName !== name) return;
                    const pair = await store.ensureNetworkUserPair();
                    if (!(pair && pair.pub)) return;
                    const g = store.userStore?.state?.gamification || {};
                    const sources = (store.state.communitySources || [])
                        .filter((s) => s && s.url && !String(s.url).startsWith('branch://') && !String(s.url).startsWith('privtree://'))
                        .map((s) => ({
                            id: s.id,
                            name: s.name || '',
                            url: s.url,
                            authorName: s.authorName || s.listAuthorName || '',
                            description: s.listDescription || s.description || '',
                            titles: s.titles,
                            descriptions: s.descriptions,
                            languages: Array.isArray(s.languages) ? s.languages : undefined,
                            icon: s.icon || undefined,
                            recommendedRelays: Array.isArray(s.recommendedRelays) ? s.recommendedRelays : []
                        }));
                    let activeUrl = String(store.state.activeSource?.url || '').trim();
                    if (activeUrl.startsWith('branch://')) {
                        const localId = activeUrl.slice('branch://'.length);
                        if (localId === DEMO_BRANCH_ID) {
                            /* Persist demo as last-opened so restore does not jump to another branch. */
                            activeUrl = `branch://${DEMO_BRANCH_ID}`;
                        } else {
                            const entry = (store.userStore.state.branches || []).find((t) => t.id === localId);
                            activeUrl = entry?.privateSyncedFromAccount ? `privtree://${localId}` : '';
                        }
                    }
                    if (!activeUrl) {
                        /* Non-synced local draft: keep the last published preferred URL (do not wipe). */
                        activeUrl = String(
                            store._lastPublishedActiveSourceUrl || store._restoredActiveSourceUrl || ''
                        ).trim();
                    }
                    if (activeUrl) store._lastPublishedActiveSourceUrl = activeUrl;
                    const body = {
                        v: 1,
                        sources,
                        profile: {
                            username: String(g.username || name || '').trim(),
                            avatar: String(g.avatar || '👤').trim(),
                            profileUpdatedAt: g.profileUpdatedAt || null,
                        },
                        activeSourceUrl: activeUrl,
                        updatedAt: new Date().toISOString()
                    };
                    if (typeof store.nostr.putUserSourcesPacked !== 'function') {
                        throw new Error('putUserSourcesPacked required for sources sync');
                    }
                    await store.nostr.putUserSourcesPacked({ username: name, pair, data: body });
                } catch (e) {
                    console.warn('Installed sources publish failed', e);
                }
            };
            if (immediate) {
                void run();
                return;
            }
            store._installedSourcesPublishTimer = setTimeout(run, 800);

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

export async function loadPrivateTreesFromAccountAction(username) {
    const store = shell();
    if (!store) return undefined;

            if (!isNostrNetworkAvailable()) return 0;
            const list = await store.nostr.listPrivateTreeBlobsOnce(username);
            if (!Array.isArray(list) || !list.length) return 0;
            const pair = await store.ensureNetworkUserPair();
            if (!(pair && pair.pub)) return 0;
            let added = 0;
            const restoredIds = new Set();
            for (const row of list) {
                try {
                    const treeId = String(row.treeId || '').trim();
                    if (!treeId || restoredIds.has(treeId)) continue;
                    const body = await store.nostr.unpackPrivateTreeFromSync({
                        pair,
                        manifestCiphertext: row.manifestCiphertext,
                        partCiphertexts: row.partCiphertexts
                    });
                    if (!body || typeof body !== 'object') continue;
                    const id = String(body.id || treeId).trim();
                    if (!id || restoredIds.has(id)) continue;
                    const data = body.data && typeof body.data === 'object' ? body.data : null;
                    if (!data) continue;
                    const ok = store.userStore.upsertPrivateBranchFromAccount({
                        id,
                        name: String(body.name || data.universeName || id),
                        data,
                        updatedAt: row.updatedAt
                    });
                    if (ok) {
                        restoredIds.add(id);
                        added += 1;
                    }
                } catch { /* one tree failure is non-fatal */ }
            }
            if (added) {
                store.sourceManager.refreshPrivateAccountSources?.();
                notifyCommunityChanged(store);
                notifyIdentityChanged(store);
            }
            return added;

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
    const body = {
        v: 1,
        id: localId,
        name: entry.name || entry.data?.universeName || localId,
        data: entry.data,
        updatedAt: new Date().toISOString(),
    };
    await store.nostr.putPrivateTreeBlob({ username: name, treeId: localId, pair, body });
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
    store.notify(ui.privateTreesPublishedOk || 'Private tree synced to your account.', false);
}

export async function publishActiveBranchAsPrivateAction() {
    return publishBranchAsPrivateAction();
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
    try {
        store.userStore?.takePrivateAccountSyncDirtyIds?.();
    } catch {
        /* ignore */
    }
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
                    },
                    recommendedRelays: Array.isArray(meta.recommendedRelays) ? meta.recommendedRelays : []
                });
                if (res && res.ok) added += 1;
            }
            if (added) store.publishInstalledSourcesForAccount();
            return added;

}

/** Store.prototype, explicit actions (no bindStoreContext). */
export const storeAccountRestoreMethods = {
    _scheduleLoadOwnedProgressAfterSignIn: _scheduleLoadOwnedProgressAfterSignInAction,
    _listOwnedDirectoryRowsForUser: _listOwnedDirectoryRowsForUserAction,
    _filterOwnedDirectoryRows: _filterOwnedDirectoryRowsAction,
    _loadProgressForOwnedTrees: _loadProgressForOwnedTreesAction,
    _loadProgressForInstalledSources: _loadProgressForInstalledSourcesAction,
    _loadAccountCareProgress: _loadAccountCareProgressAction,
    _scheduleLoadInstalledSourcesAfterSignIn: _scheduleLoadInstalledSourcesAfterSignInAction,
    loadInstalledSourcesFromAccount: loadInstalledSourcesFromAccountAction,
    publishInstalledSourcesForAccount: publishInstalledSourcesForAccountAction,
    _scheduleLoadPrivateTreesAfterSignIn: _scheduleLoadPrivateTreesAfterSignInAction,
    loadPrivateTreesFromAccount: loadPrivateTreesFromAccountAction,
    publishBranchAsPrivate: publishBranchAsPrivateAction,
    publishActiveBranchAsPrivate: publishActiveBranchAsPrivateAction,
    maybeSyncPrivateAccountBranches: maybeSyncPrivateAccountBranchesAction,
    cancelPendingAccountSyncTimers: cancelPendingAccountSyncTimersAction,
    unpublishPrivateBranch: unpublishPrivateBranchAction,
    _scheduleLoadOwnedTreesAfterSignIn: _scheduleLoadOwnedTreesAfterSignInAction,
    loadOwnedTreesFromDirectory: loadOwnedTreesFromDirectoryAction,
};
