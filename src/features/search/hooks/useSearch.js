import { useCallback } from 'react';
import { useHookUi, useShellModalActions, useShellModalLang } from '../../../app/hooks/useHookShell.js';
import { useSearchSlice, searchActions } from '../../../stores/search-store.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { getUserStoreAction } from '../../../stores/identity-store-actions.js';
import { shellUiActions } from '../../../stores/shell-ui-store-actions.js';
import { learningActions } from '../../../stores/learning-store.js';
import { gardenProgressActions } from '../../../stores/garden-progress-store-actions.js';

/** Search feature — único punto de entrada para componentes de búsqueda. */
export function useSearch() {
    const ui = useHookUi();
    const { lang } = useShellModalLang();
    const { dismissModal, setModal } = useShellModalActions();
    const searchSlice = useSearchSlice((s) => s);
    const activeSource = useSourcesSlice((s) => s.activeSource);
    const bookmarks = getUserStoreAction()?.state?.bookmarks ?? {};
    const { searchIndexStatus, searchIndexError, searchCache } = searchSlice;

    const search = useCallback((query) => searchActions.search(query), []);
    const searchBroad = useCallback((char) => searchActions.searchBroad(char), []);
    const findNode = useCallback((id) => searchActions.findNode(id), []);
    const navigateTo = useCallback((id, payload) => searchActions.navigateTo(id, payload), []);
    const confirm = useCallback((...args) => shellUiActions.confirm(...args), []);
    const removeBookmark = useCallback((id) => learningActions.removeBookmark(id), []);

    const pickResult = useCallback(
        async (res) => {
            const nodeId = res?.id != null ? String(res.id) : '';
            if (!nodeId) return;
            const node = findNode(nodeId);
            const payload = node
                ? { ...res, ...node, path: node.path || node.p || res.path || res.p }
                : { ...res, id: nodeId, path: res.path || res.p };
            dismissModal();
            await navigateTo(nodeId, payload);
        },
        [dismissModal, findNode, navigateTo]
    );

    const storeSnapshot = { searchIndexStatus, searchIndexError };

    return {
        ui,
        lang,
        searchIndexStatus,
        searchIndexError,
        bookmarks,
        activeSource,
        searchCache,
        search,
        searchBroad,
        findNode,
        navigateTo,
        pickResult,
        confirm,
        removeBookmark,
        getManualBookmarks: gardenProgressActions.getManualBookmarks,
        getRecentLessons: gardenProgressActions.getRecentLessons,
        isCompleted: gardenProgressActions.isCompleted,
        dismissModal,
        setModal,
        storeSnapshot,
    };
}
