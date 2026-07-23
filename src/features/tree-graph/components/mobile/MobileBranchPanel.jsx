import { useEffect, useState } from 'react';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { getArboritoStore } from '../../../../core/store-singleton.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { LoadingBrand } from '../../../../shared/ui/Loading.jsx';
import { MobilePanelHead } from './MobilePanelHead.jsx';
import { MobileChildRow } from './MobileChildRow.jsx';
import { ConstructionCreateFab } from '../construction/ConstructionCreateFab.jsx';
import { useVirtualChildWindow } from '../../hooks/useVirtualChildWindow.jsx';

/** Active branch children panel (right column). */
export function MobileBranchPanel({ current, harvested, directChildSelected, panelRef, scrollRootRef }) {
    const tree = useTreeGraph();
    const { ui, graphUi, constructionMode } = tree;
    const children = Array.isArray(current.children) ? current.children : [];
    const isConstruct = !!constructionMode;
    const canWrite = fileSystem.features.canWrite;
    const pendingMoveNodeId = graphUi?.pendingMoveNodeId;
    const hideInlineWhilePickingMove = pendingMoveNodeId != null && String(pendingMoveNodeId) !== '';
    const [recentEpoch, setRecentEpoch] = useState(0);

    useEffect(() => {
        const store = getArboritoStore();
        if (!store?.addEventListener) return undefined;
        const onProgress = () => setRecentEpoch((n) => n + 1);
        store.addEventListener('arborito-user-progress-changed', onProgress);
        return () => store.removeEventListener('arborito-user-progress-changed', onProgress);
    }, []);

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

    const lastOpenedId = !isConstruct
        ? String(tree.userStore?.getRecentLessons?.()?.[0]?.id || '')
        : '';
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
    const { items: visibleChildren, paddingTop, paddingBottom, virtualized } = useVirtualChildWindow(
        children,
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
                <div className="mobile-empty-branch">
                    <div
                        className="mobile-empty-branch-loading"
                        role="status"
                        aria-live="polite"
                        aria-busy="true"
                    >
                        <LoadingBrand
                            label=""
                            size="lg"
                            tone="sage"
                            extraClass="arborito-loading-brand--compact"
                        />
                        <span className="mobile-empty-branch-loading__label">{loading}</span>
                    </div>
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
            {visibleChildren.map((child) => (
                <MobileChildRow key={String(child.id)} child={child} ctx={ctx} />
            ))}
            {virtualized && paddingBottom > 0 ? (
                <div className="mobile-child-virtual-spacer" style={{ height: paddingBottom }} aria-hidden="true" />
            ) : null}
            {fab}
        </div>
    );
}
