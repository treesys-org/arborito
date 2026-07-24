import { getArboritoStore } from '../core/store-singleton.js';
import { celebrate } from '../features/garden-progress/api/celebration.js';
import { publishTreeRankingIfOptedIn, fetchTreeRanking } from '../features/tree-graph/api/tree-ranking.js';
import { syncGardenBackground } from '../features/garden-progress/api/garden-background.js';
import {
    buildNetworkSocialConsentPatch,
    getConnectedNostr,
    hasNetworkSocialConsent,
    needsNetworkSocialConsent,
} from '../shared/lib/connected-services/index.js';
import { notifyAction } from './shell-ui-store-actions.js';
import { TreeUtils } from '../features/tree-graph/api/tree-utils.js';
import { getMobilePath } from '../features/tree-graph/api/graph-ui-accessors.js';
import {
    buildAchievementSections,
    buildDiplomaEntries,
    flattenAchievements,
} from '../features/garden-progress/api/achievement-sections.js';
import { getAchievementSectionsCached } from '../features/garden-progress/api/achievement-sections-cache.js';
import { isNostrNetworkAvailable } from '../features/nostr/api/nostr-refs.js';
import {
    fingerprintProgressPayload,
    isProgressPayloadEmpty,
    mergeBookmarkMaps,
    mergeGameDataBuckets,
    mergeMemoryMaps,
    shouldPublishMergedProgress,
} from '../core/user-store/progress-sync-merge.js';
import { mergeRemoteGamification } from '../core/user-store/gamification-merge.js';
import { notifyUserProgressChanged, notifyIdentityChanged } from './store-notify.js';
import { storageManager } from '../features/backup-export/api/storage-manager.js';
import { resolveAccountCareTreeRef } from '../features/garden-progress/api/account-care-progress.js';
import {
    shouldSyncNetworkProgress,
} from '../features/publishing/api/demo-tree-guard.js';

const PROGRESS_PULL_RETRIES = 3;
const PROGRESS_PULL_RETRY_MS = 450;
const PROGRESS_RESUME_RECONCILE_MIN_MS = 20_000;

function shell() {
    return getArboritoStore();
}

function progressTreeKey(treeRef) {
    if (!treeRef?.pub || !treeRef?.universeId) return '';
    return `${treeRef.pub}:${treeRef.universeId}`;
}

/**
 * Public tree when open; otherwise account-care channel so private/local
 * branches still push/pull lesson XP and garden state across devices.
 */
export function getProgressSyncTreeRefAction() {
    const store = shell();
    if (!store) return null;
    const publicRef = store.getActivePublicTreeRef?.();
    if (publicRef?.pub && publicRef?.universeId) return publicRef;
    const pair = store.getNetworkUserPair?.();
    return resolveAccountCareTreeRef(pair?.pub);
}

/**
 * Always include account-care so demo / local-branch progress stays in sync
 * even while a public tree is open (public channel alone would orphan it).
 * @returns {Array<{ pub: string, universeId: string }>}
 */
