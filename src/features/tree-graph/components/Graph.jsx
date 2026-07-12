import { useTreeGraph } from '../hooks/useTreeGraph.js';
import { useRef, useEffect, useMemo } from 'react';
import { TreePathChrome } from './path/TreePathChrome.jsx';
import { useGraphPanel } from '../hooks/useGraphPanel.jsx';
import { useMobileTreeModel } from '../hooks/useMobileTreeModel.jsx';
import { useMobileTrunkScroll } from '../hooks/useMobileTrunkScroll.jsx';
import {
    MobileKnotsColumn,
    MobileRightColumn,
    MobileTreeOverlayBanner,
} from './mobile/MobileTreeContent.jsx';
import { GraphConstructionLayer } from './construction/GraphConstructionLayer.jsx';
import { CurriculumSwitcherModal } from './curriculum/CurriculumSwitcherModal.jsx';
import { GardenBackground } from '../../garden-progress/components/GardenBackground.jsx';
import { ensureDeferredConstructionStyles } from '../../../shared/lib/lazy-stylesheet.js';

function useGraphShellClasses(state, userStore) {
    return useMemo(() => {
        const hasData = !!state.data;
        const hydrating = !!state.treeHydrating;
        const growingOverlay = !!state.treeGrowingOverlay;
        const hasSource = !!state.activeSource;
        const isConstruct = !!state.constructionMode;

        const showLoadingContent = hydrating || growingOverlay;

        const treeUiVisible = !!(hasData || hydrating || hasSource);

        const src = state.activeSource;
        const id = String(src?.id || '');
        const url = String(src?.url || '');
        const frozen =
            !!id &&
            !url.startsWith('branch://') &&
            typeof userStore?.isTreeFrozen === 'function' &&
            userStore.isTreeFrozen(id);

        const containerClasses = [
            'graph-container',
            'transition-colors',
            'duration-500',
            treeUiVisible && hasData ? 'graph-container--mobile-tree-active' : '',
            showLoadingContent && !hasData ? 'graph-container--tree-content-hidden' : '',
            frozen ? 'arborito-tree-frozen' : '',
            isConstruct ? 'bg-blueprint' : 'bg-sky',
        ]
            .filter(Boolean)
            .join(' ');

        const mobileTreeClasses = [
            'mobile-tree-ui',
            'arborito-mobile-path',
            treeUiVisible ? 'visible' : '',
            isConstruct ? 'mobile-tree-ui--construction' : '',
        ]
            .filter(Boolean)
            .join(' ');

        return { containerClasses, mobileTreeClasses };
    }, [
        state.data,
        state.treeHydrating,
        state.treeGrowingOverlay,
        state.activeSource,
        state.constructionMode,
        userStore,
    ]);
}

/**
 * Graph panel, single React tree; model derived from graphUi.
 */
export function Graph({ embed }) {
    const tree = useTreeGraph();
    const { userStore } = tree;
    const state = tree;
    const rootRef = useRef(null);
    const graphContainerRef = useRef(null);
    const panelRef = useRef(null);
    const knotsRef = useRef(null);
    const scrollContentRef = useRef(null);
    const trunkBodyRef = useRef(null);
    const trunkColRef = useRef(null);
    const trunkContainerRef = useRef(null);

    const hostRefs = useMemo(
        () => ({
            scrollContent: scrollContentRef,
            trunkBody: trunkBodyRef,
            trunkCol: trunkColRef,
            knots: knotsRef,
            trunkContainer: trunkContainerRef,
        }),
        []
    );

    useGraphPanel(rootRef, {
        embed,
        graphContainerRef,
        hostRefs,
    });

    const { model, scroll } = useMobileTreeModel();

    useMobileTrunkScroll({ model, scroll, hostRefs });

    const { containerClasses, mobileTreeClasses } = useGraphShellClasses(state, userStore);

    useEffect(() => {
        if (state.constructionMode) ensureDeferredConstructionStyles();
    }, [state.constructionMode]);

    useEffect(() => {
        const rootId = state.data?.id;
        if (rootId == null) {
            if (
                !state.treeHydrating &&
                state.rawGraphData?.languages &&
                state.activeSource &&
                typeof tree.repairTreeViewFromRaw === 'function'
            ) {
                tree.repairTreeViewFromRaw();
            }
            return;
        }
        const path = state.graphUi?.mobilePath;
        if (!Array.isArray(path) || path.length === 0 || String(path[0]) !== String(rootId)) {
            tree.navigateMobilePath([String(rootId)]);
        }
    }, [state.data?.id, state.graphUi?.mobilePath?.join('>')]);

    return (
        <div
            ref={rootRef}
            data-arborito-panel="graph"
            data-arbor-tour="graph"
            data-embed={embed ? '1' : undefined}
            className="w-full h-full"
        >
            <div ref={graphContainerRef} id="graph-container" className={containerClasses}>
                <GardenBackground />

                <div id="mobile-tree-ui" className={mobileTreeClasses}>
                    <div
                        id="mobile-overlays"
                        className="absolute top-0 left-0 right-0 z-40 flex justify-center pointer-events-none"
                        style={{ paddingTop: 'max(0.35rem, env(safe-area-inset-top))' }}
                    >
                        <MobileTreeOverlayBanner />
                    </div>
                    <div className="mobile-trunk-fade" />
                    <div className="mobile-trunk-ground-strip" aria-hidden="true" />
                    <div id="mobile-trunk-container" ref={trunkContainerRef} className="mobile-trunk-container">
                        <div
                            id="mobile-trunk-scroll-content"
                            ref={scrollContentRef}
                            className="mobile-trunk-scroll-content"
                        >
                            <TreePathChrome
                                model={model}
                                panelRef={panelRef}
                                hostRefs={hostRefs}
                            />
                            <div ref={trunkBodyRef} className="mobile-trunk-body" id="mobile-trunk-body">
                                <div ref={trunkColRef} className="mobile-trunk-col" id="mobile-trunk-col">
                                    <div ref={knotsRef} id="mobile-knots-container" className="mobile-knots-container">
                                        <MobileKnotsColumn model={model} />
                                    </div>
                                </div>
                                <div className="mobile-right-col" id="mobile-right-col">
                                    <MobileRightColumn
                                        model={model}
                                        panelRef={panelRef}
                                        scrollRootRef={hostRefs.trunkContainer}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <GraphConstructionLayer />
            <CurriculumSwitcherModal rootRef={rootRef} />
        </div>
    );
}
