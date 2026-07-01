import { getArboritoStore } from '../core/store-singleton.js';
import { celebrate } from '../features/garden-progress/api/celebration.js';
import { publishTreeRankingIfOptedIn, fetchTreeRanking } from '../features/tree-graph/api/tree-ranking.js';
import { syncGardenBackground } from '../features/garden-progress/api/garden-background.js';
import {
    buildNetworkSocialConsentPatch,
    hasNetworkSocialConsent,
    needsNetworkSocialConsent,
} from '../shared/lib/connected-services/index.js';
import { notifyAction } from './shell-ui-store-actions.js';
import { TreeUtils } from '../features/tree-graph/api/tree-utils.js';
import { getMobilePath } from '../features/tree-graph/api/graph-ui-accessors.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';

function shell() {
    return getArboritoStore();
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

export function getRecentLessonPositionAction(nodeId) {
    return shell()?.userStore?.settings?.getRecentLessonPosition?.(nodeId);
}

export function getLessonResumePositionAction(nodeId, contentRaw) {
    return shell()?.userStore?.settings?.getLessonResumePosition?.(nodeId, contentRaw);
}

export function recordRecentLessonAction(nodeId, index, visitedSet) {
    return shell()?.userStore?.settings?.recordRecentLesson?.(nodeId, index, visitedSet);
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
    if (store.state.data?.certificates) {
        return store.state.data.certificates.map((c) => ({
            ...c,
            isComplete: store.userStore.state.completedNodes.has(c.id),
        }));
    }
    return getModulesStatusAction().filter((m) => m.isCertifiable);
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
            notifyAction(ui.gardenShopInsufficient || 'Te faltan lúmenes. Sigue estudiando.', true);
        } else if (result.error === 'owned') {
            notifyAction(ui.gardenShopAlreadyOwned || 'Ya la tienes.', false);
        }
        return false;
    }
    celebrate('purchase');
    notifyAction(ui.gardenShopPurchased || '¡Nueva decoración para tu jardín!', false);
    syncGardenBackground(store);
    store.update({});
    return true;
}

export function equipGardenShopItemAction(itemId) {
    const store = shell();
    if (!store) return false;
    const ok = store.userStore.equipGardenDecorItem(itemId);
    if (ok) {
        notifyAction(store.ui.gardenShopEquippedToast || 'Decoración colocada.', false);
        syncGardenBackground(store);
        store.update({});
    }
    return ok;
}

export function unequipGardenShopItemAction(slot) {
    const store = shell();
    if (!store) return false;
    const ok = store.userStore.unequipGardenDecorItem(slot);
    if (ok) {
        notifyAction(store.ui.gardenShopUnequippedToast || 'Decoración quitada.', false);
        syncGardenBackground(store);
        store.update({});
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
    store.update({});
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
    store.update({});
}

/** Store.prototype — garden shop, ranking, social consent. */
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
    return {
        v: 1,
        updatedAt: new Date().toISOString(),
        progress: Array.isArray(p.progress) ? p.progress : [],
        memory: p.memory && typeof p.memory === 'object' ? p.memory : {},
        bookmarks: p.bookmarks && typeof p.bookmarks === 'object' ? p.bookmarks : {},
        gamification: p.gamification && typeof p.gamification === 'object' ? p.gamification : {},
        gameData: p.gameData && typeof p.gameData === 'object' ? p.gameData : {},
    };
}

export function maybeSyncNetworkProgressAction(persistencePayload) {
    const store = shell();
    if (!store?.userStore?.state?.cloudProgressSync) return;
    if (!isNostrNetworkAvailable()) return;
    const treeRef = store.getActivePublicTreeRef?.();
    if (!treeRef) return;
    clearTimeout(store._nostrProgressSyncTimer);
    store._nostrProgressSyncTimer = setTimeout(() => {
        void syncNetworkProgressNowAction(persistencePayload);
    }, 800);
}

