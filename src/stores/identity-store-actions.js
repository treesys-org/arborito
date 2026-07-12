import { getArboritoStore } from '../core/store-singleton.js';
import { parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { isNostrNetworkAvailable } from '../features/nostr/api/nostr-network-env.js';
import { getConnectedNostr } from '../shared/lib/connected-services/index.js';
import { isNostrTreeMaintainerBlocked as isNostrTreeOnMaintainerBlocklist } from '../features/nostr/api/maintainer-nostr-tree-blocklist.js';
import {
    persistUserNostrRelays,
    normalizeNostrRelayUrls,
} from '../features/nostr/api/nostr-relays-runtime.js';
import {
    wipeAllLocalDataOnThisDeviceAction as wipeAllLocalDataOnThisDeviceGdprAction,
    wipeAllLocalDataOnThisDeviceInteractiveAction as wipeAllLocalDataOnThisDeviceInteractiveGdprAction,
} from './privacy-gdpr-store-actions.js';
import { notifyIdentityChanged } from './store-notify.js';
import {
    grantNetworkSocialConsentAction as grantNetworkSocialConsentGardenAction,
    hasNetworkSocialConsentAction as hasNetworkSocialConsentGardenAction,
    needsNetworkSocialConsentAction as needsNetworkSocialConsentGardenAction,
} from './garden-progress-store-actions.js';
import {
    encryptAccountEscrow,
    decryptAccountEscrow,
} from '../features/identity-auth/api/account-escrow.js';
import { deriveAccountSigningPair } from '../features/identity-auth/api/sync-login-secret.js';
import { normalizeUsername } from '../shared/lib/normalize-username.js';

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
    changeSyncLoginPasswordAction,
    renameSyncLoginUsernameAction,
    deleteSyncLoginOnlineAccountAction,
    downloadRecoveryKitFileAction,
    setAccountRecoveryAction,
    clearAccountRecoveryAction,
    hasAccountRecoveryAction,
    recoverAccountWithPassphraseAction,
} from './identity-sync-login-store-actions.js';

export {
    isSyncAccountAction,
    signOutAction,
    updateUserProfileAction,
    signInWithSyncSecretAction,
    registerSyncLoginAccountAction,
    changeSyncLoginPasswordAction,
    renameSyncLoginUsernameAction,
    deleteSyncLoginOnlineAccountAction,
    downloadRecoveryKitFileAction,
    setAccountRecoveryAction,
    clearAccountRecoveryAction,
    hasAccountRecoveryAction,
    recoverAccountWithPassphraseAction,
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
    persistUserNostrRelays(peers);
    void (async () => {
        try {
            const net = await getConnectedNostr(store);
            if (net) {
                net.setPeers(peers);
                syncNostrPresenceFromActiveSourceAction(store.state.activeSource);
            }
            notifyIdentityChanged(store);
        } catch (e) {
            console.warn('setNostrRelayUrls failed', e);
        }
    })();
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
    void (async () => {
        const net = await getConnectedNostr(store);
        if (!net) {
            store.update({ nostrLiveSeeds: null });
            return;
        }
        store._nostrPresenceSession = net.startUniversePresence({
            pub: ref.pub,
            universeId: ref.universeId,
            onCount: (total) => {
                if (String(store.state.activeSource?.url || '') !== url) return;
                const t = typeof total === 'number' && total >= 0 ? total : 0;
                if (store.state.nostrLiveSeeds === t) return;
                store.update({ nostrLiveSeeds: t });
            },
        });
    })();
}

/** Store.prototype, Nostr presence + relay URLs. */
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
    const net = await getConnectedNostr(store);
    if (!net) return;
    try {
        const blob = await net.loadAccountUserPairEscrowOnce(name);
        if (blob && secret) {
            try {
                const restored = await decryptAccountEscrow(blob, secret);
                if (restored?.identityPair?.pub && restored.identityPair.priv) {
                    store.saveNetworkUserPair(restored.identityPair);
                    await publishNetworkUserPubIndexAction(store, name);
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
                net.putAccountUserPairEscrow({ username: name, escrow });
            }
        }
        await publishNetworkUserPubIndexAction(store, name);
    } catch (e) {
        console.warn('User-pair escrow flow failed', e);
    }
}

async function publishNetworkUserPubIndexAction(store, username) {
    const name = normalizeUsername(username);
    const secret = String(store._authSession?.syncSecretPlain || '').trim();
    const pair = store.getNetworkUserPair?.();
    if (!name || !secret || !(pair?.pub && pair?.priv) || !isNostrNetworkAvailable()) return;
    const net = await getConnectedNostr(store);
    if (!net) return;
    const signer = deriveAccountSigningPair(name, secret);
    if (!signer) return;
    try {
        await net.putNetworkUserPubIndex({
            username: name,
            networkUserPub: pair.pub,
            signerPair: signer,
        });
    } catch (e) {
        console.warn('Network user pub index publish failed', e);
    }
}

export async function republishUserPairEscrowOnRotationAction(username) {
    const store = shell();
    if (!store) return;
    const name = String(username || '').trim();
    const secret = String(store._authSession?.syncSecretPlain || '').trim();
    if (!name || !secret || !isNostrNetworkAvailable()) return;
    const net = await getConnectedNostr(store);
    if (!net) return;
    try {
        const local = await store.ensureNetworkUserPair?.();
        if (!(local?.pub && local?.priv)) return;
        const escrow = await encryptAccountEscrow({ username: name, identityPair: local }, secret);
        net.putAccountUserPairEscrow({ username: name, escrow });
        await publishNetworkUserPubIndexAction(store, name);
    } catch (e) {
        console.warn('User-pair escrow republish failed', e);
    }
}

/** Store.prototype, per-account user-pair escrow on Nostr. */
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
    changeSyncLoginPassword: changeSyncLoginPasswordAction,
    renameSyncLoginUsername: renameSyncLoginUsernameAction,
    deleteSyncLoginOnlineAccount: deleteSyncLoginOnlineAccountAction,
    downloadRecoveryKitFile: downloadRecoveryKitFileAction,
    setAccountRecovery: setAccountRecoveryAction,
    clearAccountRecovery: clearAccountRecoveryAction,
    hasAccountRecovery: hasAccountRecoveryAction,
    recoverAccountWithPassphrase: recoverAccountWithPassphraseAction,
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
