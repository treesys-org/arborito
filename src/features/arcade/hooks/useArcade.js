import { useHookUi, useShellModalActions, useShellModalLang, useTreeLessonContext } from '../../../app/hooks/useHookShell.js';
import { useLearningSlice } from '../../../stores/learning-store.js';
import { arcadeActions, getArcadeStorageAction } from '../../../stores/arcade-store-actions.js';
import { identityActions, getGamificationAction, getUserStoreAction } from '../../../stores/identity-store-actions.js';

/** Arcade / minijuegos. */
export function useArcade() {
    const ui = useHookUi();
    const { lang, modal } = useShellModalLang();
    const tree = useTreeLessonContext();
    const ai = useLearningSlice((s) => s.ai);
    const { dismissModal, setModal, notify, update, confirm, showDialog } = useShellModalActions();

    return {
        ui,
        lang,
        modal,
        ai,
        ...tree,
        arcadeActions,
        gamification: getGamificationAction(),
        hasNetworkSocialConsent: identityActions.hasNetworkSocialConsent,
        storage: getArcadeStorageAction(),
        userStore: getUserStoreAction(),
        confirm,
        showDialog,
        dismissModal,
        setModal,
        notify,
        update,
    };
}

export function useArcadeStore() {
    return arcadeActions;
}
