import { useCallback } from 'react';
import {
    useHookUi,
    useShellModalActions,
    useShellModalLang,
    useTreeLessonContext,
} from '../../../app/hooks/useHookShell.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { forumActions } from '../../../stores/forum-store-actions.js';
import { nostrDomainActions } from '../../../stores/nostr-store-actions.js';

/** Foro Nostr por árbol, única puerta al store para componentes `.jsx`. */
export function useForum() {
    const ui = useHookUi();
    const { modal, lang, viewMode } = useShellModalLang();
    const shell = useShellModalActions();
    const tree = useTreeLessonContext();

    const getNetworkUserPair = useCallback(() => nostrDomainActions.getNetworkUserPair(), []);
    const forumStore = forumActions.getForumStore();

    return {
        ui,
        modal,
        lang,
        viewMode,
        ...tree,
        ...shell,
        forumStore,
        forumActions,
        getNetworkUserPair,
    };
}

export function useForumStore() {
    return getArboritoStore();
}
