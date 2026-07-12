import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSources } from './useSources.js';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { linkPanelDom, unlinkPanelDom } from '../../../app/panel-refs.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { useSourcesState } from '../modals/hooks/useSourcesState.jsx';
import { useSourcesActions } from '../modals/hooks/useSourcesActions.jsx';
import { useSourcesLifecycle } from '../modals/hooks/useSourcesLifecycle.jsx';
import { dispatchSourcesAction } from '../api/modals/logic/dispatch-sources-action.js';

/** Sources / biblioteca modal, wiring hook (jr entry for ModalSources). */
export function useSourcesModal(embed = false) {
    const sourcesApp = useSources();
    const { ui, modal } = sourcesApp;
    const state = sourcesApp;

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
    });

    useEffect(() => {
        if (!embed || !rootRef.current) return undefined;
        linkPanelDom(rootRef.current, sources.panelApi);
        return () => unlinkPanelDom(rootRef.current);
    }, [embed, sources.panelApi]);

    const mainTab = String(sources.mainTab || 'branches');

    const mainTabs = useMemo(
        () => [
            {
                id: 'branches',
                label: ui.sourcesTabBranches || 'Branches',
                tourTarget: 'sources-tab-branches',
            },
            { id: 'trees', label: ui.sourcesTabTrees || ui.sourcesTabForest || 'Trees', tourTarget: 'sources-tab-trees' },
        ],
        [ui.sourcesTabBranches, ui.sourcesTabTrees, ui.sourcesTabForest]
    );

    const tabSubtitle = useMemo(() => {
        if (mainTab === 'trees') {
            return (
                ui.sourcesTabTreesSubtitle ||
                'Playlists that combine branches, create, remix, publish and share.'
            );
        }
        return (
            ui.sourcesTabBranchesSubtitle ||
            'Full branches, plant, import, install from the network and study.'
        );
    }, [mainTab, ui.sourcesTabTreesSubtitle, ui.sourcesTabBranchesSubtitle]);

    const switchMainTab = useCallback(
        (tab) => {
            sources.setMainTab(tab);
            sources.setActiveTab(tab === 'trees' ? 'trees' : 'branch');
            sources.bump();
        },
        [sources]
    );

    const close = useCallback(() => sources.close(), [sources]);

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
        tabSubtitle,
        switchMainTab,
        close,
        modal,
        fromOnboarding,
        showGuestSyncHint:
            modal &&
            typeof modal === 'object' &&
            modal.fromOnboarding &&
            modal.fromOnboarding.showGuestSyncHint,
    };
}
