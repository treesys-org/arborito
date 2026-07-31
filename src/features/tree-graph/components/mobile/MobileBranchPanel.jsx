import { useEffect, useRef, useState } from 'react';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { ListRowEnter, ListRowSkeleton } from '../../../../shared/ui/ListRowEnter.jsx';
import { MobilePanelHead } from './MobilePanelHead.jsx';
import { MobileChildRow } from './MobileChildRow.jsx';
import { ConstructionCreateFab } from '../construction/ConstructionCreateFab.jsx';
import { useVirtualChildWindow } from '../../hooks/useVirtualChildWindow.jsx';
import { resolveLastMapFocusId } from '../../api/mobile-tree-presentation-utils.js';

/** Active branch children panel (right column). */
export function MobileBranchPanel({
    current,
    harvested,
    directChildSelected,
    panelRef,
    scrollRootRef,
    revealLimit = null,
}) {
    const tree = useTreeGraph();
    const { ui, graphUi, constructionMode, subscribeUserProgressChanged } = tree;
    const children = Array.isArray(current.children) ? current.children : [];
    const isConstruct = !!constructionMode;
    const canWrite = fileSystem.features.canWrite;
    const pendingMoveNodeId = graphUi?.pendingMoveNodeId;
    const hideInlineWhilePickingMove = pendingMoveNodeId != null && String(pendingMoveNodeId) !== '';
    const [recentEpoch, setRecentEpoch] = useState(0);
    const seenEnterRef = useRef(new Set());
    const enterWaveRef = useRef(0);

    useEffect(() => {
        return subscribeUserProgressChanged(() => setRecentEpoch((n) => n + 1));
    }, [subscribeUserProgressChanged]);

    useEffect(() => {
        seenEnterRef.current = new Set();
        enterWaveRef.current = 0;
    }, [current?.id]);

    useEffect(() => {
        if (!current?.id) return undefined;
        if (children.length === 0 && current.hasUnloadedChildren) {
            tree
                .loadNodeChildren(current)
                .then(() => {
                    tree.bumpGraphUiRevision?.();
                })
                .catch(() => {
                    /* ignore */
                });
        }
    }, [current, children.length, current?.id, tree]);

    const lastOpenedId = !isConstruct ? resolveLastMapFocusId(tree) : '';
    void recentEpoch;

    const ctx = {
        isConstruct,
        canWrite,
        hideInlineWhilePickingMove,
        pendingMoveNodeId,
        harvested,
        ui,
        tree,
        folderNode: current,
        lastOpenedId,
    };
    const revealChildren =
        revealLimit == null ? children : children.slice(0, Math.max(0, Number(revealLimit) || 0));
    const { items: visibleChildren, paddingTop, paddingBottom, virtualized } = useVirtualChildWindow(
        revealChildren,
        scrollRootRef
    );
    const panelHead = (
        <MobilePanelHead current={current} ui={ui} directChildSelected={directChildSelected} />
    );
    const fab = isConstruct && canWrite ? <ConstructionCreateFab folderNode={current} /> : null;
    const panelCls = `mobile-children-panel${fab ? ' mobile-children-panel--fab-pad' : ''}`;

    if (children.length === 0 && current.hasUnloadedChildren) {
        const loading = ui.mobileLoadingCount || 'Loading…';
        return (
            <div ref={panelRef} className={panelCls}>
                <div className="mobile-panel-header">{loading}</div>
                <div
                    className="mobile-empty-branch"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                    aria-label={loading}
                >
                    <ListRowSkeleton count={3} variant="child" />
                </div>
                {fab}
            </div>
        );
    }

    if (children.length === 0) {
        return (
            <div ref={panelRef} className={panelCls}>
                {panelHead}
                <div className="mobile-empty-branch">
                    <div className="mobile-empty-branch-icon" aria-hidden="true" />
                    <div className="mobile-empty-branch-text">{ui.mobileEndOfBranch || 'End of Branch'}</div>
                </div>
                {fab}
            </div>
        );
    }

    return (
        <div ref={panelRef} className={panelCls}>
            {panelHead}
            {virtualized && paddingTop > 0 ? (
                <div className="mobile-child-virtual-spacer" style={{ height: paddingTop }} aria-hidden="true" />
            ) : null}
            {visibleChildren.map((child) => {
                const id = String(child.id);
                const firstSeen = !seenEnterRef.current.has(id);
                if (firstSeen) {
                    seenEnterRef.current.add(id);
                    const wave = enterWaveRef.current++;
                    return (
                        <ListRowEnter key={id} index={wave}>
                            <MobileChildRow child={child} ctx={ctx} />
                        </ListRowEnter>
                    );
                }
                return <MobileChildRow key={id} child={child} ctx={ctx} />;
            })}
            {virtualized && paddingBottom > 0 ? (
                <div className="mobile-child-virtual-spacer" style={{ height: paddingBottom }} aria-hidden="true" />
            ) : null}
            {fab}
        </div>
    );
}
