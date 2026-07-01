import { getArboritoStore } from '../../../core/store-singleton.js';
import { identityActions } from '../../../stores/identity-store-actions.js';

/** Enable cloud progress sync after sign-in (profile / onboarding). */
export function profileEnableCloudSync(opts = {}) {
    const showToast = opts.showToast !== false;
    const store = getArboritoStore();
    if (!store?.userStore) return;
    store.userStore.state.cloudProgressSync = true;
    store.userStore.persist();
    try {
        store.maybeSyncNetworkProgress?.(store.userStore.getPersistenceData());
    } catch {
        /* ignore */
    }
    if (showToast) {
        const ui = store.ui || {};
        store.notify?.(
            ui.welcomeAccountEnabledToast || ui.welcomeCloudSyncOnLabel || 'On',
            false
        );
    }
}

/** Post sign-in: cloud sync on + network social consent when needed. */
export function profileAfterSignedIn() {
    profileEnableCloudSync();
    if (identityActions.needsNetworkSocialConsent()) {
        identityActions.grantNetworkSocialConsent();
    }
}
