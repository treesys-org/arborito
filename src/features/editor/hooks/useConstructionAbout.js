import { useCallback, useMemo, useRef } from 'react';
import { useEditor } from './useEditor.js';
import { resolvePresentationAboutKind } from '../api/construction-enter-flow.js';
import { constructionSheetTitle } from '../../tree-graph/api/tree-presentation-logic.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { isTreeForumEnabled } from '../../../shared/lib/tree-forum-enabled.js';
import { getActivePublishContext } from '../api/construction-scope-publish.js';

function resolveConstructionAboutSubtitle(ui, aboutKind, publishIntent) {
    if (publishIntent) {
        return (
            ui.publishHubSheetTagline ||
            (aboutKind === 'tree'
                ? ui.publicTreePublishComposedTooltip
                : ui.publicTreePublishBranchTooltip) ||
            ''
        );
    }
    return ui.constructionAboutSheetTagline || ui.constructionBranchMetaHubHint || '';
}

function resolveConstructionAboutTitle(ui, aboutKind, publishIntent) {
    if (!publishIntent) return constructionSheetTitle(ui, aboutKind);
    if (aboutKind === 'tree') {
        return ui.publicTreeTitle || ui.constructionScopeTreeInfoLabel || 'Publish tree';
    }
    return (
        ui.constructionBranchPublishTitle ||
        ui.publicTreePublishBranchTooltip ||
        ui.constructionScopeBranchInfoLabel ||
        'Publish branch'
    );
}

/** Construction about / publish hub modal, single hook for jr-friendly modals. */
export function useConstructionAbout() {
    const editor = useEditor();
    const {
        ui,
        dismissModal,
        notify,
        modal,
        activeSource,
        rawGraphData,
        userStore,
        publishTreePublicInteractive,
        editorActions,
        setModal,
    } = editor;

    const { validatePublicationMetadata } = editorActions;

    const formRef = useRef(null);
    const mobile = shouldShowMobileUI();
    const aboutKind = resolvePresentationAboutKind();
    const publishIntent = !!(
        modal &&
        typeof modal === 'object' &&
        (modal.publishIntent || modal.type === 'publish-diff' || modal.tab === 'publish')
    );
    const title = useMemo(
        () => resolveConstructionAboutTitle(ui, aboutKind, publishIntent),
        [ui, aboutKind, publishIntent]
    );
    const subtitle = useMemo(
        () => resolveConstructionAboutSubtitle(ui, aboutKind, publishIntent),
        [ui, aboutKind, publishIntent]
    );
    const fromConstructionMore = modal && typeof modal === 'object' && !!modal.fromConstructionMore;
    const instantOpen = fromConstructionMore && mobile;

    const close = useCallback(() => dismissModal(), [dismissModal]);
    const flushMetadata = useCallback(() => formRef.current?.flushMetadata?.(), []);

    const forumNavEnabled = isTreeForumEnabled(rawGraphData?.meta, activeSource);
    const publishCtx = getActivePublishContext(activeSource);
    const showForumModerationLink =
        forumNavEnabled &&
        rawGraphData?.meta?.forumEnabled === true &&
        !!publishCtx?.hasPublishedBaseline;

    const openForumModeration = useCallback(() => {
        dismissModal();
        setModal({ type: 'forum' });
    }, [dismissModal, setModal]);

    return {
        ui,
        modal,
        activeSource,
        rawGraphData,
        userStore,
        publishTreePublicInteractive,
        validatePublicationMetadata,
        notify,
        formRef,
        mobile,
        aboutKind,
        publishIntent,
        title,
        subtitle,
        instantOpen,
        close,
        flushMetadata,
        showForumModerationLink,
        openForumModeration,
    };
}