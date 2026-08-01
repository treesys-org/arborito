import { useEffect, useRef, useState } from 'react';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { getMobileTone, nodeLeadsToLessonId, resolveLastMapFocusId } from '../../api/mobile-tree-presentation-utils.js';
import { getSelectedNodeId } from '../../api/graph-ui-accessors.js';
import { Callout } from '../../../../shared/ui/Callout.jsx';
import { MobileKnotRow, MobilePathLabelRow } from './MobileKnotRow.jsx';
import { MobileBranchPanel } from './MobileBranchPanel.jsx';
import { useGrowReveal } from '../../hooks/useGrowReveal.js';
import {
    hasGrowRevealVisit,
    markGrowRevealVisit,
} from '../../api/grow-reveal-visit-memory.js';

/** Keep growth-burst armed long enough for grow-reveal to show the tip knot. */
const GROWTH_BURST_LATCH_MS = 1300;

function MobileMovePickBanner() {
    const tree = useTreeGraph();
    const { ui, graphUi, findNode } = tree;
    const pendingId = graphUi?.pendingMoveNodeId;
    const hint =
        ui.movePickOnTreeHint ||
        ui.movePickOnTreeBanner ||
        'Open the destination folder, then tap Move here.';
    const moving = pendingId ? findNode(pendingId) : null;
    const name = moving?.name || '';

    const cancelMove = (e) => {
        e?.preventDefault?.();
        tree.setPendingMoveNodeId?.(null);
        tree.bumpGraphUiRevision?.();
    };

    return (
        <Callout
            tone="amber"
            solid
            size="sm"
            role="status"
            extraClass="arborito-move-pick-banner pointer-events-auto w-full max-w-xl shadow-lg"
        >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 w-full">
                <p className="text-xs font-bold leading-snug m-0">
                    {hint}
                    {name ? <span className="font-black"> {name}</span> : null}
                </p>
                <button
                    type="button"
                    className="arborito-move-pick-cancel arborito-cta-slate shrink-0 text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-lg"
                    onClick={cancelMove}
                >
                    {ui.cancel || 'Cancel'}
                </button>
            </div>
        </Callout>
    );
}

function graphMountKey(tree) {
    const src = tree.activeSource;
    /* Source-only: skeleton→full / placeholder→members keep the same key so
     * grow-reveal does not restart when the root node id is rewritten. */
    return String(src?.id || src?.url || '');
}

/**
 * Model pulse is true for one plan frame (depth patch clears it). Latch so the
 * tip knot still blooms after grow-reveal makes it visible.
 */
function useLatchedGrowthPulse(pulseKnotIndex) {
    const tokenRef = useRef(0);
    const mountedRef = useRef(true);
    const [latched, setLatched] = useState(-1);
    const idx = typeof pulseKnotIndex === 'number' ? pulseKnotIndex : -1;

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (idx < 0) return;
        const token = ++tokenRef.current;
        setLatched(idx);
        window.setTimeout(() => {
            if (!mountedRef.current || tokenRef.current !== token) return;
            setLatched(-1);
        }, GROWTH_BURST_LATCH_MS);
        /* Intentionally no clearTimeout when idx flips to -1 — that patch must
         * not cancel the burst before grow-reveal shows the tip knot. */
    }, [idx]);

    if (idx >= 0) return idx;
    return latched >= 0 ? latched : -1;
}

/** Knot column content, inline in Graph.jsx. */
export function MobileKnotsColumn({ model }) {
    const tree = useTreeGraph();
    const { constructionMode, subscribeUserProgressChanged } = tree;
    const [recentEpoch, setRecentEpoch] = useState(0);

    useEffect(() => {
        return subscribeUserProgressChanged(() => setRecentEpoch((n) => n + 1));
    }, [subscribeUserProgressChanged]);

    void recentEpoch;

    const pathNodes = model?.pathNodes;
    const pathLen = pathNodes?.length || 0;
    const pathShown = useGrowReveal(graphMountKey(tree), pathLen, 90);
    const latchedPulseIndex = useLatchedGrowthPulse(model?.pulseKnotIndex ?? -1);

    if (!pathLen) return null;

    const { harvested, activeIndex } = model;
    const lastOpenedId = !constructionMode ? resolveLastMapFocusId(tree) : '';

    return pathNodes.map((node, index) => (
        <MobileKnotRow
            key={String(node.id)}
            tree={tree}
            node={node}
            index={index}
            pathNodes={pathNodes}
            harvested={harvested}
            isActive={index === activeIndex}
            tone={getMobileTone(node)}
            pulseGrowth={index === latchedPulseIndex}
            revealVisible={index < pathShown}
            leadsToOpened={
                !!lastOpenedId && nodeLeadsToLessonId(node, lastOpenedId, (id) => tree.findNode?.(id))
            }
        />
    ));
}

