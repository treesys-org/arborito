import { useEffect, useRef } from 'react';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { curriculumTreeDisplayName } from '../../../version-updates/api/version-switch-logic.js';
import { canConstructionNavigateBack } from '../../../editor/api/construction-enter-flow.js';
import {
    MobilePanelSwitcherChip,
    MobilePanelVersionCardChip,
    panelShowsBranchVersionChip,
} from './MobilePanelSwitcherChip.jsx';
import { MobileInlineTools } from './MobileInlineTools.jsx';
import {
    DefaultPanelHead,
    MoveHereButton,
    PanelAchievementBadge,
    PanelBackButton,
    PanelHeadEmoji,
    StackedBranchHead,
} from './mobile-panel-head-parts.jsx';

function ConstructPanelTitle({ current, ui, tree }) {
    const { graphUi } = tree;
    const inputRef = useRef(null);
    const rootName = current.type === 'root' ? curriculumTreeDisplayName(ui) : '';
    const title = current.type === 'root' ? rootName || current.name || '' : current.name || '';
    const inlineRenameId = graphUi?.inlineRenameNodeId;
    const canRenameTitle = !current._composedWrapper;
    const renaming =
        canRenameTitle &&
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

    if (panelShowsBranchVersionChip(current) && current.type !== 'root') {
        return <MobilePanelVersionCardChip current={current} ui={ui} />;
    }

    return (
        <span className="mobile-panel-title-row">
            <span
                className="mobile-panel-title mobile-panel-title-slot"
                title={title}
                onClick={(e) => {
                    if (!canRenameTitle || shouldShowMobileUI()) return;
                    e.preventDefault();
                    e.stopPropagation();
                    tree.startPanelTitleRename(current);
                }}
                onDoubleClick={(e) => {
                    if (!canRenameTitle) return;
                    e.preventDefault();
                    e.stopPropagation();
                    tree.startConstructionRename(current, title);
                }}
            >
                {title}
            </span>
        </span>
    );
}

/** Construction mode, rename, emoji, inline folder tools. */
export function ConstructPanelHead({ current, ui, tree, directChildSelected }) {
    const canWrite = fileSystem.features.canWrite;
    const pendingMoveNodeId = tree.graphUi?.pendingMoveNodeId;
    const hideInlineWhilePickingMove = pendingMoveNodeId != null && String(pendingMoveNodeId) !== '';
    const mobilePath = Array.isArray(tree.graphUi?.mobilePath) ? tree.graphUi.mobilePath.map(String) : [];
    const pathDepth = mobilePath.length || 0;
    const showBack =
        pathDepth > 1 && canWrite
            ? canConstructionNavigateBack({ mobilePath })
            : pathDepth > 1;

    const back = <PanelBackButton ui={ui} showBack={showBack} onBack={tree.navigatePanelBack} />;
    const headEmoji = (
        <PanelHeadEmoji
            current={current}
            ui={ui}
            isConstruct
            canWrite={canWrite}
            onEmojiPick={tree.openConstructionEmojiPicker}
        />
    );
    const titleCell = <ConstructPanelTitle current={current} ui={ui} tree={tree} />;
    const parentTools = canWrite ? (
        <MobileInlineTools
            node={current}
            compact
            folderContextDimmed={directChildSelected && !hideInlineWhilePickingMove}
            revealDelete={false}
            omitDelete
        />
    ) : null;
    const moveHere = <MoveHereButton folder={current} ui={ui} tree={tree} />;
    const achievementBadge = <PanelAchievementBadge current={current} ui={ui} />;

    if (
        panelShowsBranchVersionChip(current) &&
        (current?.type === 'branch' || current?.type === 'root')
    ) {
        const chromeBits = [back, headEmoji].filter(Boolean);
        return (
            <StackedBranchHead
                ui={ui}
                current={current}
                construct
                chrome={chromeBits.length ? <>{chromeBits}</> : null}
                chip={
                    <MobilePanelSwitcherChip
                        current={current}
                        ui={ui}
                        intent="version"
                        skipIcon
                    />
                }
                tools={parentTools}
                moveHere={moveHere}
            />
        );
    }

    return (
        <DefaultPanelHead
            construct
            back={back}
            headEmoji={headEmoji}
            titleCell={titleCell}
            achievementBadge={achievementBadge}
            parentTools={parentTools}
            moveHere={moveHere}
        />
    );
}