export function listProgressSyncTreeRefsAction() {
    const store = shell();
    if (!store) return [];
    const refs = [];
    const seen = new Set();
    const push = (ref) => {
        if (!ref?.pub || !ref?.universeId) return;
        const key = progressTreeKey(ref);
        if (!key || seen.has(key)) return;
        seen.add(key);
        refs.push(ref);
    };
    const pair = store.getNetworkUserPair?.();
    push(resolveAccountCareTreeRef(pair?.pub));
    push(store.getActivePublicTreeRef?.());
    return refs;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getManualBookmarksAction() {
    return shell()?.userStore?.settings?.getManualBookmarks?.() ?? [];
}

export function getRecentLessonsAction() {
    return shell()?.userStore?.settings?.getRecentLessons?.() ?? [];
}

export function isCompletedAction(id) {
    const store = shell();
    return store?.userStore?.isCompleted?.(id) ?? false;
}

export function getBookmarkAction(...args) {
    return shell()?.userStore?.settings?.getBookmark?.(...args);
}

export function saveBookmarkAction(...args) {
    return shell()?.userStore?.settings?.saveBookmark?.(...args);
}

export function removeBookmarkAction(id) {
    const store = shell();
    store?.userStore?.settings?.removeBookmark?.(id);
    store?.update?.({});
}

import { markCompleteAction } from './garden-user-progress-store-actions.js';

export { markCompleteAction };

export function computeHashAction(str) {
    return shell()?.userStore?.settings?.computeHash?.(str);
}

export function loadBookmarksAction() {
    return shell()?.userStore?.settings?.loadBookmarks?.();
}

export function getRecentLessonPositionAction(nodeId, contentRaw) {
    return shell()?.userStore?.settings?.getRecentLessonPosition?.(nodeId, contentRaw);
}

export function getLessonResumePositionAction(nodeId, contentRaw) {
    return shell()?.userStore?.settings?.getLessonResumePosition?.(nodeId, contentRaw);
}

export function recordRecentLessonAction(nodeId, index, visitedSet, contentRaw, quizPassed) {
    const store = shell();
    const prevTop = String(store?.userStore?.settings?.getRecentLessons?.()?.[0]?.id || '');
    const result = store?.userStore?.settings?.recordRecentLesson?.(
        nodeId,
        index,
        visitedSet,
        contentRaw,
        quizPassed
    );
    const nextTop = String(store?.userStore?.settings?.getRecentLessons?.()?.[0]?.id || '');
    /* Only when the “last opened” lesson changes — mobile map highlight depends on it. */
    if (prevTop !== nextTop) {
        try {
            notifyUserProgressChanged(store);
        } catch {
            /* ignore */
        }
    }
    return result;
}

export function loadProgressAction() {
    return shell()?.userStore?.loadProgress?.();
}

export function getModulesStatusAction() {
    const store = shell();
    if (!store) return [];
    const all = TreeUtils.getModulesStatus(store.state.data, store.userStore.state.completedNodes);
    const ctx = store.state.treeContext;
    if (!ctx || ctx.kind !== 'composed-tree' || ctx.singleBranch) return all;

    const path = getMobilePath();
    if (path.length <= 1) {
        const wrappers = all.filter((m) => String(m.id).endsWith('::wrapper'));
        return wrappers.length ? wrappers : all;
    }

    const activeNodeId = String(path[path.length - 1] || '');
    const refPrefix = activeNodeId.includes('::') ? `${activeNodeId.split('::')[0]}::` : null;
    if (refPrefix) {
        return all.filter((m) => String(m.id).startsWith(refPrefix) && !String(m.id).endsWith('::wrapper'));
    }
    return all;
}

export function getAvailableCertificatesAction() {
    const store = shell();
    if (!store) return [];
    return buildDiplomaEntries(store, getModulesStatusAction());
}

export function getAchievementSectionsAction() {
    const store = shell();
    if (!store) return { diplomas: [], trees: [], branches: [] };
    return getAchievementSectionsCached(store, () =>
        buildAchievementSections(store, getModulesStatusAction())
    );
}

export function getAllAchievementsAction() {
    return flattenAchievements(getAchievementSectionsAction());
}

export function getProgressScopeAction() {
    const store = shell();
    if (!store) return 'branch';
    const ctx = store.state.treeContext;
    if (!ctx || ctx.kind !== 'composed-tree' || ctx.singleBranch) return 'branch';
    const path = getMobilePath();
    return path.length <= 1 ? 'tree' : 'branch';
}

export function leaveCertificatesViewAction(...args) {
    return shell()?.leaveCertificatesView?.(...args);
}

/** Debounced ranking publish after XP changes. */
export function scheduleRankingPublishAction() {
    const store = shell();
    if (!store) return;
    if (store._rankingPublishTimer) clearTimeout(store._rankingPublishTimer);
    store._rankingPublishTimer = setTimeout(() => {
        store._rankingPublishTimer = null;
        void publishTreeRankingIfOptedIn(store);
    }, 2500);
}

export async function loadTreeRankingAction() {
    const store = shell();
    if (!store) return undefined;
    return fetchTreeRanking(store);
}

export function buyGardenShopItemAction(itemId) {
    const store = shell();
    if (!store) return false;
    const ui = store.ui || {};
    const result = store.userStore.purchaseGardenItem(itemId);
    if (!result.ok) {
        if (result.error === 'insufficient') {
            notifyAction(ui.gardenShopInsufficient || 'Not enough lumens. Keep studying.', true);
        } else if (result.error === 'owned') {
            notifyAction(ui.gardenShopAlreadyOwned || 'Ya la tienes.', false);
        } else if (result.error === 'max') {
            notifyAction(
                ui.gardenShopMaxShields ||
                    ui.streakShieldHint ||
                    'You already have the maximum leaf shields.',
                false
            );
        }
        return false;
    }
    if (result.kind === 'consumable' && result.item?.grant === 'streakShield') {
        celebrate('streak-shield');
        notifyAction(
            ui.gardenShopPurchasedShield ||
                ui.streakShieldEarned ||
                'Leaf shield added to your pack.',
            false
        );
    } else {
        celebrate('purchase');
        notifyAction(ui.gardenShopPurchased || 'New decoration for your garden!', false);
        syncGardenBackground(store);
    }
    notifyUserProgressChanged(store);
    return true;
}

export function equipGardenShopItemAction(itemId) {
    const store = shell();
    if (!store) return false;
    const ok = store.userStore.equipGardenDecorItem(itemId);
    if (ok) {
        notifyAction(store.ui.gardenShopEquippedToast || 'Decoration placed.', false);
        syncGardenBackground(store);
        notifyUserProgressChanged(store);
    }
    return ok;
}

export function unequipGardenShopItemAction(slot) {
    const store = shell();
    if (!store) return false;
    const ok = store.userStore.unequipGardenDecorItem(slot);
    if (ok) {
        notifyAction(store.ui.gardenShopUnequippedToast || 'Decoration removed.', false);
        syncGardenBackground(store);
        notifyUserProgressChanged(store);
    }
    return ok;
}

export function hasNetworkSocialConsentAction() {
    const store = shell();
    if (!store) return false;
    return hasNetworkSocialConsent(store);
}

export function needsNetworkSocialConsentAction() {
    const store = shell();
    if (!store) return false;
    return needsNetworkSocialConsent(store);
}

export function grantNetworkSocialConsentAction() {
    const store = shell();
    if (!store) return false;
    store.userStore.updateGamification(buildNetworkSocialConsentPatch());
    void store.ensureNetworkUserPair?.().then(() => publishTreeRankingIfOptedIn(store));
    notifyIdentityChanged(store);
    notifyUserProgressChanged(store);
    return true;
}

export function setRankingOptInAction(enabled, { anonymous = null } = {}) {
    const store = shell();
    if (!store) return;
    const g = store.userStore.state.gamification;
    const updates = { rankingOptIn: !!enabled };
    if (anonymous !== null) updates.rankingAnonymous = !!anonymous;
    if (!enabled) updates.rankingAnonymous = false;
    store.userStore.updateGamification(updates);
    if (enabled) {
        void store.ensureNetworkUserPair?.().then(() => publishTreeRankingIfOptedIn(store));
    }
    notifyUserProgressChanged(store);
}

/** Store.prototype, garden shop, ranking, social consent. */
export const gardenGamificationMethods = {
    _scheduleRankingPublish: scheduleRankingPublishAction,
    loadTreeRanking: loadTreeRankingAction,
    buyGardenShopItem: buyGardenShopItemAction,
    equipGardenShopItem: equipGardenShopItemAction,
    unequipGardenShopItem: unequipGardenShopItemAction,
    hasNetworkSocialConsent: hasNetworkSocialConsentAction,
    needsNetworkSocialConsent: needsNetworkSocialConsentAction,
    grantNetworkSocialConsent: grantNetworkSocialConsentAction,
    setRankingOptIn: setRankingOptInAction,
};

export function getProgressPayloadForSyncAction(persistencePayload) {
    const store = shell();
    if (!store) return null;
    const p = persistencePayload || store.userStore.getPersistenceData();
    let arcadeSaves = {};
    try {
        arcadeSaves = storageManager.exportForSync();
    } catch {
        arcadeSaves = {};
    }
    return {
        v: 1,
        updatedAt: new Date().toISOString(),
        progress: Array.isArray(p.progress) ? p.progress : [],
        memory: p.memory && typeof p.memory === 'object' ? p.memory : {},
        bookmarks: p.bookmarks && typeof p.bookmarks === 'object' ? p.bookmarks : {},
        gamification: p.gamification && typeof p.gamification === 'object' ? p.gamification : {},
        gameData: p.gameData && typeof p.gameData === 'object' ? p.gameData : {},
        arcadeSaves,
    };
}

function markProgressPullResult(store, treeRef, ok, remote = null) {
    if (!store) return;
    const key = progressTreeKey(treeRef);
    if (!key) return;
    if (!store._progressPullOkByTree) store._progressPullOkByTree = Object.create(null);
    if (!store._progressRemoteFingerprintByTree) {
        store._progressRemoteFingerprintByTree = Object.create(null);
    }
    if (!store._lastPulledProgressByTree) store._lastPulledProgressByTree = Object.create(null);
    store._progressPullOkByTree[key] = !!ok;
    if (ok) {
        store._lastPulledProgressByTree[key] = remote && typeof remote === 'object' ? remote : null;
        store._progressRemoteFingerprintByTree[key] = fingerprintProgressPayload(remote);
    }
}

function applyRemoteProgressDataToUserStore(store, data) {
    if (!store?.userStore?.state || !data || typeof data !== 'object') return false;
    const before = fingerprintProgressPayload(getProgressPayloadForSyncAction());
    if (Array.isArray(data.progress)) {
        store.userStore.state.completedNodes = new Set([
            ...store.userStore.state.completedNodes,
            ...data.progress,
        ]);
    }
    if (data.memory && typeof data.memory === 'object') {
        store.userStore.state.memory = mergeMemoryMaps(store.userStore.state.memory, data.memory);
    }
    if (data.bookmarks && typeof data.bookmarks === 'object') {
        store.userStore.state.bookmarks = mergeBookmarkMaps(
            store.userStore.state.bookmarks,
            data.bookmarks
        );
    }
    if (data.gameData && typeof data.gameData === 'object') {
        store.userStore.state.gameData = mergeGameDataBuckets(
            store.userStore.state.gameData,
            data.gameData
        );
    }
    if (data.arcadeSaves && typeof data.arcadeSaves === 'object') {
        try {
            storageManager.mergeFromSync(data.arcadeSaves);
        } catch (e) {
            console.warn('Arcade saves merge failed', e);
        }
    } else if (data.gameData && typeof data.gameData === 'object') {
        /* Older payloads only had gameData — mirror into arcade storage. */
        try {
            storageManager.mergeFromSync(data.gameData);
        } catch {
            /* ignore */
        }
    }
    if (data.gamification && typeof data.gamification === 'object') {
        store.userStore.state.gamification = mergeRemoteGamification(
            store.userStore.state.gamification,
            data.gamification
        );
    }
    const after = fingerprintProgressPayload(getProgressPayloadForSyncAction());
    if (after === before) return false;
    store.userStore.persist();
    store.dispatchEvent(new CustomEvent('arborito-user-progress-changed'));
    return true;
}

async function fetchBestRemoteProgressData(store, treeRef, pair, net) {
    const records =
        typeof net.listUserProgressRecords === 'function'
            ? await net.listUserProgressRecords({ ...treeRef, userPub: pair.pub })
            : [await net.getUserProgress({ ...treeRef, userPub: pair.pub })].filter(Boolean);
    if (!Array.isArray(records) || !records.length) {
        return { remote: null, headersSeen: false };
    }
    let data = null;
    let bestUpdatedAt = 0;
    let headersSeen = false;
    for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue;
        headersSeen = true;
        try {
            const decrypted =
                typeof net.decryptUserProgressRecord === 'function'
                    ? await net.decryptUserProgressRecord({
                          ...treeRef,
                          userPub: pair.pub,
                          pair,
                          record: rec,
                      })
                    : rec?.ct
                      ? await net.decryptForSelf({ pair, encrypted: rec.ct })
                      : null;
            if (!decrypted || typeof decrypted !== 'object') continue;
            const updatedAt = Date.parse(String(decrypted.updatedAt || rec?.updatedAt || '')) || 0;
            if (!data || updatedAt >= bestUpdatedAt) {
                data = decrypted;
                bestUpdatedAt = updatedAt;
            }
        } catch {
            /* try older / alternate progress record */
        }
    }
    if (headersSeen && !data) {
        /* Header(s) on relays but parts/decrypt failed — not the same as empty. */
        throw new Error('progress record present but undecryptable');
    }
    return { remote: data && typeof data === 'object' ? data : null, headersSeen };
}