/** Right column content, inline in Graph.jsx. */
export function MobileRightColumn({ model, panelRef, scrollRootRef }) {
    const tree = useTreeGraph();
    const { constructionMode, subscribeUserProgressChanged } = tree;
    const [recentEpoch, setRecentEpoch] = useState(0);

    useEffect(() => {
        return subscribeUserProgressChanged(() => setRecentEpoch((n) => n + 1));
    }, [subscribeUserProgressChanged]);

    void recentEpoch;

    const pathNodes = model?.pathNodes;
    const pathLen = pathNodes?.length || 0;
    const mountKey = graphMountKey(tree);
    const pathShown = useGrowReveal(mountKey, pathLen, 90);

    const current = model?.current;
    const currentId = String(current?.id || '');
    /*
     * Mark on leave (cleanup), not enter — so the first forward paint can finish
     * its stagger; back / re-enter hits an already-visited id and skips.
     */
    useEffect(() => {
        return () => {
            if (currentId) markGrowRevealVisit(mountKey, currentId);
        };
    }, [mountKey, currentId]);
    const kidsInstant = !!(currentId && hasGrowRevealVisit(mountKey, currentId));

    const harvested = model?.harvested;
    const activeIndex = model?.activeIndex ?? 0;
    const children = Array.isArray(current?.children) ? current.children : [];
    /* Kids reveal once the active knot slot exists (active branch always mounts). */
    const kidsReady = pathLen > 0 && activeIndex >= 0;
    const kidsShown = useGrowReveal(
        kidsReady ? `${mountKey}:${currentId}:kids` : `${mountKey}:kids-wait`,
        kidsReady ? children.length : 0,
        75,
        { instant: kidsInstant }
    );

    if (!pathLen) return null;

    const selectedId = getSelectedNodeId();
    const directChildSelected =
        selectedId != null && children.some((c) => String(c.id) === String(selectedId));
    const lastOpenedId = !constructionMode ? resolveLastMapFocusId(tree) : '';

    return pathNodes.map((node, index) => {
        /* Always mount the active branch so the connector arm has a panel host
         * immediately on navigate — stagger only inactive path labels. */
        if (index >= pathShown && index !== activeIndex) return null;
        const isActive = index === activeIndex;
        const leadsToOpened =
            !!lastOpenedId && nodeLeadsToLessonId(node, lastOpenedId, (id) => tree.findNode?.(id));
        if (isActive) {
            return (
                <div key={`branch-${node.id}`} className="mobile-active-branch">
                    <MobilePathLabelRow
                        node={node}
                        index={index}
                        pathNodes={pathNodes}
                        leadsToOpened={leadsToOpened}
                    />
                    <MobileBranchPanel
                        current={current}
                        harvested={harvested}
                        directChildSelected={directChildSelected}
                        panelRef={panelRef}
                        scrollRootRef={scrollRootRef}
                        revealLimit={kidsShown}
                    />
                </div>
            );
        }
        return (
            <MobilePathLabelRow
                key={`label-${node.id}-${index}`}
                node={node}
                index={index}
                pathNodes={pathNodes}
                leadsToOpened={leadsToOpened}
            />
        );
    });
}

/** Move-pick banner for overlay slot. */
export function MobileTreeOverlayBanner() {
    const tree = useTreeGraph();
    const { graphUi, constructionMode, findNode } = tree;
    const pendingId = graphUi?.pendingMoveNodeId;
    const showBanner =
        pendingId &&
        constructionMode &&
        fileSystem.features.canWrite &&
        (() => {
            const m = findNode(pendingId);
            return m && m.type !== 'root';
        })();

    if (!showBanner) return null;
    return <MobileMovePickBanner />;
}
