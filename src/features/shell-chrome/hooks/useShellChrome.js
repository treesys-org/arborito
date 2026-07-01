import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHookUi, useShellModalActions } from '../../../app/hooks/useHookShell.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { useShellUiSlice, shellUiActions } from '../../../stores/shell-ui-store.js';
import { useLearningSlice } from '../../../stores/learning-store.js';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { useSearchSlice } from '../../../stores/search-store.js';
import { searchActions } from '../../../stores/search-store.js';
import { treeGraphActions } from '../../../stores/tree-graph-store.js';
import {
    getAvailableLanguagesAction,
    getUserStoreAction,
} from '../../../stores/identity-store-actions.js';

/**
 * Sidebar, modales shell, idioma, about.
 * Único punto de entrada para .jsx de shell-chrome (no importar core/store.js).
 */
export function useShellChrome() {
    const ui = useHookUi();
    const { dismissModal, setModal, notify, setViewMode, setLang, setTheme } = useShellModalActions();
    const shell = useShellUiSlice((s) => s);
    const {
        theme,
        lang,
        viewMode,
        modal,
        cloudSyncBanner,
        certificatesFromMobileMore,
        publishingTree,
        loading,
        error,
    } = shell;
    const selectedNode = useLearningSlice((s) => s.selectedNode);
    const previewNode = useLearningSlice((s) => s.previewNode);
    const { data, constructionMode, treeHydrating } = useTreeGraphSlice(
        useShallow((s) => ({
            data: s.data,
            constructionMode: s.constructionMode,
            treeHydrating: s.treeHydrating,
        }))
    );
    const activeSource = useSourcesSlice((s) => s.activeSource);
    const { searchIndexStatus, searchIndexError } = useSearchSlice(
        useShallow((s) => ({
            searchIndexStatus: s.searchIndexStatus,
            searchIndexError: s.searchIndexError,
        }))
    );

    const openSageModal = useCallback((payload) => shellUiActions.openSageModal(payload), []);
    const requestGoHome = useCallback(() => shellUiActions.requestGoHome(), []);
    const goHome = useCallback(() => shellUiActions.goHome(), []);
    const setLanguage = useCallback((code) => shellUiActions.setLanguage(code), []);
    const toggleTheme = useCallback(() => shellUiActions.toggleTheme(), []);
    const toggleConstructionMode = useCallback(() => store.toggleConstructionMode(), []);
    const getModulesStatus = useCallback(() => store.getModulesStatus(), []);
    const getProgressScope = useCallback(() => store.getProgressScope?.(), []);
    const getNetworkUserPair = useCallback(() => store.getNetworkUserPair?.(), []);
    const getActivePublicTreeRef = useCallback(() => store.getActivePublicTreeRef?.(), []);
    const search = useCallback((q) => searchActions.search(q), []);
    const searchBroad = useCallback((q) => searchActions.searchBroad(q), []);
    const findNode = useCallback((id) => treeGraphActions.findNode(id), []);
    const navigateTo = useCallback((id, data) => treeGraphActions.navigateTo(id, data), []);
    const enableCloudSyncFromBanner = useCallback(() => shellUiActions.enableCloudSyncFromBanner(), []);
    const dismissCloudSyncBanner = useCallback(() => shellUiActions.dismissCloudSyncBanner(), []);

    const userStore = getUserStoreAction();
    const availableLanguages = getAvailableLanguagesAction() ?? store.availableLanguages;
    const currentLangInfo = store.currentLangInfo;

    return {
        ui,
        userStore,
        gamification: userStore?.state?.gamification,
        theme,
        lang,
        viewMode,
        modal,
        cloudSyncBanner,
        certificatesFromMobileMore,
        publishingTree,
        loading,
        error,
        selectedNode,
        previewNode,
        data,
        constructionMode,
        treeHydrating,
        activeSource,
        searchIndexStatus,
        searchIndexError,
        openSageModal,
        requestGoHome,
        goHome,
        setModal,
        dismissModal,
        setViewMode,
        setLang,
        setLanguage,
        setTheme,
        toggleTheme,
        toggleConstructionMode,
        notify,
        availableLanguages,
        currentLangInfo,
        getModulesStatus,
        getProgressScope,
        getNetworkUserPair,
        getActivePublicTreeRef,
        search,
        searchBroad,
        findNode,
        navigateTo,
        enableCloudSyncFromBanner,
        dismissCloudSyncBanner,
    };
}

/** Singleton — solo en hooks internos del feature, no en `.jsx` de components. */
export function useShellChromeStore() {
    return store;
}