/**
 * Pull remote progress, merge into local (union + LWW). Does not publish.
 * @returns {Promise<boolean>}
 */
export async function loadNetworkProgressIntoUserStoreAction(treeRef) {
    const store = shell();
    if (!shouldSyncNetworkProgress(store) || !isNostrNetworkAvailable()) return false;
    if (!treeRef?.pub || !treeRef?.universeId) return false;
    /* Second caller must not run a parallel pull (race + double relay load). */
    if (store._nostrProgressPullInFlight) return false;
    store._nostrProgressPullInFlight = true;
    try {
        const pair = await store.ensureNetworkUserPair?.();
        if (!pair?.pub) {
            markProgressPullResult(store, treeRef, false);
            return false;
        }
        const net = await getConnectedNostr(store);
        if (!net) {
            markProgressPullResult(store, treeRef, false);
            return false;
        }
        let remote = null;
        let ok = false;
        let lastErr = null;
        for (let attempt = 0; attempt < PROGRESS_PULL_RETRIES; attempt++) {
            try {
                const result = await fetchBestRemoteProgressData(store, treeRef, pair, net);
                remote = result.remote;
                /* Retry empty answers — relay timeouts often look like "no events". */
                if (remote || result.headersSeen || attempt + 1 >= PROGRESS_PULL_RETRIES) {
                    ok = true;
                    break;
                }
                await sleep(PROGRESS_PULL_RETRY_MS * (attempt + 1));
            } catch (e) {
                lastErr = e;
                if (attempt + 1 < PROGRESS_PULL_RETRIES) {
                    await sleep(PROGRESS_PULL_RETRY_MS * (attempt + 1));
                }
            }
        }
        if (!ok) {
            if (lastErr) console.warn('Network progress load failed', lastErr);
            markProgressPullResult(store, treeRef, false);
            return false;
        }
        /* remote=null after retries = best-effort empty; still a successful pull. */
        if (remote) applyRemoteProgressDataToUserStore(store, remote);
        markProgressPullResult(store, treeRef, true, remote);
        return true;
    } catch (e) {
        console.warn('Network progress load failed', e);
        markProgressPullResult(store, treeRef, false);
        return false;
    } finally {
        store._nostrProgressPullInFlight = false;
    }
}

