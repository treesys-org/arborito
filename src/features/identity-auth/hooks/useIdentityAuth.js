import { useCallback } from 'react';
import { useHookUi, useShellModalActions } from '../../../app/hooks/useHookShell.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { useShellUiSlice, shellUiActions } from '../../../stores/shell-ui-store.js';
import {
    identityActions,
    getAuthSessionAction,
    getGamificationAction,
    getUserStoreAction,
    getAvailableLanguagesAction,
} from '../../../stores/identity-store-actions.js';

/** Onboarding, perfil, sync login — única puerta al store para `.jsx`. */
export function useIdentityAuth() {
    const ui = useHookUi();
    const { dismissModal, setModal, notify, update, setLang, setTheme } = useShellModalActions();
    const shell = useShellUiSlice((s) => s);
    const { theme, lang, cloudSyncBanner, modal, viewMode } = shell;

    const authSession = getAuthSessionAction();
    const gamification = getGamificationAction();
    const availableLanguages = getAvailableLanguagesAction() ?? [];
    const userStore = getUserStoreAction();

    const confirm = useCallback((...a) => shellUiActions.confirm(...a), []);
    const alert = useCallback((...a) => shellUiActions.alert(...a), []);
    const isSignedIn = useCallback(() => shellUiActions.isSignedIn(), []);
    const isSyncAccount = useCallback(() => identityActions.isSyncAccount(), []);
    const toggleTheme = useCallback(() => shellUiActions.toggleTheme(), []);

    return {
        ui,
        theme,
        lang,
        cloudSyncBanner,
        modal,
        viewMode,
        gamification,
        authSession,
        availableLanguages,
        userStore,
        identityActions,
        confirm,
        alert,
        isSignedIn,
        isSyncAccount,
        toggleTheme,
        dismissModal,
        setModal,
        notify,
        setLang,
        setTheme,
        setLanguage: setLang,
        update,
    };
}

/** Singleton for rare imperative effects in identity hooks only. */
export function useIdentityAuthStore() {
    return getArboritoStore();
}

/** Onboarding step 1 — UI language only (no tree content language yet). */
export async function pickOnboardingLanguage(code) {
    const c = String(code || '').trim();
    if (!c) return;
    await shellUiActions.setLanguage(c, { uiOnly: true });
}
