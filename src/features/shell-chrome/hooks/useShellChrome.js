import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHookUi, useShellModalActions } from '../../../app/hooks/useHookShell.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { useShellUiSlice, shellUiActions } from '../../../stores/shell-ui-store.js';
import { useLearningSlice } from '../../../stores/learning-store.js';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { isTreeForumEnabled } from '../../../shared/lib/tree-forum-enabled.js';
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
    const shell = useShellUiSlice(
        useShallow((s) => ({
            theme: s.theme,
            lang: s.lang,
            viewMode: s.viewMode,
            modal: s.modal,
            cloudSyncBanner: s.cloudSyncBanner,
            certificatesFromMobileMore: s.certificatesFromMobileMore,
            publishingTree: s.publishingTree,
            loading: s.loading,
            error: s.error,
            creatorModerationAlerts: s.creatorModerationAlerts,
            creatorModerationUnreadCount: s.creatorModerationUnreadCount,
        }))
    );
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
        creatorModerationAlerts,
        creatorModerationUnreadCount,
    } = shell;
    const selectedNode = useLearningSlice((s) => s.selectedNode);
    const previewNode = useLearningSlice((s) => s.previewNode);
    const { data, constructionMode, treeHydrating, rawGraphData } = useTreeGraphSlice(
        useShallow((s) => ({
            data: s.data,
            constructionMode: s.constructionMode,
            treeHydrating: s.treeHydrating,
            rawGraphData: s.rawGraphData,
        }))
    );
    const activeSource = useSourcesSlice((s) => s.activeSource);
    const forumNavEnabled = isTreeForumEnabled(rawGraphData?.meta, activeSource);
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
    const openCreatorModerationAlertsModal = useCallback(
        () => store.openCreatorModerationAlertsModal?.(),
        []
    );
    const markCreatorModerationAlertsRead = useCallback(
        () => store.markCreatorModerationAlertsRead?.(),
        []
    );

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
        creatorModerationAlerts,
        creatorModerationUnreadCount,
        selectedNode,
        previewNode,
        data,
        constructionMode,
        treeHydrating,
        rawGraphData,
        activeSource,
        forumNavEnabled,
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
        openCreatorModerationAlertsModal,
        markCreatorModerationAlertsRead,
    };
}

/** Singleton, solo en hooks internos del feature, no en `.jsx` de components. */
export function useShellChromeStore() {
    return store;
}