export function maybeSyncNetworkProgressAction(_persistencePayload) {
    const store = shell();
    if (!shouldSyncNetworkProgress(store)) return;
    if (store._nostrProgressPullInFlight) return;
    if (!isNostrNetworkAvailable()) return;
    const refs = listProgressSyncTreeRefsAction();
    if (!refs.length) return;

    let needsReconcile = false;
    for (const treeRef of refs) {
        const key = progressTreeKey(treeRef);
        const pullOk = !!(store._progressPullOkByTree && store._progressPullOkByTree[key]);
        if (!pullOk) {
            needsReconcile = true;
            break;
        }
    }
    /* Never publish before a successful pull for a channel — reconcile first. */
    if (needsReconcile) {
        void reconcileNetworkProgressAction();
        return;
    }

    /*
     * Debounce only — do not fingerprint / export arcade saves on every persist
     * (that hitch blocked lesson UX). Heavy work runs when the timer fires.
     */
    clearTimeout(store._nostrProgressSyncTimer);
    store._nostrProgressSyncTimer = setTimeout(() => {
        void syncNetworkProgressNowAction();
    }, 800);
}

export async function syncNetworkProgressNowAction(persistencePayloadOrTreeRef, maybeTreeRef) {
    const store = shell();
    if (!store || !isNostrNetworkAvailable()) return;
    if (!shouldSyncNetworkProgress(store)) return;
    if (store._nostrProgressPullInFlight) return;
    let singleRef = null;
    let persistencePayload = null;
    if (
        persistencePayloadOrTreeRef &&
        typeof persistencePayloadOrTreeRef === 'object' &&
        persistencePayloadOrTreeRef.pub &&
        persistencePayloadOrTreeRef.universeId &&
        !Array.isArray(persistencePayloadOrTreeRef.progress)
    ) {
        singleRef = persistencePayloadOrTreeRef;
    } else {
        persistencePayload = persistencePayloadOrTreeRef;
        singleRef = maybeTreeRef || null;
    }
    const refs = singleRef ? [singleRef] : listProgressSyncTreeRefsAction();
    if (!refs.length || store._nostrProgressSyncInFlight) return;
    const payload = persistencePayload
        ? getProgressPayloadForSyncAction(persistencePayload)
        : getProgressPayloadForSyncAction();
    if (isProgressPayloadEmpty(payload)) return;

    store._nostrProgressSyncInFlight = true;
    try {
        const pair = await store.ensureNetworkUserPair?.();
        if (!pair?.pub) return;
        const net = await getConnectedNostr(store);
        if (!net) return;
        const peers = Array.isArray(net.peers) ? net.peers : [];
        if (typeof net.putUserProgressPacked !== 'function') {
            throw new Error('putUserProgressPacked required for network progress sync');
        }
        for (const treeRef of refs) {
            const key = progressTreeKey(treeRef);
            const pullOk = !!(store._progressPullOkByTree && store._progressPullOkByTree[key]);
            /* Refuse blind publish when we have never successfully pulled this tree. */
            if (!pullOk) continue;
            if (
                store._progressRemoteFingerprintByTree &&
                Object.prototype.hasOwnProperty.call(store._progressRemoteFingerprintByTree, key) &&
                fingerprintProgressPayload(payload) === store._progressRemoteFingerprintByTree[key]
            ) {
                continue;
            }
            /* Publish to every configured relay so another device with a different
             * subset still finds the same progress record. */
            await net.putUserProgressPacked({
                ...treeRef,
                userPub: pair.pub,
                pair,
                data: payload,
                peers: peers.length ? peers : null,
            });
            markProgressPullResult(store, treeRef, true, payload);
        }
    } catch (e) {
        console.warn('Network progress sync failed', e);
    } finally {
        store._nostrProgressSyncInFlight = false;
    }
}

