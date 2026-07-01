import { useCallback } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { reactStateStore } from '../../stores/react-state.js';
import { useShellUiSlice } from '../../stores/shell-ui-store.js';
import { useTreeGraphSlice } from '../../stores/tree-graph-store.js';
import { useLearningSlice } from '../../stores/learning-store.js';
import { useSourcesSlice } from '../../stores/sources-store.js';
import { shellUiActions } from '../../stores/shell-ui-store-actions.js';
import { getArboritoStore } from '../../core/store-singleton.js';

/** i18n strings for domain hooks (avoid spreading full `useApp()`). */
export function useHookUi() {
    return useStore(reactStateStore, (s) => s.ui);
}

/** Shell modal + language fields commonly needed by feature modals. */
export function useShellModalLang() {
    return useShellUiSlice(
        useShallow((s) => ({
            modal: s.modal,
            lang: s.lang,
            viewMode: s.viewMode,
        }))
    );
}

/** Shell actions shared across domain hooks. */
export function useShellModalActions() {
    const dismissModal = useCallback((opts) => shellUiActions.dismissModal(opts), []);
    const setModal = useCallback((modal) => shellUiActions.setModal(modal), []);
    const notify = useCallback((msg, isError) => shellUiActions.notify(msg, isError), []);
    const update = useCallback((patch) => getArboritoStore()?.update(patch), []);
    const setViewMode = useCallback((mode, opts) => shellUiActions.setViewMode(mode, opts), []);
    const setTheme = useCallback((theme) => shellUiActions.setTheme(theme), []);
    const setLang = useCallback((lang) => shellUiActions.setLang(lang), []);
    const confirm = useCallback((...args) => shellUiActions.confirm(...args), []);
    const alert = useCallback((...args) => shellUiActions.alert(...args), []);
    const showDialog = useCallback((...args) => shellUiActions.showDialog(...args), []);
    const isSignedIn = useCallback(() => shellUiActions.isSignedIn(), []);
    return {
        dismissModal,
        setModal,
        notify,
        update,
        setViewMode,
        setTheme,
        setLang,
        confirm,
        alert,
        showDialog,
        isSignedIn,
    };
}

/** Tree + lesson + source context for construction, forum, editor panels. */
export function useTreeLessonContext() {
    const {
        data,
        rawGraphData,
        constructionMode,
        constructionEditFocus,
        constructionLockedBranchRefId,
        curriculumEditLang,
    } = useTreeGraphSlice(
        useShallow((s) => ({
            data: s.data,
            rawGraphData: s.rawGraphData,
            constructionMode: s.constructionMode,
            constructionEditFocus: s.constructionEditFocus,
            constructionLockedBranchRefId: s.constructionLockedBranchRefId,
            curriculumEditLang: s.curriculumEditLang,
        }))
    );
    const { selectedNode, previewNode } = useLearningSlice(
        useShallow((s) => ({
            selectedNode: s.selectedNode,
            previewNode: s.previewNode,
        }))
    );
    const activeSource = useSourcesSlice((s) => s.activeSource);
    return {
        data,
        rawGraphData,
        constructionMode,
        constructionEditFocus,
        constructionLockedBranchRefId,
        curriculumEditLang,
        selectedNode,
        previewNode,
        activeSource,
    };
}
