import { useEffect, useRef } from 'react';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { isConstructionTreeOnlyMode } from '../../../editor/api/construction-enter-flow.js';
import { schedulePersistTreeUiState } from '../../api/tree-ui-persist.js';
import {
    folderDisplayIcon,
    FOLDER_DISPLAY_ICON,
} from '../../api/node-property-emojis.js';
import { LoadingBrand } from '../../../../shared/ui/Loading.jsx';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { getMobileTone } from '../../api/mobile-tree-presentation-utils.js';
import { MobileInlineTools } from './MobileInlineTools.jsx';
import { MobilePanelHead } from './MobilePanelHead.jsx';
import { ConstructionCreateFab } from '../construction/ConstructionCreateFab.jsx';
import { useVirtualChildWindow } from '../../hooks/useVirtualChildWindow.jsx';

function formatBranchUpdatedLabel(node) {
    const raw = node?._meta?.updatedAt ?? node?.meta?.updatedAt ?? node?.updatedAt;
    if (raw == null || raw === '') return '';
    try {
        const d = new Date(typeof raw === 'number' ? raw : String(raw));
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
}

function pickChildIcon(child, childCompleted) {
    if (child.type === 'exam' && childCompleted) return '✔';
    if (child.icon) return child.type === 'branch' ? folderDisplayIcon(child.icon) : child.icon;
    if (child.type === 'branch') return FOLDER_DISPLAY_ICON;
    if (child.type === 'exam') return '📝';
    return '📖';
}

function MobileChildRow({ child, ctx }) {
    const renameInputRef = useRef(null);
    const { isConstruct, canWrite, hideInlineWhilePickingMove, harvested, ui, tree } = ctx;
    const hasKidsLoaded = child.children && child.children.length > 0;
    const tone = getMobileTone(child);
    const childCompleted = tree.isCompleted && tree.isCompleted(child.id);
    const childHarvested = harvested.find((h) => String(h.id) === String(child.id));
    const rowState = childHarvested ? '' : child.isEmpty ? ' is-empty' : childCompleted ? ' is-completed' : '';
    const childState = childHarvested
        ? ' state-harvested'
        : child.isEmpty
          ? ' state-empty'
          : childCompleted
            ? ' state-completed'
            : '';
    const isFolderRow = child.type === 'branch';
    const isComposedBranch = !!child._composedWrapper;
    const childIcon = pickChildIcon(child, childCompleted);
    const selectedId = tree.graphUi?.selectedNodeId != null ? String(tree.graphUi.selectedNodeId) : null;
    const isRowSel =
        isConstruct &&
        canWrite &&
        !hideInlineWhilePickingMove &&
        selectedId != null &&
        String(child.id) === String(selectedId);
    const cname = child.name || '';
    const inlineRenameId = tree.graphUi?.inlineRenameNodeId;
    const renamingRow =
        isConstruct && canWrite && String(inlineRenameId || '') === String(child.id);
    const renameLbl = ui.graphRename || ui.graphEdit || 'Rename';
    const editable = isConstruct && canWrite && !hideInlineWhilePickingMove;
    const showArrow = isFolderRow || hasKidsLoaded;
    const useFolderTrail = isFolderRow && isConstruct && canWrite && !hideInlineWhilePickingMove;
    const dateStr = useFolderTrail ? formatBranchUpdatedLabel(child) : '';
    const dateHint = ui.graphFolderUpdatedHint || 'Last update';

    useEffect(() => {
        const inp = renameInputRef.current;
        if (!inp || !renamingRow) return undefined;
        return tree.wireInlineRenameInput(child, inp);
    }, [child, renamingRow, tree]);

    const onRowActivate = async (e) => {
        const t = e?.target;
        if (t?.closest?.('.mobile-child-icon-btn')) return;
        if (t?.closest?.('.mobile-inline-tools')) return;
        if (t?.closest?.('.mobile-child-name-input')) return;
        if (t?.closest?.('.mobile-child-rename-btn')) return;

        try {
            if (isConstruct && fileSystem.features.canWrite && !ctx.pendingMoveNodeId) {
                tree.selectMobileNode(child.id);
                tree.setGraphMoveMode(false);
            }
            if (child.type === 'leaf' || child.type === 'exam') {
                if (isConstruct && fileSystem.features.canWrite) {
                    tree.selectMobileNode(child.id);
                    tree.bumpGraphUiRevision();
                }
                await tree.openNodeFromMobileTree(child.id);
                return;
            }
            if (child.type === 'branch') {
                if (isConstructionTreeOnlyMode() && child._composedWrapper) return;
                if (child.hasUnloadedChildren && (!child.children || child.children.length === 0)) {
                    await tree.loadNodeChildren(child);
                }
                tree.navigateIntoChild(child.id);
                return;
            }
            await tree.openNodeFromMobileTree(child.id);
        } catch (err) {
            console.error('Mobile tree navigation failed', err);
        }
    };

    const onRowKeyDown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            onRowActivate(ev);
        }
    };

    return (
        <div className="mobile-child-wrap">
            <div
                className={`mobile-child-row${rowState}${isRowSel ? ' mobile-child-row--selected' : ''}${
                    isFolderRow ? ' mobile-child-row--folder' : ''
                }${isComposedBranch ? ' mobile-child-row--composed-branch' : ''}`}
                data-node-id={String(child.id)}
                role="button"
                tabIndex={0}
                aria-label={`${cname}${childCompleted ? `, ${ui.completed || 'completed'}` : ''}`}
                onClick={onRowActivate}
                onKeyDown={onRowKeyDown}
            >
                <div className={`mobile-child-knot tone-${tone}${childState}`}>
                    {editable ? (
                        <button
                            type="button"
                            className="mobile-child-icon-btn"
                            aria-label={ui.graphChangeIcon || ui.graphEdit || 'Icon'}
                            onClick={(ev) => {
                                ev.preventDefault();
                                ev.stopPropagation();
                                tree.openConstructionEmojiPicker(ev.currentTarget, child);
                            }}
                        >
                            <ChromeEmoji emoji={childIcon} size={22} className="mobile-child-icon arborito-emoji-glyph" />
                        </button>
                    ) : (
                        <ChromeEmoji emoji={childIcon} size={22} className="mobile-child-icon arborito-emoji-glyph" />
                    )}
                </div>
                {!renamingRow && isConstruct && canWrite ? (
                    <button
                        type="button"
                        className="mobile-child-rename-btn shrink-0 text-sm leading-none p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                        aria-label={renameLbl}
                        title={renameLbl}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            tree.startConstructionRename(child, cname);
                        }}
                    >
                        ✏️
                    </button>
                ) : null}
                <div className="mobile-child-info">
                    {isComposedBranch ? (
                        <span className="arborito-pill arborito-pill--chip border bg-violet-50 dark:bg-violet-950/30 text-violet-800 dark:text-violet-200 border-violet-200/70 dark:border-violet-800/60 text-[10px] font-extrabold shrink-0">
                            {ui.graphComposedBranchPill || 'Branch in tree'}
                        </span>
                    ) : null}
                    {renamingRow ? (
                        <input
                            ref={renameInputRef}
                            type="text"
                            className="mobile-child-name-input mobile-child-name-input--inset"
                            defaultValue={cname}
                            aria-label={renameLbl}
                        />
                    ) : (
                        <div
                            className="mobile-child-name mobile-child-name-slot"
                            title={cname}
                            onDoubleClick={(e) => {
                                if (!editable || child.type === 'root') return;
                                e.preventDefault();
                                e.stopPropagation();
                                tree.startConstructionRename(child, cname);
                            }}
                        >
                            {cname}
                            {childCompleted ? ' · ✔' : ''}
                        </div>
                    )}
                </div>
                {isConstruct && canWrite && !hideInlineWhilePickingMove ? (
                    <MobileInlineTools node={child} compact />
                ) : null}
                {useFolderTrail ? (
                    <div className="mobile-child-folder-trail">
                        {dateStr ? (
                            <span
                                className="mobile-child-folder-meta"
                                title={`${dateHint}: ${dateStr}`}
                            >
                                {dateStr}
                            </span>
                        ) : null}
                        <div className="mobile-child-arrow" aria-hidden="true">
                            ›
                        </div>
                    </div>
                ) : showArrow ? (
                    <div className="mobile-child-arrow" aria-hidden="true">
                        ›
                    </div>
                ) : null}
            </div>
        </div>
    );
}

/** Active branch children panel (right column). */
export function MobileBranchPanel({ current, harvested, directChildSelected, panelRef, scrollRootRef }) {
    const tree = useTreeGraph();
    const { ui, userStore, graphUi, constructionMode } = tree;
    const children = Array.isArray(current.children) ? current.children : [];
    const isConstruct = !!constructionMode;
    const canWrite = fileSystem.features.canWrite;
    const pendingMoveNodeId = graphUi?.pendingMoveNodeId;
    const hideInlineWhilePickingMove = pendingMoveNodeId != null && String(pendingMoveNodeId) !== '';

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
    }, [current, children.length, current?.id]);

    const ctx = {
        isConstruct,
        canWrite,
        hideInlineWhilePickingMove,
        pendingMoveNodeId,
        harvested,
        ui,
        tree,
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
                        className="flex flex-col items-center justify-center gap-3 py-6 min-h-[96px]"
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
                        <span className="text-emerald-700 dark:text-emerald-300 text-sm font-medium">
                            {loading}
                        </span>
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