/**
 * Rsync-style reconcile: pull → merge → publish only if local content differs.
 * When no explicit ref is passed, reconciles account-care (demo/local) and the
 * active public tree when open.
 * @param {{ pub: string, universeId: string }|null} [treeRef]
 */
export async function reconcileNetworkProgressAction(treeRef = null) {
    const store = shell();
    if (!shouldSyncNetworkProgress(store) || !isNostrNetworkAvailable()) return false;
    const refs = treeRef?.pub && treeRef?.universeId ? [treeRef] : listProgressSyncTreeRefsAction();
    if (!refs.length) return false;
    if (store._nostrProgressReconcileInFlight) {
        store._nostrProgressReconcileAgain = true;
        return false;
    }
    store._nostrProgressReconcileInFlight = true;
    try {
        let anyOk = false;
        do {
            store._nostrProgressReconcileAgain = false;
            for (const ref of refs) {
                const pullOk = await loadNetworkProgressIntoUserStoreAction(ref);
                if (!pullOk) continue;
                anyOk = true;
                const key = progressTreeKey(ref);
                const remote = store._lastPulledProgressByTree?.[key] ?? null;
                const merged = getProgressPayloadForSyncAction();
                if (shouldPublishMergedProgress({ remote, merged })) {
                    await syncNetworkProgressNowAction(null, ref);
                }
            }
        } while (store._nostrProgressReconcileAgain);
        return anyOk;
    } catch (e) {
        console.warn('Network progress reconcile failed', e);
        return false;
    } finally {
        store._nostrProgressReconcileInFlight = false;
    }
}

