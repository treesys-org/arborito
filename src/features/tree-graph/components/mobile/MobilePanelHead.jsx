import { useEffect, useRef } from 'react';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { curriculumTreeDisplayName } from '../../../version-updates/api/version-switch-logic.js';
import { canConstructionNavigateBack } from '../../../editor/api/construction-enter-flow.js';
import {
    MobilePanelSwitcherChip,
    MobilePanelTreeLibraryChip,
    MobilePanelVersionCardChip,
    panelShowsBranchVersionChip,
} from './MobilePanelSwitcherChip.jsx';
import { resolveBranchPanelIcon } from '../../api/logic/graph-mobile-panel-helpers.js';
import { MobileInlineTools } from './MobileInlineTools.jsx';
import { CurriculumSwitcherChip } from '../curriculum/CurriculumSwitcherChip.jsx';

function PanelBackButton({ ui, showBack, onBack }) {
    if (!showBack) return null;
    const label = ui.navBack || ui.close || 'Back';
    return (
        <button
            type="button"
            className="mobile-panel-back"
            aria-label={label}
            title={label}
            onClick={onBack}
        >
            ←
        </button>
    );
}

function PanelHeadEmoji({ current, ui, isConstruct, canWrite, onEmojiPick }) {
    if (!isConstruct || !canWrite || current.type === 'root' || current.type !== 'branch') return null;
    const ic = resolveBranchPanelIcon(current);
    const label = (ui.graphChangeIcon || ui.graphEdit || 'Icon').trim();
    return (
        <button
            type="button"
            className="mobile-panel-head-emoji"
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEmojiPick(e.currentTarget, current);
            }}
        >
            <ChromeEmoji emoji={ic} className="mobile-panel-head-emoji__ic arborito-emoji-glyph" />
        </button>
    );
}

function ExplorePanelActions({ ui, current }) {
    const { setModal } = useTreeGraph();
    const forumLbl = ui.navForum || 'Forum';
    const arcadeLbl = ui.mobileArcadeCta || ui.navArcade || 'Arcade';
    return (
        <div className="mobile-panel-actions">
            <button
                type="button"
                className="mobile-panel-cta mobile-panel-cta--forum"
                aria-label={forumLbl}
                title={forumLbl}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setModal({ type: 'forum', placeId: current.id });
                }}
            >
                {forumLbl} 💬
            </button>
            <button
                type="button"
                className="mobile-panel-cta mobile-panel-cta--arcade"
                aria-label={arcadeLbl}
                title={arcadeLbl}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setModal({ type: 'arcade', preSelectedNodeId: current.id });
                }}
            >
                {arcadeLbl} 🎮
            </button>
        </div>
    );
}

function MoveHereButton({ folder, ui, tree }) {
    if (!tree.shouldShowMoveHereInPanel(folder)) return null;
    const label = ui.moveHereInFolder || 'Move here';
    return (
        <div className="mobile-panel-move-here-wrap w-full mt-1.5">
            <button
                type="button"
                className="mobile-panel-move-here"
                aria-label={label}
                onClick={(e) => tree.runMoveHereInPanel(folder, e)}
            >
                {label}
            </button>
        </div>
    );
}

function StackedBranchHead({ ui, current, construct, toolbar, chrome, chip, tools, moveHere, headExtraClass = '' }) {
    const regionLabel = current?.name || ui.graphFolder || ui.sourcesPillBranch || 'Folder';
    const headClass = `mobile-panel-head mobile-panel-head--branch${construct ? ' mobile-panel-head--branch-construct' : ''}${headExtraClass}`;
    const hasChrome = !!chrome;
    const hasTools = !!tools;
    const solo = !hasChrome && !hasTools;
    const rowClass = `mobile-panel-branch-unit__row${solo ? ' mobile-panel-branch-unit__row--solo' : ''}`;

    return (
        <div className={headClass}>
            {toolbar}
            <div className="mobile-panel-branch-unit" role="region" aria-label={regionLabel}>
                <div className={rowClass}>
                    {hasChrome ? <div className="mobile-panel-branch-unit__chrome">{chrome}</div> : null}
                    {chip}
                    {hasTools ? <div className="mobile-panel-branch-unit__tools">{tools}</div> : null}
                </div>
            </div>
            {moveHere}
        </div>
    );
}

