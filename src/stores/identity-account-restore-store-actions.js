import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable } from '../features/nostr/api/nostr-network-env.js';
import { parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { resolveAccountCareTreeRef } from '../features/garden-progress/api/account-care-progress.js';
import {
    ensureConnectedNostr,
    getConnectedNostr,
    warmNostrRelayConnections,
} from '../shared/lib/connected-services/index.js';
import { notifyCommunityChanged, notifyIdentityChanged } from './store-notify.js';
import {
    resolveAccountActiveSourceUrl,
    ensurePreferredNetworkSourceInList,
} from './identity-account-active-source.js';
import {
    canonicalInstalledSourceUrl,
    omitInstalledSourceTombstones,
    unionInstalledSourcesLists,
} from './identity-installed-sources-merge.js';

function shell() {
    return getArboritoStore();
}

/** Map a live communitySources row into the encrypted pack shape. */
function packInstalledSourceRow(s) {
    const url = String(s?.url || '').trim();
    let contentKind = String(s?.contentKind || '').trim() || undefined;
    if (!contentKind) {
        const ref = parseNostrTreeUrl(url);
        const uid = String(ref?.universeId || '');
        if (uid.startsWith('tre-')) contentKind = 'composed-tree';
        else if (uid.startsWith('brn-')) contentKind = 'branch';
    }
    return {
        id: s.id,
        name: s.name || '',
        url: s.url,
        authorName: s.authorName || s.listAuthorName || '',
        description: s.listDescription || s.description || '',
        titles: s.titles,
        descriptions: s.descriptions,
        languages: Array.isArray(s.languages) ? s.languages : undefined,
        icon: s.icon || undefined,
        shareCode: s.shareCode || undefined,
        contentKind,
        recommendedRelays: Array.isArray(s.recommendedRelays) ? s.recommendedRelays : [],
    };
}

/**
 * Remember last good remote pack so a flaky relay cannot publish a wipe.
 * @param {object} store
 * @param {object|null} body
 */
function rememberInstalledSourcesRemote(store, body) {
    if (!body || typeof body !== 'object') return;
    store._installedSourcesLastRemote = {
        sources: Array.isArray(body.sources) ? body.sources : [],
        activeSourceUrl: String(body.activeSourceUrl || '').trim(),
        updatedAt: body.updatedAt || null,
        at: Date.now(),
    };
    store._installedSourcesPullOk = true;
    store._installedSourcesEverHadRemote = true;
}

function installedSourceTombstones(store) {
    if (!store._installedSourcesRemoved) store._installedSourcesRemoved = new Set();
    return store._installedSourcesRemoved;
}

/** Min gap between resume / online installed-library refreshes. */
const INSTALLED_SOURCES_RESUME_MIN_MS = 30_000;
/** Quiet background refresh while signed in (branches + trees in the account pack). */
const INSTALLED_SOURCES_BG_INTERVAL_MS = 120_000;

function canRefreshInstalledSourcesAccount(store) {
    if (!store?.isSignedIn?.()) return false;
    if (!isNostrNetworkAvailable()) return false;
    try {
        if (typeof store.hasGdprNetworkConsent === 'function' && !store.hasGdprNetworkConsent()) {
            return false;
        }
    } catch {
        /* ignore */
    }
    const name = String(store._authSession?.username || '').trim();
    return !!name;
}

/**
 * Pull account-saved network courses (branches + trees), then progress, then
 * merge-publish when this device has joins/uninstalls the account pack lacks.
 * @param {{ forcePublish?: boolean }} [opts]
 * @returns {Promise<number>} newly added community sources
 */
export async function refreshInstalledSourcesFromAccountAction(opts = {}) {
    const store = shell();
    if (!store || !canRefreshInstalledSourcesAccount(store)) return 0;
    if (opts.forcePublish) store._installedSourcesRefreshForcePublish = true;
    if (store._installedSourcesRefreshInFlight) {
        store._installedSourcesRefreshAgain = true;
        return 0;
    }
    const name = String(store._authSession?.username || '').trim();
    store._installedSourcesRefreshInFlight = true;
    let added = 0;
    try {
        do {
            store._installedSourcesRefreshAgain = false;
            const forcePublish = !!store._installedSourcesRefreshForcePublish;
            store._installedSourcesRefreshForcePublish = false;
            try {
                added += Number(await store.loadInstalledSourcesFromAccount?.(name)) || 0;
            } catch (e) {
                console.warn('[arborito] installed sources refresh pull failed', e);
            }
            try {
                await store.loadPrivateTreesFromAccount?.(name, { retry: false });
            } catch (e) {
                console.warn('[arborito] private trees refresh during library sync failed', e);
            }
            try {
                await store._loadProgressForInstalledSources?.();
            } catch (e) {
                console.warn('[arborito] installed progress refresh failed', e);
            }
            const shouldPublish =
                forcePublish ||
                !!(store._installedSourcesRemoved && store._installedSourcesRemoved.size) ||
                localInstalledSourcesNeedPush(store);
            if (shouldPublish) {
                try {
                    store.publishInstalledSourcesForAccount?.({ immediate: true });
                } catch {
                    /* ignore */
                }
            }
            store._installedSourcesRefreshedAt = Date.now();
        } while (store._installedSourcesRefreshAgain);
    } finally {
        store._installedSourcesRefreshInFlight = false;
    }
    return added;
}

/** True when local Saved has a network course not yet in the last account pack snapshot. */
function localInstalledSourcesNeedPush(store) {
    const remote = store._installedSourcesLastRemote?.sources;
    const remoteUrls = new Set(
        (Array.isArray(remote) ? remote : [])
            .map((s) => canonicalInstalledSourceUrl(s?.url))
            .filter(Boolean)
    );
    /* Never successfully read a pack: first seed still needs a publish when local has rows. */
    if (!store._installedSourcesEverHadRemote && !remoteUrls.size) {
        return (store.state.communitySources || []).some((s) => canonicalInstalledSourceUrl(s?.url));
    }
    for (const s of store.state.communitySources || []) {
        const u = canonicalInstalledSourceUrl(s?.url);
        if (u && !remoteUrls.has(u)) return true;
    }
    return false;
}

/** Foreground / online: refresh Saved library so other devices' joins appear without reopening Bosque. */
export function maybeRefreshInstalledSourcesOnResumeAction() {
    const store = shell();
    if (!canRefreshInstalledSourcesAccount(store)) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (
        store._installedSourcesRefreshedAt &&
        now - store._installedSourcesRefreshedAt < INSTALLED_SOURCES_RESUME_MIN_MS
    ) {
        /* Still ensure the quiet timer is alive after consent/network came back. */
        try {
            store.ensureInstalledSourcesBackgroundSync?.();
        } catch {
            /* ignore */
        }
        return;
    }
    try {
        store.ensureInstalledSourcesBackgroundSync?.();
    } catch {
        /* ignore */
    }
    void refreshInstalledSourcesFromAccountAction().catch((e) => {
        console.warn('[arborito] installed sources resume refresh failed', e);
    });
}

/** Start/stop quiet interval while the session can sync the account library. */
export function ensureInstalledSourcesBackgroundSyncAction() {
    const store = shell();
    if (!store) return;
    const stop = () => {
        if (store._installedSourcesBgTimer) {
            clearInterval(store._installedSourcesBgTimer);
            store._installedSourcesBgTimer = null;
        }
    };
    if (!canRefreshInstalledSourcesAccount(store)) {
        stop();
        return;
    }
    if (store._installedSourcesBgTimer) return;
    store._installedSourcesBgTimer = setInterval(() => {
        if (!canRefreshInstalledSourcesAccount(store)) {
            stop();
            return;
        }
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        void refreshInstalledSourcesFromAccountAction().catch((e) => {
            console.warn('[arborito] installed sources background refresh failed', e);
        });
    }, INSTALLED_SOURCES_BG_INTERVAL_MS);
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
    if (!store) return 0;

            if (!isNostrNetworkAvailable()) return 0;
            const net = await getConnectedNostr(store);
            if (!net) {
                console.warn('[arborito] installed sources pull skipped: nostr not ready');
                return 0;
            }
            const pair = await store.ensureNetworkUserPair();
            if (!(pair && pair.pub)) return 0;
            let body = null;
            if (typeof net.loadUserSourcesDecrypted !== 'function') {
                console.warn('loadUserSourcesDecrypted unavailable');
                return 0;
            }
            try {
                body = await net.loadUserSourcesDecrypted(username, pair);
            } catch {
                body = null;
            }
            if (!body || typeof body !== 'object') {
                console.warn('Installed sources decrypt failed for all candidates');
                return 0;
            }
            rememberInstalledSourcesRemote(store, body);
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
            let enriched = 0;
            const tombstones = installedSourceTombstones(store);
            for (const src of list) {
                if (!src || typeof src !== 'object') continue;
                const url = String(src.url || '').trim();
                if (!url || url.startsWith('branch://') || url.startsWith('privtree://')) continue;
                const canon = canonicalInstalledSourceUrl(url);
                if (canon && tombstones.has(canon)) continue;
                try {
                    const res = store.sourceManager.addCommunitySource(null, {
                        resolvedNostrTreeUrl: url,
                        codeLabel: src.shareCode || null,
                        contentKind: src.contentKind || undefined,
                        skipAccountPublish: true,
                        listMeta: {
                            title: src.name || src.title || '',
                            titles: src.titles,
                            authorName: src.authorName || '',
                            description: src.description || src.listDescription || '',
                            descriptions: src.descriptions,
                            languages: Array.isArray(src.languages) ? src.languages : undefined,
                            icon: String(src.icon || '').trim() || undefined,
                            contentKind: src.contentKind || undefined,
                        },
                        recommendedRelays: Array.isArray(src.recommendedRelays) ? src.recommendedRelays : []
                    });
                    if (res && res.ok) {
                        added += 1;
                        continue;
                    }
                    /* Already installed: backfill share code / kind / title from the account pack. */
                    const existing = res?.existing;
                    if (existing?.id && typeof store.sourceManager.patchCommunitySourceMeta === 'function') {
                        const patched = store.sourceManager.patchCommunitySourceMeta(existing.id, {
                            name: src.name || src.title || '',
                            shareCode: src.shareCode || '',
                            contentKind: src.contentKind || '',
                            authorName: src.authorName || '',
                            description: src.description || src.listDescription || '',
                            icon: String(src.icon || '').trim(),
                        });
                        if (patched) enriched += 1;
                    }
                } catch { /* ignore one bad entry */ }
            }
            if (added || enriched) notifyCommunityChanged(store);
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
                    const net = await getConnectedNostr(store);
                    if (!net || typeof net.putUserSourcesPacked !== 'function') {
                        throw new Error('putUserSourcesPacked required for sources sync');
                    }
                    const pair = await store.ensureNetworkUserPair();
                    if (!(pair && pair.pub)) return;
                    const g = store.userStore?.state?.gamification || {};
                    let localSources = (store.state.communitySources || [])
                        .filter(
                            (s) =>
                                s &&
                                s.url &&
                                !String(s.url).startsWith('branch://') &&
                                !String(s.url).startsWith('privtree://') &&
                                !String(s.url).startsWith('tree://')
                        )
                        .map(packInstalledSourceRow);

                    /*
                     * Union with the account pack before replaceable publish. A device that
                     * failed to pull (or never refreshed) must not wipe share-code joins
                     * installed on another device — especially unlisted courses that never
                     * reappear via Discover.
                     */
                    let remoteSources = null;
                    let remotePullOk = false;
                    if (typeof net.loadUserSourcesDecrypted === 'function') {
                        try {
                            const remoteBody = await net.loadUserSourcesDecrypted(name, pair);
                            if (remoteBody && typeof remoteBody === 'object') {
                                rememberInstalledSourcesRemote(store, remoteBody);
                                remoteSources = Array.isArray(remoteBody.sources) ? remoteBody.sources : [];
                                remotePullOk = true;
                                const remoteActive = String(remoteBody.activeSourceUrl || '').trim();
                                if (remoteActive && !store._lastPublishedActiveSourceUrl) {
                                    store._lastPublishedActiveSourceUrl = remoteActive;
                                }
                            }
                        } catch (e) {
                            console.warn('[arborito] installed sources merge-pull failed', e);
                        }
                    }
                    if (!remotePullOk) {
                        const cached = store._installedSourcesLastRemote;
                        if (cached && Array.isArray(cached.sources)) {
                            remoteSources = cached.sources;
                            remotePullOk = true;
                        }
                    }
                    if (!remotePullOk) {
                        /*
                         * No live pack and no cache. Seed only on a device that has never
                         * seen an account pack — otherwise a flaky pull would wipe joins
                         * from other devices.
                         */
                        if (store._installedSourcesEverHadRemote) {
                            console.warn(
                                '[arborito] installed sources publish skipped: remote unread (avoid wipe)'
                            );
                            return;
                        }
                        if (!localSources.length) {
                            console.warn(
                                '[arborito] installed sources publish skipped: remote unread and local empty'
                            );
                            return;
                        }
                        localSources = omitInstalledSourceTombstones(
                            localSources,
                            store._installedSourcesRemoved
                        );
                    } else {
                        localSources = omitInstalledSourceTombstones(
                            unionInstalledSourcesLists(localSources, remoteSources || []),
                            store._installedSourcesRemoved
                        );
                        /* Apply remote-only rows into the local garden so Bosque lists them now. */
                        let applied = 0;
                        for (const src of localSources) {
                            const url = canonicalInstalledSourceUrl(src.url) || String(src.url || '').trim();
                            if (!url || !url.startsWith('nostr://')) continue;
                            try {
                                const res = store.sourceManager.addCommunitySource(null, {
                                    resolvedNostrTreeUrl: url,
                                    codeLabel: src.shareCode || null,
                                    contentKind: src.contentKind || undefined,
                                    skipAccountPublish: true,
                                    listMeta: {
                                        title: src.name || '',
                                        titles: src.titles,
                                        authorName: src.authorName || '',
                                        description: src.description || '',
                                        descriptions: src.descriptions,
                                        languages: Array.isArray(src.languages) ? src.languages : undefined,
                                        icon: String(src.icon || '').trim() || undefined,
                                        contentKind: src.contentKind || undefined,
                                    },
                                    recommendedRelays: Array.isArray(src.recommendedRelays)
                                        ? src.recommendedRelays
                                        : [],
                                });
                                if (res?.ok) applied += 1;
                                if (res?.existing?.id) {
                                    store.sourceManager.patchCommunitySourceMeta?.(res.existing.id, {
                                        name: src.name || '',
                                        shareCode: src.shareCode || '',
                                        contentKind: src.contentKind || '',
                                        authorName: src.authorName || '',
                                        description: src.description || '',
                                        icon: String(src.icon || '').trim(),
                                    });
                                }
                            } catch {
                                /* ignore one bad entry */
                            }
                        }
                        if (applied) notifyCommunityChanged(store);
                    }

                    const sources = localSources;
                    let activeUrl = resolveAccountActiveSourceUrl(store);
                    if (!activeUrl) {
                        /* Non-synced local draft: keep the last published preferred URL (do not wipe). */
                        activeUrl = String(
                            store._lastPublishedActiveSourceUrl || store._restoredActiveSourceUrl || ''
                        ).trim();
                    }
                    if (activeUrl) {
                        store._lastPublishedActiveSourceUrl = activeUrl;
                        ensurePreferredNetworkSourceInList(sources, activeUrl, store);
                    }
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
                    await net.putUserSourcesPacked({ username: name, pair, data: body });
                    rememberInstalledSourcesRemote(store, body);
                    /* Uninstall tombstones can clear once the account pack omits those URLs. */
                    if (store._installedSourcesRemoved?.size) {
                        const published = new Set(
                            sources.map((s) => canonicalInstalledSourceUrl(s.url)).filter(Boolean)
                        );
                        for (const canon of [...store._installedSourcesRemoved]) {
                            if (!published.has(canon)) store._installedSourcesRemoved.delete(canon);
                        }
                    }
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

import {
    _scheduleLoadPrivateTreesAfterSignInAction,
    loadPrivateTreesFromAccountAction,
    publishBranchAsPrivateAction,
    publishActiveBranchAsPrivateAction,
    publishComposedTreeAsPrivateAction,
    syncAllLocalPrivateBranchesToAccountAction,
    maybeSyncPrivateAccountBranchesAction,
    cancelPendingAccountSyncTimersAction,
    unpublishPrivateComposedTreeAction,
    unpublishPrivateBranchAction,
    _scheduleLoadOwnedTreesAfterSignInAction,
    loadOwnedTreesFromDirectoryAction,
} from './identity-account-private-trees-store-actions.js';

export {
    _scheduleLoadPrivateTreesAfterSignInAction,
    loadPrivateTreesFromAccountAction,
    publishBranchAsPrivateAction,
    publishActiveBranchAsPrivateAction,
    publishComposedTreeAsPrivateAction,
    syncAllLocalPrivateBranchesToAccountAction,
    maybeSyncPrivateAccountBranchesAction,
    cancelPendingAccountSyncTimersAction,
    unpublishPrivateComposedTreeAction,
    unpublishPrivateBranchAction,
    _scheduleLoadOwnedTreesAfterSignInAction,
    loadOwnedTreesFromDirectoryAction,
};

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
    refreshInstalledSourcesFromAccount: refreshInstalledSourcesFromAccountAction,
    maybeRefreshInstalledSourcesOnResume: maybeRefreshInstalledSourcesOnResumeAction,
    ensureInstalledSourcesBackgroundSync: ensureInstalledSourcesBackgroundSyncAction,
    _scheduleLoadPrivateTreesAfterSignIn: _scheduleLoadPrivateTreesAfterSignInAction,
    loadPrivateTreesFromAccount: loadPrivateTreesFromAccountAction,
    publishBranchAsPrivate: publishBranchAsPrivateAction,
    publishActiveBranchAsPrivate: publishActiveBranchAsPrivateAction,
    publishComposedTreeAsPrivate: publishComposedTreeAsPrivateAction,
    syncAllLocalPrivateBranchesToAccount: syncAllLocalPrivateBranchesToAccountAction,
    maybeSyncPrivateAccountBranches: maybeSyncPrivateAccountBranchesAction,
    cancelPendingAccountSyncTimers: cancelPendingAccountSyncTimersAction,
    unpublishPrivateBranch: unpublishPrivateBranchAction,
    unpublishPrivateComposedTree: unpublishPrivateComposedTreeAction,
    _scheduleLoadOwnedTreesAfterSignIn: _scheduleLoadOwnedTreesAfterSignInAction,
    loadOwnedTreesFromDirectory: loadOwnedTreesFromDirectoryAction,
};
