import { useCallback, useEffect, useMemo, useRef, startTransition } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSources } from './useSources.js';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { linkPanelDom, unlinkPanelDom } from '../../../app/panel-refs.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { useSourcesState } from '../modals/hooks/useSourcesState.jsx';
import { useSourcesActions } from '../modals/hooks/useSourcesActions.jsx';
import { useSourcesLifecycle } from '../modals/hooks/useSourcesLifecycle.jsx';
import { dispatchSourcesAction } from '../api/modals/logic/dispatch-sources-action.js';
import {
    normalizeSourcesMainTab,
    sourcesScopeForMainTab,
} from '../api/modals/logic/sources-main-tab.js';

/** Sources / biblioteca modal, wiring hook (jr entry for ModalSources). */
export function useSourcesModal(embed = false) {
    const sourcesApp = useSources();
    const { ui, modal, activeSource, communitySources, availableReleases, pendingUntrustedSource } =
        sourcesApp;
    const treeMount = useTreeGraphSlice(
        useShallow((s) => ({
            data: s.data,
            rawGraphData: s.rawGraphData,
            treeHydrating: s.treeHydrating,
        }))
    );
    const state = useMemo(
        () => ({
            activeSource,
            communitySources,
            availableReleases,
            pendingUntrustedSource,
            ...treeMount,
        }),
        [activeSource, communitySources, availableReleases, pendingUntrustedSource, treeMount]
    );

    const mobile = embed ? true : shouldShowMobileUI();
    const rootRef = useRef(null);

    const sources = useSourcesState({ embed });
    useSourcesActions(sources.actionCtxRef);

    const onAction = useCallback(
        (action, fields) => dispatchSourcesAction(action, fields),
        []
    );

    useRegisterPanel('modal-sources', () => sources.panelApi);

    useSourcesLifecycle({
        embed,
        bump: sources.bump,
        setMainTab: sources.setMainTab,
        setActiveTab: sources.setActiveTab,
        setOverlay: sources.setOverlay,
        setTreeEditor: sources.setTreeEditor,
        setSourcesScope: sources.setSourcesScope,
        setTreesScope: sources.setTreesScope,
        setSourcesQ: sources.setSourcesQ,
    });

    useEffect(() => {
        if (!embed || !rootRef.current) return undefined;
        linkPanelDom(rootRef.current, sources.panelApi);
        return () => unlinkPanelDom(rootRef.current);
    }, [embed, sources.panelApi]);

    const mainTab = normalizeSourcesMainTab(sources.mainTab);

    const mainTabs = useMemo(
        () => [
            {
                id: 'mine',
                label: ui.sourcesTabMine || ui.sourcesUnifiedScopeMine || 'My courses',
                tourTarget: 'sources-tab-branches',
            },
            {
                id: 'explore',
                label: ui.sourcesTabExplore || ui.sourcesUnifiedScopeExplore || 'Explore',
                tourTarget: 'sources-tab-explore',
            },
        ],
        [ui.sourcesTabMine, ui.sourcesUnifiedScopeMine, ui.sourcesTabExplore, ui.sourcesUnifiedScopeExplore]
    );

    const { setMainTab, setActiveTab, setSourcesScope, setTreesScope } = sources;
    const switchMainTab = useCallback(
        (tab) => {
            const next = normalizeSourcesMainTab(tab);
            /* Tab chrome updates urgently; list scope is transitioned so the click paints now. */
            setMainTab(next);
            setActiveTab(next === 'trees' ? 'trees' : 'branch');
            startTransition(() => {
                if (next === 'trees') {
                    setTreesScope?.('device');
                } else {
                    setSourcesScope(sourcesScopeForMainTab(next));
                }
            });
        },
        [setMainTab, setActiveTab, setSourcesScope, setTreesScope]
    );

    const close = useCallback(() => sources.close(), [sources]);
    const closeBlocked = !!(
        state.treeHydrating &&
        !state.data &&
        !state.rawGraphData
    );

    const fromOnboarding =
        modal && typeof modal === 'object' && !!modal.fromOnboarding;

    return {
        ui,
        modal,
        state,
        sourcesApp,
        sources,
        mobile,
        rootRef,
        embed,
        onAction,
        mainTab,
        mainTabs,
        switchMainTab,
        close,
        closeBlocked,
        modal,
        fromOnboarding,
    };
}