function PanelTitleCell({ current, ui, tree }) {
    if (tree.exploreShowsCurriculumChip(current)) {
        return <MobilePanelSwitcherChip current={current} ui={ui} intent="explore" />;
    }

    if (current.type === 'root') {
        if (panelShowsBranchVersionChip(current)) {
            return <MobilePanelVersionCardChip current={current} ui={ui} />;
        }
        const t = curriculumTreeDisplayName(ui) || current.name || '';
        return (
            <span className="mobile-panel-title" title={t}>
                {t}
            </span>
        );
    }

    if (panelShowsBranchVersionChip(current)) {
        return <MobilePanelVersionCardChip current={current} ui={ui} />;
    }

    const t = current.name || '';
    return (
        <span className="mobile-panel-title" title={t}>
            {t}
        </span>
    );
}

function ConstructionPanelTitle({ current, ui, isConstruct, canWrite, tree }) {
    const { userStore, constructionEditFocus, viewMode, activeSource, graphUi } = tree;
    const inputRef = useRef(null);
    const rootName = current.type === 'root' ? curriculumTreeDisplayName(ui) : '';
    const title = current.type === 'root' ? rootName : current.name || '';
    const inlineRenameId = graphUi?.inlineRenameNodeId;
    const renaming =
        isConstruct &&
        canWrite &&
        current.type !== 'root' &&
        String(inlineRenameId || '') === String(current.id);

    useEffect(() => {
        const inp = inputRef.current;
        if (!inp || !renaming) return undefined;
        return tree.wireInlineRenameInput(current, inp);
    }, [current, renaming, tree]);

    if (renaming) {
        return (
            <input
                ref={inputRef}
                type="text"
                className="mobile-panel-title-input mobile-panel-title-input--inset"
                defaultValue={title}
                aria-label={ui.graphEdit || 'Rename'}
            />
        );
    }

    if (isConstruct && canWrite && current.type !== 'root') {
        if (panelShowsBranchVersionChip(current)) {
            return <MobilePanelVersionCardChip current={current} ui={ui} />;
        }
        return (
            <span className="mobile-panel-title-row flex items-center gap-1 min-w-0 flex-1">
                <span
                    className="mobile-panel-title mobile-panel-title-slot flex-1 min-w-0 truncate"
                    title={current.name || ''}
                    onClick={(e) => {
                        if (shouldShowMobileUI()) return;
                        e.preventDefault();
                        e.stopPropagation();
                        tree.startPanelTitleRename(current);
                    }}
                    onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        tree.startConstructionRename(current, current.name || '');
                    }}
                >
                    {current.name || ''}
                </span>
            </span>
        );
    }

    if (isConstruct && canWrite && current.type === 'root') {
        if (panelShowsBranchVersionChip(current)) {
            return <MobilePanelVersionCardChip current={current} ui={ui} />;
        }
        const treeId = fileSystem.composedTreeId();
        const entry = treeId ? userStore?.getTree?.(treeId) : null;
        const displayName = String(entry?.name || '').trim() || rootName;
        return (
            <span
                className="mobile-panel-title mobile-panel-title-slot flex-1 min-w-0 truncate"
                title={displayName}
            >
                {displayName}
            </span>
        );
    }

    if (isConstruct && canWrite && current?._composedVirtualRoot) {
        if (constructionEditFocus === 'tree') {
            return <MobilePanelTreeLibraryChip current={current} ui={ui} />;
        }
        const treeId = fileSystem.composedTreeId();
        const entry = treeId ? userStore?.getTree?.(treeId) : null;
        const displayName = String(entry?.name || current.name || '').trim();
        return (
            <span
                className="mobile-panel-title mobile-panel-title-slot flex-1 min-w-0 truncate"
                title={displayName}
            >
                {displayName}
            </span>
        );
    }

    const showVersionSlot =
        current.type === 'root' &&
        viewMode === 'explore' &&
        !!activeSource;
    const titleSpan =
        current.type === 'root' ? (
            <span className="mobile-panel-title" title={rootName}>
                {rootName}
            </span>
        ) : (
            <span className="mobile-panel-title" title={title}>
                {current.name || ''}
            </span>
        );

    if (current.type === 'root' && showVersionSlot) {
        return (
            <div className="mobile-panel-root-head flex flex-col min-w-0 flex-1 gap-0.5">
                <div className="mobile-panel-version-slot w-full min-w-0 mt-1">
                    <CurriculumSwitcherChip />
                </div>
            </div>
        );
    }

    return titleSpan;
}

