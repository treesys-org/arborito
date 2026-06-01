import { store } from '../../../../core/store.js';
import { escHtml } from '../../../../shared/lib/html-escape.js';

/** Preferences-related concerns of the Profile sheet:
 *  - the inline session-status row that surfaces the cloud-sync preference
 *    (`local only` / `online` / `cloud on` / `cloud off`);
 *  - the cloud-sync enablement helpers shared between the register and
 *    sign-in flows, so toggling the preference happens in one place. */
export const prefsMixin = {
    _renderUnifiedStatusRow(ui, signedIn, isSyncAccount, accountUsername, cloudProgressOn) {
        let statusDotClass = 'bg-slate-400 dark:bg-slate-500';
        let statusLine = escHtml(ui.profileModeLocal || 'Local only');
        if (signedIn) {
            if (isSyncAccount && cloudProgressOn) {
                statusDotClass = 'bg-emerald-500';
                statusLine = escHtml(
                    String(ui.profileModeOnlineSyncOn || '{user} · cloud on').replace(/\{user\}/g, accountUsername)
                );
            } else if (isSyncAccount && !cloudProgressOn) {
                statusDotClass = 'bg-amber-500';
                statusLine = escHtml(
                    String(ui.profileModeOnlineSyncOff || '{user} · cloud off').replace(/\{user\}/g, accountUsername)
                );
            } else {
                statusDotClass = 'bg-sky-500';
                statusLine = escHtml(
                    String(ui.profileModeOnline || '{user} · online').replace(/\{user\}/g, accountUsername)
                );
            }
        }
        return `<p class="profile-session-status" role="status">
                <span class="profile-session-status__dot ${statusDotClass}" aria-hidden="true"></span>
                <span>${statusLine}</span>
            </p>`;
    },

    /** Flip the cloud-progress-sync preference on, persist it, and (optionally)
     * surface the toast. Used after both register and sign-in so the user lands
     * with their cloud preference reflecting "yes, sync from here". */
    _profileEnableCloudSync(opts = {}) {
        const showToast = opts.showToast !== false;
        store.userStore.state.cloudProgressSync = true;
        store.userStore.persist();
        try {
            store.maybeSyncNetworkProgress(store.userStore.getPersistenceData());
        } catch {
            /* ignore */
        }
        if (showToast) {
            store.notify(store.ui.welcomeAccountEnabledToast || store.ui.welcomeCloudSyncOnLabel || 'On', false);
        }
    },

    _profileAfterSignedIn() {
        this._profileEnableCloudSync();
        if (store.needsNetworkSocialConsent?.()) {
            store.grantNetworkSocialConsent?.();
        }
    }
};
