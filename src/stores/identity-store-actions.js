import { getArboritoStore } from '../core/store-singleton.js';
import { parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { isNostrNetworkAvailable } from '../features/nostr/api/client/index.js';
import { isNostrTreeMaintainerBlocked as isNostrTreeOnMaintainerBlocklist } from '../features/nostr/api/maintainer-nostr-tree-blocklist.js';
import {
    wipeAllLocalDataOnThisDeviceAction as wipeAllLocalDataOnThisDeviceGdprAction,
    wipeAllLocalDataOnThisDeviceInteractiveAction as wipeAllLocalDataOnThisDeviceInteractiveGdprAction,
} from './privacy-gdpr-store-actions.js';
import {
    grantNetworkSocialConsentAction as grantNetworkSocialConsentGardenAction,
    hasNetworkSocialConsentAction as hasNetworkSocialConsentGardenAction,
    needsNetworkSocialConsentAction as needsNetworkSocialConsentGardenAction,
} from './garden-progress-store-actions.js';
import {
    encryptAccountEscrow,
    decryptAccountEscrow,
} from '../features/identity-auth/api/account-escrow.js';

function shell() {
    return getArboritoStore();
}

function storeCall(method) {
    return function (...args) {
        const store = shell();
        if (!store) return undefined;
        const fn = store[method];
        return typeof fn === 'function' ? fn.call(store, ...args) : undefined;
    };
}

export function getAuthSessionAction() {
    return shell()?._authSession ?? null;
}

export function getGamificationAction() {
    return shell()?.userStore?.state?.gamification ?? null;
}

export function getUserStoreAction() {
    return shell()?.userStore ?? null;
}

export function getAvailableLanguagesAction() {
    return shell()?.availableLanguages ?? [];
}

import { isSyncAccountAction, signOutAction } from './identity-auth-store-actions.js';
import { updateUserProfileAction } from './garden-user-progress-store-actions.js';
import {
    signInWithSyncSecretAction,
    registerSyncLoginAccountAction,
    rotateSyncLoginSecretAction,
    renameSyncLoginUsernameAction,
    deleteSyncLoginOnlineAccountAction,
    downloadSyncSecretFileAction,
} from './identity-sync-login-store-actions.js';

export {
    isSyncAccountAction,
    signOutAction,
    updateUserProfileAction,
    signInWithSyncSecretAction,
    registerSyncLoginAccountAction,
    rotateSyncLoginSecretAction,
    renameSyncLoginUsernameAction,
    deleteSyncLoginOnlineAccountAction,
    downloadSyncSecretFileAction,
};
export const wipeAllLocalDataOnThisDeviceAction = wipeAllLocalDataOnThisDeviceGdprAction;
export const wipeAllLocalDataOnThisDeviceInteractiveAction = wipeAllLocalDataOnThisDeviceInteractiveGdprAction;
export const grantNetworkSocialConsentAction = grantNetworkSocialConsentGardenAction;
export const hasNetworkSocialConsentAction = hasNetworkSocialConsentGardenAction;
export const needsNetworkSocialConsentAction = needsNetworkSocialConsentGardenAction;
export const loadLanguageAction = storeCall('loadLanguage');
export const promptAction = storeCall('prompt');
export const addStoreEventListenerAction = storeCall('addEventListener');
export const removeStoreEventListenerAction = storeCall('removeEventListener');

export function isNostrTreeMaintainerBlockedAction(ownerPub, universeId) {
    return isNostrTreeOnMaintainerBlocklist(ownerPub, universeId);
}

export function setNostrRelayUrlsAction(peers) {
    const store = shell();
    if (!store) return;
    try {
        store.nostr.setPeers(peers);
        try {
            localStorage.setItem('arborito-nostr-relays-v1', JSON.stringify(store.nostr.peers || []));
        } catch {
            /* ignore */
        }
        syncNostrPresenceFromActiveSourceAction(store.state.activeSource);
        store.update({});
    } catch (e) {
        console.warn('setNostrRelayUrls failed', e);
    }
}

export function syncNostrPresenceFromActiveSourceAction(source) {
    const store = shell();
    if (!store) return;
    if (store._nostrPresenceSession) {
        try {
            store._nostrPresenceSession.stop();
        } catch {
            /* ignore */
        }
        store._nostrPresenceSession = null;
    }
    if (!source?.url) {
        store.update({ nostrLiveSeeds: null });
        return;
    }
    const ref = parseNostrTreeUrl(String(source.url));
    if (!ref || !isNostrNetworkAvailable()) {
        store.update({ nostrLiveSeeds: null });
        return;
    }
    const url = String(source.url);
    store._nostrPresenceSession = store.nostr.startUniversePresence({
        pub: ref.pub,
        universeId: ref.universeId,
        onCount: (total) => {
            if (String(store.state.activeSource?.url || '') !== url) return;
            const t = typeof total === 'number' && total >= 0 ? total : 0;
            if (store.state.nostrLiveSeeds === t) return;
            store.update({ nostrLiveSeeds: t });
        },
    });
}

/** Store.prototype — Nostr presence + relay URLs. */
export const storePresenceMethods = {
    isNostrTreeMaintainerBlocked: isNostrTreeMaintainerBlockedAction,
    setNostrRelayUrls: setNostrRelayUrlsAction,
    syncNostrPresenceFromActiveSource: syncNostrPresenceFromActiveSourceAction,
};

export async function restoreOrPublishUserPairEscrowAction(username) {
    const store = shell();
    if (!store) return;
    const name = String(username || '').trim();
    const secret = String(store._authSession?.syncSecretPlain || '').trim();
    if (!name || !isNostrNetworkAvailable()) return;
    try {
        const blob = await store.nostr.loadAccountUserPairEscrowOnce(name);
        if (blob && secret) {
            try {
                const restored = await decryptAccountEscrow(blob, secret);
                if (restored?.identityPair?.pub && restored.identityPair.priv) {
                    store.saveNetworkUserPair(restored.identityPair);
                    return;
                }
            } catch (e) {
                console.warn('User-pair escrow decrypt failed', e);
            }
        }
        if (!blob && secret) {
            const local = await store.ensureNetworkUserPair?.();
            if (local?.pub && local?.priv) {
                const escrow = await encryptAccountEscrow({ username: name, identityPair: local }, secret);
                store.nostr.putAccountUserPairEscrow({ username: name, escrow });
            }
        }
    } catch (e) {
        console.warn('User-pair escrow flow failed', e);
    }
}

export async function republishUserPairEscrowOnRotationAction(username) {
    const store = shell();
    if (!store) return;
    const name = String(username || '').trim();
    const secret = String(store._authSession?.syncSecretPlain || '').trim();
    if (!name || !secret || !isNostrNetworkAvailable()) return;
    try {
        const local = await store.ensureNetworkUserPair?.();
        if (!(local?.pub && local?.priv)) return;
        const escrow = await encryptAccountEscrow({ username: name, identityPair: local }, secret);
        store.nostr.putAccountUserPairEscrow({ username: name, escrow });
    } catch (e) {
        console.warn('User-pair escrow republish failed', e);
    }
}

/** Store.prototype — per-account user-pair escrow on Nostr. */
export const storeAccountEscrowClientMethods = {
    _restoreOrPublishUserPairEscrow: restoreOrPublishUserPairEscrowAction,
    _republishUserPairEscrowOnRotation: republishUserPairEscrowOnRotationAction,
};

/** Identity / sync-login / GDPR / presence actions for hooks. */
export const identityActions = {
    isSyncAccount: isSyncAccountAction,
    signOut: signOutAction,
    signInWithSyncSecret: signInWithSyncSecretAction,
    registerSyncLoginAccount: registerSyncLoginAccountAction,
    rotateSyncLoginSecret: rotateSyncLoginSecretAction,
    renameSyncLoginUsername: renameSyncLoginUsernameAction,
    deleteSyncLoginOnlineAccount: deleteSyncLoginOnlineAccountAction,
    downloadSyncSecretFile: downloadSyncSecretFileAction,
    updateUserProfile: updateUserProfileAction,
    wipeAllLocalDataOnThisDevice: wipeAllLocalDataOnThisDeviceAction,
    wipeAllLocalDataOnThisDeviceInteractive: wipeAllLocalDataOnThisDeviceInteractiveAction,
    grantNetworkSocialConsent: grantNetworkSocialConsentAction,
    hasNetworkSocialConsent: hasNetworkSocialConsentAction,
    needsNetworkSocialConsent: needsNetworkSocialConsentAction,
    loadLanguage: loadLanguageAction,
    prompt: promptAction,
    addEventListener: addStoreEventListenerAction,
    removeEventListener: removeStoreEventListenerAction,
    getAuthSession: getAuthSessionAction,
    getGamification: getGamificationAction,
    getUserStore: getUserStoreAction,
    getAvailableLanguages: getAvailableLanguagesAction,
};