/** Pull+conditional-push when the app returns to foreground or network recovers. */
export function maybeReconcileNetworkProgressOnResumeAction() {
    const store = shell();
    if (!shouldSyncNetworkProgress(store)) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (!isNostrNetworkAvailable()) return;
    const refs = listProgressSyncTreeRefsAction();
    if (!refs.length) return;
    const now = Date.now();
    if (
        store._progressResumeReconcileAt &&
        now - store._progressResumeReconcileAt < PROGRESS_RESUME_RECONCILE_MIN_MS
    ) {
        return;
    }
    store._progressResumeReconcileAt = now;
    void reconcileNetworkProgressAction();
}

export function maybeShowCloudSyncBannerForSourceAction(_source) {
    /* Progress backup hint now appears in the lesson reader after meaningful progress. */
}

export function dismissCloudSyncBannerAction() {
    const store = shell();
    if (!store) return;
    const b = store.value.cloudSyncBanner;
    if (b?.pub && b?.universeId) {
        try {
            sessionStorage.setItem(`arborito-cloudsync-banner-seen:${b.pub}:${b.universeId}`, '1');
        } catch {
            /* ignore */
        }
    }
    store.update({ cloudSyncBanner: null });
}

export function enableCloudSyncFromBannerAction() {
    const store = shell();
    if (!store) return;
    store.userStore.state.cloudProgressSync = true;
    store.userStore.persist();
    dismissCloudSyncBannerAction();
    try {
        void store.reconcileNetworkProgress?.();
    } catch {
        /* ignore */
    }
    notifyAction(store.ui.profileExportOk || 'Saved.', false);
}

