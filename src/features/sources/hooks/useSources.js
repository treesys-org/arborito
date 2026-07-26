import { useCallback } from 'react';
import { useHookUi, useShellModalActions, useShellModalLang } from '../../../app/hooks/useHookShell.js';
import { useSourcesSlice, sourcesActions } from '../../../stores/sources-store.js';
import { getUserStoreAction } from '../../../stores/identity-store-actions.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import {
    collectBranchExportOptions,
    collectComposedTreeExportOptions,
    collectNetworkSourceExportOptions,
} from '../../backup-export/api/export-curriculum-archive.js';

/** Fuentes / biblioteca de árboles. */
export function useSources() {
    const ui = useHookUi();
    const { modal, lang } = useShellModalLang();
    const { dismissModal, setModal, notify, update, confirm, alert } = useShellModalActions();
    const { communitySources, activeSource, availableReleases, pendingUntrustedSource } =
        useSourcesSlice((s) => s);

    const loadData = useCallback((s) => sourcesActions.loadData(s), []);
    const findNode = useCallback((id) => sourcesActions.findNode(id), []);
    const navigateTo = useCallback((id, data) => sourcesActions.navigateTo(id, data), []);
    const getNetworkUserPair = useCallback(() => sourcesActions.getNetworkUserPair(), []);
    const getNostrPublisherPair = useCallback((pub) => sourcesActions.getNostrPublisherPair(pub), []);
    const cancelUntrustedLoad = useCallback(() => sourcesActions.cancelUntrustedLoad(), []);
    const proceedWithUntrustedLoad = useCallback(() => sourcesActions.proceedWithUntrustedLoad(), []);
    const applyCurriculumPresetLanguage = useCallback(
        (code) => sourcesActions.applyCurriculumPresetLanguage(code),
        []
    );
    const addCommunitySource = useCallback(
        (url, opts) => sourcesActions.addCommunitySource(url, opts),
        []
    );
    const removeCommunitySource = useCallback(
        (id) => sourcesActions.removeCommunitySource(id),
        []
    );
    const notifyCommunityAddResult = useCallback((res) => sourcesActions.notifyCommunityAddResult(res), []);
    const maybeAutoLoadCommunityAfterAdd = useCallback(
        (res) => sourcesActions.maybeAutoLoadCommunityAfterAdd(res),
        []
    );
    const getExportCurriculumOptions = useCallback((target) => {
        if (!target?.id) return null;
        if (target.kind === 'tree') return collectComposedTreeExportOptions(store, target.id);
        if (target.kind === 'network') return collectNetworkSourceExportOptions(store, target.id);
        return collectBranchExportOptions(store, target.id);
    }, []);

    return {
        ui,
        modal,
        lang,
        /* Compat: some callers historically read `.state.lang` (store shape). */
        state: { lang },
        userStore: getUserStoreAction(),
        communitySources,
        activeSource,
        availableReleases,
        pendingUntrustedSource,
        confirm,
        alert,
        loadData,
        findNode,
        navigateTo,
        getNetworkUserPair,
        getNostrPublisherPair,
        cancelUntrustedLoad,
        proceedWithUntrustedLoad,
        applyCurriculumPresetLanguage,
        addCommunitySource,
        removeCommunitySource,
        notifyCommunityAddResult,
        maybeAutoLoadCommunityAfterAdd,
        getExportCurriculumOptions,
        dismissModal,
        setModal,
        notify,
        update,
    };
}

/** Para hooks internos que necesitan el singleton (evitar en .jsx de components). */
export function useSourcesStore() {
    return store;
}
