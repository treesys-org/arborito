import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from './useEditor.js';
import { getMobilePath } from '../../tree-graph/api/graph-ui-accessors.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { resolveConstructionEditScope } from '../api/construction-edit-scope.js';
import { syncConstructionAboutFromFocus } from '../api/construction-enter-flow.js';
import { getActivePublishContext } from '../api/construction-scope-publish.js';
import { ensureDeferredConstructionStyles } from '../../../shared/lib/lazy-stylesheet.js';

function notifyScopeChromeRefresh() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arborito-construction-scope-changed'));
    }
}

/**
 * Construction dock + scope chrome — use in `ConstructionPanel.jsx` only.
 * Jr rule: modals/toolbars call `useEditor()` or `useConstructionAbout()`; not this hook.
 */
export function useConstructionPanel() {
    const editor = useEditor();
    const {
        ui,
        dismissModal,
        setModal,
        notify,
        setViewMode,
        findNode,
        publishTreePublicInteractive,
        revokePublicTreeInteractive,
        revokeActivePublicTreeInteractive,
        offerLocalCopyFromNetworkTreeForEditing,
        toggleConstructionMode,
        userStore,
        constructionMode,
        activeSource,
        rawGraphData,
        data,
        modal,
        curriculumEditLang,
        lang,
        selectedNode,
        previewNode,
        editorActions,
    } = editor;

    const {
        canRetractActivePublicUniverse,
        getNostrPublisherPair,
        getMyTreeNetworkRole,
        openSageModal,
        openConstructionCurriculumLangModal,
        subscribeConstructionUndo,
    } = editorActions;

    const [, bumpRender] = useState(0);
    const refresh = useCallback(() => bumpRender((n) => n + 1), []);

    const [moreToolsOpen, setMoreToolsOpen] = useState(false);
    const [conMoreInstantReveal, setConMoreInstantReveal] = useState(false);
    const [publishingPublic, setPublishingPublic] = useState(false);
    const [revokingPublic, setRevokingPublic] = useState(false);

    const isDesktopForest =
        typeof document !== 'undefined' && document.documentElement.classList.contains('arborito-desktop');
    const prefersExpandedConstructionDock = isDesktopForest;
    const useCompactDock = shouldShowMobileUI() && !prefersExpandedConstructionDock;

    const panelApiRef = useRef({
        syncConstructionFromStore() {
            refresh();
        },
        openConstructionMoreMenu(opts = {}) {
            setMoreToolsOpen(true);
            setConMoreInstantReveal(!!opts.instant);
            refresh();
        },
    });

    const handleScopePublishClickRef = useRef(() => {});

    useEffect(() => {
        const repaintIfActive = () => {
            if (constructionMode) refresh();
        };
        const onScopePublish = () => void handleScopePublishClickRef.current();

        const unsubUndo = subscribeConstructionUndo(repaintIfActive);
        window.addEventListener('arborito-viewport', repaintIfActive);
        window.addEventListener('arborito-construction-map-changed', repaintIfActive);
        window.addEventListener('arborito-construction-scope-publish', onScopePublish);

        return () => {
            unsubUndo();
            window.removeEventListener('arborito-viewport', repaintIfActive);
            window.removeEventListener('arborito-construction-map-changed', repaintIfActive);
            window.removeEventListener('arborito-construction-scope-publish', onScopePublish);
        };
    }, [constructionMode, refresh, subscribeConstructionUndo]);

    useEffect(() => {
        if (!conMoreInstantReveal) return undefined;
        const id = requestAnimationFrame(() => setConMoreInstantReveal(false));
        return () => cancelAnimationFrame(id);
    }, [conMoreInstantReveal, moreToolsOpen]);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        document.documentElement.classList.toggle('arborito-construction-more-open', useCompactDock && moreToolsOpen);
        return () => document.documentElement.classList.remove('arborito-construction-more-open');
    }, [moreToolsOpen, useCompactDock]);

    useEffect(() => {
        if (!useCompactDock) setMoreToolsOpen(false);
    }, [useCompactDock]);

    useEffect(() => {
        ensureDeferredConstructionStyles();
    }, []);

    useEffect(() => {
        if (!constructionMode) return undefined;
        ensureDeferredConstructionStyles();
        return undefined;
    }, [constructionMode]);

    useEffect(() => {
        if (constructionMode) return undefined;
        if (typeof document === 'undefined') return undefined;
        document.documentElement.classList.remove('arborito-construction-more-open');
        delete document.documentElement.dataset.arboritoConstructionAbout;
        return undefined;
    }, [constructionMode]);

    useEffect(() => {
        return () => {
            if (typeof document === 'undefined') return;
            document.documentElement.classList.remove('arborito-construction-more-open');
            delete document.documentElement.dataset.arboritoConstructionAbout;
        };
    }, []);

    const handleMakeTreePublic = useCallback(async () => {
        if (publishingPublic) return;
        setPublishingPublic(true);
        notifyScopeChromeRefresh();
        try {
            await publishTreePublicInteractive();
        } finally {
            setPublishingPublic(false);
            notifyScopeChromeRefresh();
        }
    }, [publishingPublic, publishTreePublicInteractive]);

    const handleRetractPublicTree = useCallback(async () => {
        if (revokingPublic) return;
        setRevokingPublic(true);
        notifyScopeChromeRefresh();
        try {
            const srcUrl = String((activeSource && activeSource.url) || '');
            let localId = null;
            let publicTreeUrl = null;
            if (srcUrl.startsWith('branch://')) {
                localId = srcUrl.slice('branch://'.length);
                publicTreeUrl =
                    (userStore?.getBranchPublishedNetworkUrl?.(localId)) || null;
            }
            if (typeof revokePublicTreeInteractive === 'function') {
                await revokePublicTreeInteractive({ publicTreeUrl, branchIdToUnlink: localId });
            } else {
                await revokeActivePublicTreeInteractive();
            }
        } finally {
            setRevokingPublic(false);
            notifyScopeChromeRefresh();
        }
    }, [
        revokingPublic,
        activeSource,
        userStore,
        revokePublicTreeInteractive,
        revokeActivePublicTreeInteractive,
    ]);

    const handleScopePublishClick = useCallback(async () => {
        const srcUrl = String((activeSource && activeSource.url) || '');
        const activeTreeRef = parseNostrTreeUrl(srcUrl);
        const ctx = getActivePublishContext(activeSource);
        const localId = ctx.localId || (srcUrl.startsWith('branch://') ? srcUrl.slice('branch://'.length) : null);
        const publishedUrl =
            ctx.publishedNetworkUrl ||
            (localId ? userStore?.getBranchPublishedNetworkUrl?.(localId) || null : null);
        const publishedTreeRef = publishedUrl ? parseNostrTreeUrl(publishedUrl) : null;

        const actsAsUnpublish =
            (typeof canRetractActivePublicUniverse === 'function' &&
                canRetractActivePublicUniverse() &&
                !!activeTreeRef &&
                !!getNostrPublisherPair(activeTreeRef.pub)?.priv) ||
            (!!publishedTreeRef && !!getNostrPublisherPair(publishedTreeRef.pub)?.priv) ||
            (ctx.isComposed && ctx.isPublishedOwner && ctx.hasPublishedBaseline);

        if (actsAsUnpublish) return handleRetractPublicTree();
        if (ctx.isComposed || (srcUrl.startsWith('branch://') && localId)) {
            setModal({
                type: 'construction-about',
                fromConstruction: true,
                publishIntent: true,
                branchId: localId || '',
            });
            return;
        }
        return handleMakeTreePublic();
    }, [
        activeSource,
        canRetractActivePublicUniverse,
        getNostrPublisherPair,
        handleMakeTreePublic,
        handleRetractPublicTree,
        setModal,
        userStore,
    ]);

    handleScopePublishClickRef.current = handleScopePublishClick;

    const scope = useMemo(() => {
        const isLocalBranch = fileSystem.isLocalBranch();
        const isLocalComposed = fileSystem.isLocalComposedTree();
        const isLocalEditable = fileSystem.isLocal;
        const publishCtx = getActivePublishContext(activeSource);
        const nostrTreeRef = activeSource?.url ? parseNostrTreeUrl(activeSource.url) : null;
        const isPublicTree = !!nostrTreeRef;
        const publishedNetworkUrlForLocal =
            publishCtx.publishedNetworkUrl ||
            (isLocalEditable &&
            activeSource?.url &&
            String(activeSource.url).startsWith('branch://')
                ? userStore?.getBranchPublishedNetworkUrl?.(
                      String(activeSource.url).slice('branch://'.length)
                  ) || null
                : null);
        const publishedNetworkParsed = publishedNetworkUrlForLocal
            ? parseNostrTreeUrl(publishedNetworkUrlForLocal)
            : null;
        const networkRole = typeof getMyTreeNetworkRole === 'function' ? getMyTreeNetworkRole() : null;
        const isNetworkTreeOwner = !!(
            nostrTreeRef && getNostrPublisherPair(nostrTreeRef.pub)?.priv
        );
        const isPublishedLocalTreeOwner = !!(
            publishedNetworkParsed && getNostrPublisherPair(publishedNetworkParsed.pub)?.priv
        );
        const isContributor =
            isLocalEditable ||
            (isPublicTree &&
                (networkRole === 'owner' || networkRole === 'editor' || networkRole === 'proposer'));
        const hasTree = !!rawGraphData;
        const mobilePath = getMobilePath();
        const tailId = mobilePath.length ? mobilePath[mobilePath.length - 1] : null;
        const current = tailId && data ? findNode(tailId) : null;
        const editScope = resolveConstructionEditScope(ui, {
            current,
            mobilePath,
            rootData: rawGraphData,
            isContributor,
            isNetworkTreeOwner,
            isLocalBranch,
            isLocalComposed,
        });
        const langKeys =
            hasTree && rawGraphData?.languages ? Object.keys(rawGraphData.languages).sort() : [];
        const canRetractPublicTree =
            (typeof canRetractActivePublicUniverse === 'function' && canRetractActivePublicUniverse()) ||
            isPublishedLocalTreeOwner;

        return {
            editScope,
            isContributor,
            hasTree,
            langKeys,
            canRetractPublicTree,
            canShowPublish: !!hasTree,
            canWriteMapEdit: editScope.dock.canWriteMap,
            showGovernanceTab: editScope.dock.showGovernance,
            canForkForEdit: editScope.dock.showFork && hasTree,
            constructionLangModalOpen: modal?.type === 'construction-curriculum-lang',
        };
    }, [
        activeSource,
        canRetractActivePublicUniverse,
        data,
        findNode,
        getMyTreeNetworkRole,
        getNostrPublisherPair,
        modal?.type,
        rawGraphData,
        ui,
        userStore,
    ]);

    useEffect(() => {
        if (constructionMode) syncConstructionAboutFromFocus();
    }, [constructionMode, scope.editScope, activeSource, rawGraphData]);

    const closeMore = useCallback(() => setMoreToolsOpen(false), []);

    const dockExitlessDesktop = isDesktopForest && !useCompactDock;
    const effectiveMoreToolsOpen = useCompactDock ? moreToolsOpen : false;
    const showCurriculumTools = scope.canWriteMapEdit && scope.hasTree && scope.langKeys.length > 0;

    return {
        ui,
        editor,
        constructionMode,
        modal,
        curriculumEditLang: curriculumEditLang || '',
        appLang: lang || '',
        panelApiRef,
        useCompactDock,
        moreToolsOpen: effectiveMoreToolsOpen,
        conMoreInstantReveal,
        dockExitlessDesktop,
        showCurriculumTools,
        publishingPublic,
        revokingPublic,
        scope,
        dismissModal,
        setModal,
        notify,
        setViewMode,
        toggleConstructionMode,
        offerLocalCopyFromNetworkTreeForEditing,
        openSageModal,
        openConstructionCurriculumLangModal,
        selectedNode,
        previewNode,
        setMoreToolsOpen,
        closeMore,
        handleRetractPublicTree,
        handleScopePublishClick,
    };
}
