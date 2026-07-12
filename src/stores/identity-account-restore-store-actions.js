import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable } from '../features/nostr/api/nostr-network-env.js';
import { formatNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
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
            const ct = await store.nostr.loadUserSourcesEncryptedOnce(username);
            if (!ct) return 0;
            const pair = await store.ensureNetworkUserPair();
            if (!(pair && pair.pub)) return 0;
            let body;
            try {
                body = await store.nostr.decryptForSelf({ pair, encrypted: ct });
            } catch (e) {
                console.warn('Installed sources decrypt failed', e);
                return 0;
            }
            if (body?.profile && typeof body.profile === 'object') {
                const g = store.userStore?.state?.gamification;
                const p = body.profile;
                if (g) {
                    if (p.username && !g.username) g.username = String(p.username);
                    const av = String(p.avatar || '').trim();
                    if (av && (!g.avatar || g.avatar === '👤' || g.avatar === '🌱')) g.avatar = av;
                    store.userStore.persist();
                }
            }
            const activeUrl = String(body?.activeSourceUrl || '').trim();
            if (activeUrl) store._restoredActiveSourceUrl = activeUrl;
            const list = Array.isArray(body?.sources) ? body.sources : [];
            let added = 0;
            for (const src of list) {
                if (!src || typeof src !== 'object') continue;
                const url = String(src.url || '').trim();
                if (!url || url.startsWith('branch://') || url.startsWith('privtree://')) continue;
                try {
                    const res = store.sourceManager.addCommunitySource(null, {
                        resolvedNostrTreeUrl: url,
                        listMeta: { title: src.name || src.title || '', authorName: src.authorName || '' },
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
                    const pair = await store.ensureNetworkUserPair();
                    if (!(pair && pair.pub)) return;
                    const g = store.userStore?.state?.gamification || {};
                    const sources = (store.state.communitySources || [])
                        .filter((s) => s && s.url && !String(s.url).startsWith('branch://') && !String(s.url).startsWith('privtree://'))
                        .map((s) => ({
                            id: s.id,
                            name: s.name || '',
                            url: s.url,
                            authorName: s.authorName || '',
                            recommendedRelays: Array.isArray(s.recommendedRelays) ? s.recommendedRelays : []
                        }));
                    let activeUrl = String(store.state.activeSource?.url || '').trim();
                    if (activeUrl.startsWith('branch://')) {
                        const localId = activeUrl.slice('branch://'.length);
                        const entry = (store.userStore.state.branches || []).find((t) => t.id === localId);
                        activeUrl = entry?.privateSyncedFromAccount ? `privtree://${localId}` : '';
                    }
                    const body = {
                        v: 1,
                        sources,
                        profile: {
                            username: String(g.username || name || '').trim(),
                            avatar: String(g.avatar || '👤').trim()
                        },
                        activeSourceUrl: activeUrl,
                        updatedAt: new Date().toISOString()
                    };
                    const encryptedContent = await store.nostr.encryptForSelf({ pair, data: body });
                    store.nostr.putUserSourcesEncrypted({ username: name, encryptedContent });
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
            for (const row of list) {
                try {
                    const body = await store.nostr.unpackPrivateTreeFromSync({
                        pair,
                        manifestCiphertext: row.manifestCiphertext,
                        partCiphertexts: row.partCiphertexts
                    });
                    if (!body || typeof body !== 'object') continue;
                    const treeId = String(row.treeId || body.id || '').trim();
                    if (!treeId) continue;
                    const data = body.data && typeof body.data === 'object' ? body.data : null;
                    if (!data) continue;
                    const ok = store.userStore.upsertPrivateBranchFromAccount({
                        id: treeId,
                        name: String(body.name || data.universeName || treeId),
                        data,
                        updatedAt: row.updatedAt
                    });
                    if (ok) added += 1;
                } catch { /* one tree failure is non-fatal */ }
            }
            if (added) {
                store.sourceManager.refreshPrivateAccountSources?.();
                notifyCommunityChanged(store);
                notifyIdentityChanged(store);
            }
            return added;

}

export async function publishActiveBranchAsPrivateAction() {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
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
            const srcUrl = String(store.state.activeSource?.url || '');
            if (!srcUrl.startsWith('branch://')) {
                throw new Error(ui.privateTreesOnlyLocalSource || 'Open a local tree first.');
            }
            const localId = srcUrl.slice('branch://'.length);
            const entry = (store.userStore.state.branches || []).find((t) => t.id === localId);
            if (!entry) {
                throw new Error(ui.privateTreesLocalMissing || 'That local tree is missing.');
            }
            const pair = await store.ensureNetworkUserPair();
            if (!(pair && pair.pub)) {
                throw new Error(ui.nostrNotLoadedHint || 'Could not derive your user key.');
            }
            const body = {
                v: 1,
                id: localId,
                name: entry.name || entry.data?.universeName || localId,
                data: entry.data,
                updatedAt: new Date().toISOString()
            };
            await store.nostr.putPrivateTreeBlob({ username: name, treeId: localId, pair, body });
            store.userStore.markBranchAsPrivateSyncedFromAccount?.(localId);
            store.sourceManager.refreshPrivateAccountSources?.();
            notifyCommunityChanged(store);
            notifyIdentityChanged(store);
            try {
                store.publishInstalledSourcesForAccount?.({ immediate: true });
            } catch { /* ignore */ }
            store.notify(ui.privateTreesPublishedOk || 'Private tree synced to your account.', false);

}

export async function unpublishPrivateBranchAction(treeId) {
    const store = shell();
    if (!store) return undefined;

            const id = String(treeId || '').trim();
            if (!id) return;
            if (!store.isSignedIn()) return;
            const name = String(store._authSession?.username || '').trim();
            if (!name || !isNostrNetworkAvailable()) return;
            let partCount = 0;
            try {
                const list = await store.nostr.listPrivateTreeBlobsOnce(name);
                const row = (list || []).find((r) => String(r.treeId) === id);
                if (row) partCount = row.partCiphertexts?.length || 0;
            } catch {
                /* best-effort */
            }
            await store.nostr.clearPrivateTreeBlob({ username: name, treeId: id, partCount });
            store.userStore.unmarkBranchPrivateSyncedFromAccount?.(id);
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
                    listMeta: { title: meta.title, authorName: meta.authorName, description: meta.description },
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
    _scheduleLoadInstalledSourcesAfterSignIn: _scheduleLoadInstalledSourcesAfterSignInAction,
    loadInstalledSourcesFromAccount: loadInstalledSourcesFromAccountAction,
    publishInstalledSourcesForAccount: publishInstalledSourcesForAccountAction,
    _scheduleLoadPrivateTreesAfterSignIn: _scheduleLoadPrivateTreesAfterSignInAction,
    loadPrivateTreesFromAccount: loadPrivateTreesFromAccountAction,
    publishActiveBranchAsPrivate: publishActiveBranchAsPrivateAction,
    unpublishPrivateBranch: unpublishPrivateBranchAction,
    _scheduleLoadOwnedTreesAfterSignIn: _scheduleLoadOwnedTreesAfterSignInAction,
    loadOwnedTreesFromDirectory: loadOwnedTreesFromDirectoryAction,
};
