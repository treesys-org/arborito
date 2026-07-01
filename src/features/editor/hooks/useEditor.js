import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
    useHookUi,
    useShellModalActions,
    useShellModalLang,
    useTreeLessonContext,
} from '../../../app/hooks/useHookShell.js';
import { useTreeGraphSlice, treeGraphActions } from '../../../stores/tree-graph-store.js';
import { useShellUiSlice } from '../../../stores/shell-ui-store.js';
import { publishingActions } from '../../../stores/publishing-store-actions.js';
import { editorActions } from '../../../stores/editor-store-actions.js';
import { getUserStoreAction } from '../../../stores/identity-store-actions.js';

/** Editor / modo construcción. */
export function useEditor() {
    const ui = useHookUi();
    const { modal, lang } = useShellModalLang();
    const { dismissModal, setModal, notify, update, setViewMode, confirm, alert } = useShellModalActions();
    const treeCtx = useTreeLessonContext();
    const { publishingTree } = useShellUiSlice((s) => s.publishingTree);
    const {
        constructionMode,
        constructionEditFocus,
        constructionLockedBranchRefId,
        curriculumEditLang,
        rawGraphData,
    } = useTreeGraphSlice(
        useShallow((s) => ({
            constructionMode: s.constructionMode,
            constructionEditFocus: s.constructionEditFocus,
            constructionLockedBranchRefId: s.constructionLockedBranchRefId,
            curriculumEditLang: s.curriculumEditLang,
            rawGraphData: s.rawGraphData,
        }))
    );

    const toggleConstructionMode = useCallback(() => treeGraphActions.toggleConstructionMode(), []);
    const findNode = useCallback((id) => treeGraphActions.findNode(id), []);
    const publishTreePublicInteractive = useCallback(
        () => publishingActions.publishTreePublicInteractive(),
        []
    );
    const revokePublicTreeInteractive = useCallback(
        (opts) => publishingActions.revokePublicTreeInteractive(opts),
        []
    );
    const revokeActivePublicTreeInteractive = useCallback(
        () => publishingActions.revokeActivePublicTreeInteractive(),
        []
    );
    const offerLocalCopyFromNetworkTreeForEditing = useCallback(
        (opts) => publishingActions.offerLocalCopyFromNetworkTreeForEditing(opts),
        []
    );

    return {
        ui,
        modal,
        lang,
        ...treeCtx,
        constructionMode,
        constructionEditFocus,
        constructionLockedBranchRefId,
        curriculumEditLang,
        rawGraphData,
        publishingTree,
        editorActions,
        toggleConstructionMode,
        confirm,
        alert,
        findNode,
        publishTreePublicInteractive,
        revokePublicTreeInteractive,
        revokeActivePublicTreeInteractive,
        offerLocalCopyFromNetworkTreeForEditing,
        dismissModal,
        setModal,
        notify,
        update,
        setViewMode,
        userStore: getUserStoreAction(),
    };
}

export function useEditorStore() {
    return editorActions;
}
