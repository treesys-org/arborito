import { useHookUi, useShellModalActions, useShellModalLang } from '../../../app/hooks/useHookShell.js';
import { privacyGdprActions } from '../../../stores/privacy-gdpr-store-actions.js';
import { identityActions } from '../../../stores/identity-store-actions.js';
import { cancelPendingAccountSyncTimersAction } from '../../../stores/identity-account-restore-store-actions.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';

/** GDPR, consentimiento red, privacidad. */
export function usePrivacyGdpr() {
    const ui = useHookUi();
    const { modal, lang } = useShellModalLang();
    const { dismissModal, setModal, notify } = useShellModalActions();

    return {
        ui,
        modal,
        lang,
        grantGdprNetworkConsent: privacyGdprActions.grantGdprNetworkConsent,
        hasGdprNetworkConsent: privacyGdprActions.hasGdprNetworkConsent,
        resetOptionalConsentsInteractive: privacyGdprActions.resetOptionalConsentsInteractive,
        wipeAllLocalDataOnThisDeviceInteractive: privacyGdprActions.wipeAllLocalDataOnThisDeviceInteractive,
        cancelPendingAccountSyncTimers: cancelPendingAccountSyncTimersAction,
        loadLanguage: identityActions.loadLanguage,
        dismissModal,
        setModal,
        notify,
    };
}

export function usePrivacyGdprStore() {
    return store;
}