/** Mobile branch panel header (replaces buildPanelHead HTML). */
export function MobilePanelHead({ current, ui, directChildSelected }) {
    const tree = useTreeGraph();
    const { graphUi, constructionMode } = tree;
    const isConstruct = !!constructionMode;
    const canWrite = fileSystem.features.canWrite;
    const pendingMoveNodeId = graphUi?.pendingMoveNodeId;
    const hideInlineWhilePickingMove = pendingMoveNodeId != null && String(pendingMoveNodeId) !== '';
    const mobilePath = Array.isArray(graphUi?.mobilePath) ? graphUi.mobilePath.map(String) : [];

    const pathDepth = mobilePath.length || 0;
    const showBack =
        pathDepth > 1 && isConstruct && canWrite
            ? canConstructionNavigateBack({ mobilePath })
            : pathDepth > 1;

    const back = <PanelBackButton ui={ui} showBack={showBack} onBack={tree.navigatePanelBack} />;
    const headEmoji = (
        <PanelHeadEmoji
            current={current}
            ui={ui}
            isConstruct={isConstruct}
            canWrite={canWrite}
            onEmojiPick={tree.openConstructionEmojiPicker}
        />
    );
    const titleCell =
        isConstruct && canWrite ? (
            <ConstructionPanelTitle
                current={current}
                ui={ui}
                isConstruct={isConstruct}
                canWrite={canWrite}
                tree={tree}
            />
        ) : (
            <PanelTitleCell current={current} ui={ui} tree={tree} />
        );
    const actions = !isConstruct ? <ExplorePanelActions ui={ui} current={current} /> : null;
    const parentTools =
        isConstruct && canWrite ? (
            <MobileInlineTools
                node={current}
                compact
                folderContextDimmed={directChildSelected && !hideInlineWhilePickingMove}
                revealDelete={false}
                omitDelete
            />
        ) : null;
    const moveHere = <MoveHereButton folder={current} ui={ui} tree={tree} />;

    const isRootCourseHead = !isConstruct && tree.exploreShowsCurriculumChip(current);
    if (isRootCourseHead) {
        return (
            <StackedBranchHead
                ui={ui}
                current={current}
                toolbar={actions ? <div className="mobile-panel-toolbar">{actions}</div> : null}
                chip={<MobilePanelSwitcherChip current={current} ui={ui} intent="explore" />}
                moveHere={moveHere}
                headExtraClass=" mobile-panel-head--course"
            />
        );
    }

    const useStackedBranchHead =
        panelShowsBranchVersionChip(current) &&
        (current?.type === 'branch' || (isConstruct && current?.type === 'root'));

    if (useStackedBranchHead) {
        const branchChip = (
            <MobilePanelSwitcherChip
                current={current}
                ui={ui}
                intent="version"
                skipIcon={isConstruct}
            />
        );
        if (isConstruct) {
            return (
                <StackedBranchHead
                    ui={ui}
                    current={current}
                    construct
                    chrome={
                        <>
                            {back}
                            {headEmoji}
                        </>
                    }
                    chip={branchChip}
                    tools={parentTools}
                    moveHere={moveHere}
                />
            );
        }
        return (
            <StackedBranchHead
                ui={ui}
                current={current}
                toolbar={actions ? <div className="mobile-panel-toolbar">{actions}</div> : null}
                chrome={back}
                chip={branchChip}
                moveHere={moveHere}
            />
        );
    }

    return (
        <div className={`mobile-panel-head${isConstruct ? ' mobile-panel-head--construction' : ''}`}>
            <div className="mobile-panel-header">
                {back}
                {headEmoji}
                {titleCell}
                {parentTools}
                {!isConstruct ? actions : null}
            </div>
            {moveHere}
        </div>
    );
}
