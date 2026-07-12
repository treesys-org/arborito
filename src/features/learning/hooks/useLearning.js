import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHookUi, useShellModalActions, useShellModalLang } from '../../../app/hooks/useHookShell.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { useLearningSlice, learningActions } from '../../../stores/learning-store.js';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { getUserStoreAction } from '../../../stores/identity-store-actions.js';
import { shellUiActions } from '../../../stores/shell-ui-store-actions.js';

/** Lecciones, contenido, quiz, Sage. */
export function useLearning() {
    const ui = useHookUi();
    const { modal } = useShellModalLang();
    const { dismissModal, setModal, notify, update } = useShellModalActions();
    const { selectedNode, previewNode, path, lessonOpenHint } = useLearningSlice(
        useShallow((s) => ({
            selectedNode: s.selectedNode,
            previewNode: s.previewNode,
            path: s.path,
            lessonOpenHint: s.lessonOpenHint,
        }))
    );
    const { data, rawGraphData, constructionMode } = useTreeGraphSlice(
        useShallow((s) => ({
            data: s.data,
            rawGraphData: s.rawGraphData,
            constructionMode: s.constructionMode,
        }))
    );
    const activeSource = useSourcesSlice((s) => s.activeSource);

    const findNode = useCallback((id) => learningActions.findNode(id), []);
    const navigateTo = useCallback((id, data) => learningActions.navigateTo(id, data), []);
    const loadNodeContent = useCallback((node) => learningActions.loadNodeContent(node), []);
    const openSageModal = useCallback((p) => learningActions.openSageModal(p), []);
    const enterLesson = useCallback(() => learningActions.enterLesson(), []);
    const closeContent = useCallback(() => learningActions.closeContent(), []);
    const initSage = useCallback(() => learningActions.initSage(), []);
    const chatWithSage = useCallback((t) => learningActions.chatWithSage(t), []);
    const clearSageChat = useCallback(() => learningActions.clearSageChat(), []);
    const abortSage = useCallback(() => learningActions.abortSage(), []);
    const getBookmark = useCallback((...a) => learningActions.getBookmark(...a), []);
    const saveBookmark = useCallback((...a) => learningActions.saveBookmark(...a), []);
    const removeBookmark = useCallback((id) => learningActions.removeBookmark(id), []);
    const markComplete = useCallback((...a) => learningActions.markComplete(...a), []);
    const isCompleted = useCallback((id) => learningActions.isCompleted(id), []);
    const alert = useCallback((...a) => shellUiActions.alert(...a), []);
    const acknowledge = useCallback((opts) => shellUiActions.acknowledge(opts), []);
    const confirm = useCallback((...a) => shellUiActions.confirm(...a), []);
    const nostrCreateChild = useCallback((...a) => learningActions.nostrCreateChild(...a), []);
    const requestGoHome = useCallback(() => learningActions.requestGoHome(), []);
    const toggleConstructionMode = useCallback(() => learningActions.toggleConstructionMode(), []);

    return {
        ui,
        modal,
        userStore: getUserStoreAction(),
        data,
        rawGraphData,
        constructionMode,
        activeSource,
        selectedNode,
        previewNode,
        path,
        lessonOpenHint,
        findNode,
        navigateTo,
        loadNodeContent,
        openSageModal,
        enterLesson,
        closeContent,
        initSage,
        chatWithSage,
        clearSageChat,
        abortSage,
        getBookmark,
        saveBookmark,
        removeBookmark,
        markComplete,
        isCompleted,
        alert,
        acknowledge,
        confirm,
        nostrCreateChild,
        requestGoHome,
        toggleConstructionMode,
        dismissModal,
        setModal,
        notify,
        update,
    };
}

/** Sage / streaming UI, subscribes to `ai` (avoid in lesson chrome). */
export function useLearningAi() {
    return useLearningSlice((s) => s.ai);
}

/** Para hooks internos que necesitan el singleton (evitar en .jsx de components). */
export function useLearningStore() {
    return store;
}
