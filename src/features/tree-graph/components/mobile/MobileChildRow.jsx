import { useEffect, useRef } from 'react';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import {
    folderDisplayIcon,
    FOLDER_DISPLAY_ICON,
} from '../../api/node-property-emojis.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { CompletedTickIcon } from '../../../../shared/ui/CompletedTickIcon.jsx';
import { getMobileTone } from '../../api/mobile-tree-presentation-utils.js';
import { isFolderAchievementEarned } from '../../../garden-progress/api/achievement-folder-status.js';
import { MobileInlineTools } from './MobileInlineTools.jsx';
import { useBindMobileTapRef } from '../../../../shared/ui/useBindMobileTap.js';
import { useViewportShell } from '../../../../shared/ui/breakpoints.js';

function formatBranchUpdatedLabel(node) {
    const raw = node?._meta?.updatedAt ?? node?.meta?.updatedAt ?? node?.updatedAt;
    if (raw == null || raw === '') return '';
    try {
        const d = new Date(typeof raw === 'number' ? raw : String(raw));
        if (Number.isNaN(d.getTime())) return '';
        /* Guard epoch / placeholder stamps (e.g. 0 or 1 → 1970). */
        if (d.getTime() < 946684800000) return '';
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
}

function pickChildIcon(child, _childCompleted) {
    if (child.icon) return child.type === 'branch' ? folderDisplayIcon(child.icon) : child.icon;
    if (child.type === 'branch') return FOLDER_DISPLAY_ICON;
    if (child.type === 'exam') return '📝';
    return '📖';
}

/** One child row in the mobile branch panel (viñeta). */
export function MobileChildRow({ child, ctx }) {
    const renameInputRef = useRef(null);
    const rowRef = useRef(null);
    const { mobile } = useViewportShell();
    const { isConstruct, canWrite, hideInlineWhilePickingMove, harvested, ui, tree, folderNode, lastOpenedId } =
        ctx;
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
    const openedId =
        lastOpenedId != null
            ? String(lastOpenedId)
            : !isConstruct
              ? String(tree.userStore?.getRecentLessons?.()?.[0]?.id || '')
              : '';
    const recentOpened =
        !!openedId &&
        (child.type === 'leaf' || child.type === 'exam') &&
        String(child.id) === openedId;
    const cname = child.name || '';
    const inlineRenameId = tree.graphUi?.inlineRenameNodeId;
    const renamingRow =
        isConstruct && canWrite && String(inlineRenameId || '') === String(child.id);
    const renameLbl = ui.graphRename || ui.graphEdit || 'Rename';
    const editable = isConstruct && canWrite && !hideInlineWhilePickingMove && !isComposedBranch;
    const showArrow = isFolderRow || hasKidsLoaded;
    const useFolderTrail = isFolderRow && isConstruct && canWrite && !hideInlineWhilePickingMove;
    const dateStr = useFolderTrail ? formatBranchUpdatedLabel(child) : '';
    const dateHint = ui.graphFolderUpdatedHint || 'Last update';
    const showAchievementBadge =
        !!child.isCertifiable ||
        ((child.type === 'leaf' || child.type === 'exam') && !!folderNode?.isCertifiable);
    const achievementNode = child.isCertifiable ? child : folderNode?.isCertifiable ? folderNode : null;
    const achievementEarned = showAchievementBadge && isFolderAchievementEarned(achievementNode);
    const achievementHint = achievementEarned
        ? ui.graphAchievementEarnedHint || 'Achievement earned'
        : ui.graphAchievementPendingHint || 'Achievement available when you finish every lesson in this folder';

    useEffect(() => {
        const inp = renameInputRef.current;
        if (!inp || !renamingRow) return undefined;
        return tree.wireInlineRenameInput(child, inp);
    }, [child, renamingRow, tree]);

    const onRowActivate = async (e) => {
        const t = e?.target;
        if (t?.closest?.('.mobile-child-icon-btn')) return;
        if (t?.closest?.('.mobile-inline-tools')) return;
        if (t?.closest?.('.mobile-inline-tools-host')) return;
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

    const onMobileRowTap = (e) => {
        const t = e?.target instanceof Element ? e.target : null;
        if (t) {
            const nested = t.closest(
                '.mobile-child-icon-btn, .mobile-child-rename-btn, .mobile-inline-tools, .mobile-inline-tools-host, .mobile-child-name-input'
            );
            if (nested) {
                if (nested.matches('input, textarea')) return;
                const btn = nested.closest('button');
                if (btn && btn !== rowRef.current) btn.click();
                return;
            }
        }
        onRowActivate(e);
    };

    useBindMobileTapRef(rowRef, onMobileRowTap, mobile);

    return (
        <div className="mobile-child-wrap">
            <div
                ref={rowRef}
                className={`mobile-child-row${rowState}${isRowSel ? ' mobile-child-row--selected' : ''}${
                    recentOpened ? ' mobile-child-row--opened' : ''
                }${isFolderRow ? ' mobile-child-row--folder' : ''}${
                    isComposedBranch ? ' mobile-child-row--composed-branch' : ''
                }`}
                data-node-id={String(child.id)}
                role="button"
                tabIndex={0}
                aria-label={`${cname}${childCompleted ? `, ${ui.completed || 'completed'}` : ''}`}
                onClick={mobile ? undefined : onRowActivate}
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
                {!renamingRow && isConstruct && canWrite && !isComposedBranch ? (
                    <button
                        type="button"
                        className="mobile-child-rename-btn"
                        aria-label={renameLbl}
                        title={renameLbl}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            tree.startConstructionRename(child, cname);
                        }}
                    >
                        <ChromeEmoji emoji="✏️" size={16} className="arborito-emoji-glyph" />
                    </button>
                ) : null}
                <div className="mobile-child-info">
                    {isComposedBranch ? (
                        <span className="mobile-child-composed-pill">
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
                            <span className="mobile-child-name-text">{cname}</span>
                            {childCompleted ? (
                                <span
                                    className="mobile-child-done-tick arborito-no-emojify"
                                    aria-hidden="true"
                                >
                                    <CompletedTickIcon size={13} />
                                </span>
                            ) : null}
                        </div>
                    )}
                </div>
                {showAchievementBadge ? (
                    <span
                        className={`mobile-child-achievement-badge${
                            achievementEarned
                                ? ' mobile-child-achievement-badge--earned'
                                : ' mobile-child-achievement-badge--locked'
                        }`}
                        aria-label={achievementHint}
                    >
                        <ChromeEmoji emoji="🏆" size={16} className="arborito-emoji-glyph" />
                    </span>
                ) : null}
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
