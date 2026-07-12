import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { getMobileTone } from '../../api/mobile-tree-presentation-utils.js';
import { getMobilePath, getSelectedNodeId } from '../../api/graph-ui-accessors.js';
import { Callout } from '../../../../shared/ui/Callout.jsx';
import { MobileKnotRow, MobilePathLabelRow } from './MobileKnotRow.jsx';
import { MobileBranchPanel } from './MobileBranchPanel.jsx';

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

/** Knot column content, inline in Graph.jsx. */
export function MobileKnotsColumn({ model }) {
    const tree = useTreeGraph();
    const { ui, userStore, graphUi, constructionMode } = tree;
    if (!model?.pathNodes?.length) return null;

    const { pathNodes, harvested, activeIndex, pulseKnotIndex } = model;

    return pathNodes.map((node, index) => (
        <MobileKnotRow
            key={`${node.id}-${index}`}
            tree={tree}
            node={node}
            index={index}
            pathNodes={pathNodes}
            harvested={harvested}
            isActive={index === activeIndex}
            tone={getMobileTone(node)}
            pulseGrowth={index === pulseKnotIndex}
        />
    ));
}

/** Right column content, inline in Graph.jsx. */
export function MobileRightColumn({ model, panelRef, scrollRootRef }) {
    if (!model?.pathNodes?.length) return null;

    const { pathNodes, current, harvested, activeIndex } = model;
    const children = Array.isArray(current.children) ? current.children : [];
    const selectedId = getSelectedNodeId();
    const directChildSelected =
        selectedId != null && children.some((c) => String(c.id) === String(selectedId));

    return pathNodes.map((node, index) => {
        const isActive = index === activeIndex;
        if (isActive) {
            return (
                <div key={`branch-${node.id}`} className="mobile-active-branch">
                    <MobilePathLabelRow node={node} index={index} pathNodes={pathNodes} />
                    <MobileBranchPanel
                        current={current}
                        harvested={harvested}
                        directChildSelected={directChildSelected}
                        panelRef={panelRef}
                        scrollRootRef={scrollRootRef}
                    />
                </div>
            );
        }
        return (
            <MobilePathLabelRow key={`label-${node.id}-${index}`} node={node} index={index} pathNodes={pathNodes} />
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