export async function syncNetworkProgressNowAction(persistencePayload) {
    const store = shell();
    if (!store || !isNostrNetworkAvailable()) return;
    const treeRef = store.getActivePublicTreeRef?.();
    if (!treeRef || store._nostrProgressSyncInFlight) return;
    store._nostrProgressSyncInFlight = true;
    try {
        const pair = await store.ensureNetworkUserPair?.();
        if (!pair?.pub) return;
        const payload = getProgressPayloadForSyncAction(persistencePayload);
        const encrypted = await store.nostr.encryptForSelf({ pair, data: payload });
        const peers = Array.isArray(store.nostr?.peers) ? store.nostr.peers : [];
        store.nostr.putUserProgressReplicated({
            ...treeRef,
            userPub: pair.pub,
            record: { ct: encrypted, updatedAt: payload.updatedAt },
            peers: peers.slice(0, 3),
        });
    } catch (e) {
        console.warn('Network progress sync failed', e);
    } finally {
        store._nostrProgressSyncInFlight = false;
    }
}

export async function loadNetworkProgressIntoUserStoreAction(treeRef) {
    const store = shell();
    if (!store?.userStore?.state?.cloudProgressSync || !isNostrNetworkAvailable()) return false;
    try {
        const pair = await store.ensureNetworkUserPair?.();
        if (!pair?.pub) return false;
        const rec = await store.nostr.getUserProgress({ ...treeRef, userPub: pair.pub });
        if (!rec?.ct) return false;
        const data = await store.nostr.decryptForSelf({ pair, encrypted: rec.ct });
        if (!data || typeof data !== 'object') return false;

        if (Array.isArray(data.progress)) {
            store.userStore.state.completedNodes = new Set([
                ...store.userStore.state.completedNodes,
                ...data.progress,
            ]);
        }
        if (data.memory && typeof data.memory === 'object') {
            store.userStore.state.memory = { ...data.memory };
        }
        if (data.bookmarks && typeof data.bookmarks === 'object') {
            store.userStore.state.bookmarks = { ...data.bookmarks };
        }
        if (data.gameData && typeof data.gameData === 'object') {
            store.userStore.state.gameData = { ...data.gameData };
        }
        if (data.gamification && typeof data.gamification === 'object') {
            const g = store.userStore.state.gamification;
            const bg = data.gamification;
            if ((bg.xp || 0) > (g.xp || 0)) g.xp = bg.xp;
            g.dailyXP = Math.max(g.dailyXP || 0, bg.dailyXP || 0);
            g.streak = Math.max(g.streak || 0, bg.streak || 0);
            if (!g.username && bg.username) g.username = bg.username;
            if ((!g.avatar || g.avatar === '👤' || g.avatar === '🌱') && bg.avatar) g.avatar = bg.avatar;
        }

        store.userStore.persist();
        store.update({});
        return true;
    } catch (e) {
        console.warn('Network progress load failed', e);
        return false;
    }
}

export function maybeShowCloudSyncBannerForSourceAction(source) {
    const store = shell();
    if (!store) return;
    try {
        if (store.value.constructionMode) return;
        if (store.userStore?.state?.cloudProgressSync) return;
        const treeRef = parseNostrTreeUrl(String(source?.url || ''));
        if (!treeRef) return;
        if ((store.userStore?.state?.completedNodes?.size || 0) <= 0) return;
        const key = `arborito-cloudsync-banner-seen:${treeRef.pub}:${treeRef.universeId}`;
        if (sessionStorage.getItem(key)) return;
        store.update({
            cloudSyncBanner: {
                pub: treeRef.pub,
                universeId: treeRef.universeId,
                sourceId: source?.id || null,
                url: formatNostrTreeUrl(treeRef.pub, treeRef.universeId),
            },
        });
    } catch {
        /* ignore */
    }
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
        maybeSyncNetworkProgressAction(store.userStore.getPersistenceData());
    } catch {
        /* ignore */
    }
    notifyAction(store.ui.profileExportOk || 'Saved.', false);
}

/** Store.prototype — bookmarks, certificates, module status. */
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
    getModulesStatus: getModulesStatusAction,
    getProgressScope: getProgressScopeAction,
};

/** Store.prototype — encrypted Nostr progress sync. */
export const storeNostrSyncProgressMethods = {
    getProgressPayloadForSync: getProgressPayloadForSyncAction,
    maybeSyncNetworkProgress: maybeSyncNetworkProgressAction,
    syncNetworkProgressNow: syncNetworkProgressNowAction,
    loadNetworkProgressIntoUserStore: loadNetworkProgressIntoUserStoreAction,
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
    dismissCloudSyncBanner: dismissCloudSyncBannerAction,
    enableCloudSyncFromBanner: enableCloudSyncFromBannerAction,
};