/** Store.prototype, bookmarks, certificates, module status. */
export const storeProgressCertificatesMethods = {
    computeHash: computeHashAction,
    loadBookmarks: loadBookmarksAction,
    saveBookmark: saveBookmarkAction,
    removeBookmark: removeBookmarkAction,
    getBookmark: getBookmarkAction,
    getRecentLessonPosition: getRecentLessonPositionAction,
    getLessonResumePosition: getLessonResumePositionAction,
    recordRecentLesson: recordRecentLessonAction,
    getManualBookmarks: getManualBookmarksAction,
    getRecentLessons: getRecentLessonsAction,
    loadProgress: loadProgressAction,
    isCompleted: isCompletedAction,
    getAvailableCertificates: getAvailableCertificatesAction,
    getAchievementSections: getAchievementSectionsAction,
    getAllAchievements: getAllAchievementsAction,
    getModulesStatus: getModulesStatusAction,
    getProgressScope: getProgressScopeAction,
};

/** Store.prototype, encrypted Nostr progress sync. */
export const storeNostrSyncProgressMethods = {
    getProgressSyncTreeRef: getProgressSyncTreeRefAction,
    listProgressSyncTreeRefs: listProgressSyncTreeRefsAction,
    getProgressPayloadForSync: getProgressPayloadForSyncAction,
    maybeSyncNetworkProgress: maybeSyncNetworkProgressAction,
    syncNetworkProgressNow: syncNetworkProgressNowAction,
    loadNetworkProgressIntoUserStore: loadNetworkProgressIntoUserStoreAction,
    reconcileNetworkProgress: reconcileNetworkProgressAction,
    maybeReconcileNetworkProgressOnResume: maybeReconcileNetworkProgressOnResumeAction,
    maybeShowCloudSyncBannerForSource: maybeShowCloudSyncBannerForSourceAction,
    dismissCloudSyncBanner: dismissCloudSyncBannerAction,
    enableCloudSyncFromBanner: enableCloudSyncFromBannerAction,
};

/** Garden progress actions for hooks. */
export const gardenProgressActions = {
    getManualBookmarks: getManualBookmarksAction,
    getRecentLessons: getRecentLessonsAction,
    isCompleted: isCompletedAction,
    getBookmark: getBookmarkAction,
    saveBookmark: saveBookmarkAction,
    removeBookmark: removeBookmarkAction,
    markComplete: markCompleteAction,
    getAvailableCertificates: getAvailableCertificatesAction,
    getAchievementSections: getAchievementSectionsAction,
    getAllAchievements: getAllAchievementsAction,
    getModulesStatus: getModulesStatusAction,
    leaveCertificatesView: leaveCertificatesViewAction,
    loadTreeRanking: loadTreeRankingAction,
    buyGardenShopItem: buyGardenShopItemAction,
    equipGardenShopItem: equipGardenShopItemAction,
    unequipGardenShopItem: unequipGardenShopItemAction,
    hasNetworkSocialConsent: hasNetworkSocialConsentAction,
    needsNetworkSocialConsent: needsNetworkSocialConsentAction,
    grantNetworkSocialConsent: grantNetworkSocialConsentAction,
    setRankingOptIn: setRankingOptInAction,
    maybeSyncNetworkProgress: maybeSyncNetworkProgressAction,
    reconcileNetworkProgress: reconcileNetworkProgressAction,
    maybeReconcileNetworkProgressOnResume: maybeReconcileNetworkProgressOnResumeAction,
    dismissCloudSyncBanner: dismissCloudSyncBannerAction,
    enableCloudSyncFromBanner: enableCloudSyncFromBannerAction,
};
