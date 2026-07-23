import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { ModalBackChevronIcon } from '../../../../app/components/ModalHero.jsx';
import { useBindMobileTapRef } from '../../../../shared/ui/useBindMobileTap.js';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { useCallback, useRef } from 'react';
import { resolveBranchPanelIcon } from '../../api/logic/graph-mobile-panel-helpers.js';
import { isFolderAchievementEarned } from '../../../garden-progress/api/achievement-folder-status.js';

export function PanelBackButton({ ui, showBack, onBack }) {
    const mobile = shouldShowMobileUI();
    const btnRef = useRef(null);
    const handleBack = useCallback(() => onBack?.(), [onBack]);
    useBindMobileTapRef(btnRef, handleBack, mobile);
    if (!showBack) return null;
    const label = ui.navBack || ui.close || 'Back';
    return (
        <button
            ref={btnRef}
            type="button"
            className="arborito-mmenu-back mobile-panel-back shrink-0"
            aria-label={label}
            title={label}
            onClick={mobile ? undefined : handleBack}
        >
            <ModalBackChevronIcon />
        </button>
    );
}

export function PanelHeadEmoji({ current, ui, isConstruct, canWrite, onEmojiPick }) {
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

export function ExplorePanelActions({ ui, current, forumNavEnabled }) {
    const { setModal } = useTreeGraph();
    const forumLbl = ui.navForum || 'Forum';
    const arcadeLbl = ui.mobileArcadeCta || ui.navArcade || 'Arcade';
    return (
        <div className="mobile-panel-actions">
            {forumNavEnabled ? (
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
                    <span className="mobile-panel-cta__label">{forumLbl}</span>
                    <ChromeEmoji emoji="💬" size={16} className="mobile-panel-cta__icon arborito-emoji-glyph" />
                </button>
            ) : null}
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
                <span className="mobile-panel-cta__label">{arcadeLbl}</span>
                <ChromeEmoji emoji="🎮" size={16} className="mobile-panel-cta__icon arborito-emoji-glyph" />
            </button>
        </div>
    );
}

export function MoveHereButton({ folder, ui, tree }) {
    if (!tree.shouldShowMoveHereInPanel(folder)) return null;
    const label = ui.moveHereInFolder || 'Move here';
    return (
        <div className="mobile-panel-move-here-wrap">
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

export function StackedBranchHead({ ui, current, construct, toolbar, chrome, chip, tools, moveHere, headExtraClass = '' }) {
    const regionLabel = current?.name || ui.graphFolder || ui.sourcesPillBranch || 'Folder';
    const headClass = `mobile-panel-head mobile-panel-head--branch${construct ? ' mobile-panel-head--branch-construct' : ''}${headExtraClass}`;
    const hasChrome = chrome != null && chrome !== false;
    const hasTools = tools != null && tools !== false;
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

export function PanelAchievementBadge({ current, ui }) {
    if (!current?.isCertifiable) return null;
    if (current.type !== 'branch' && current.type !== 'root') return null;
    const earned = isFolderAchievementEarned(current);
    const hint = earned
        ? ui.graphAchievementEarnedHint || 'Achievement earned'
        : ui.graphAchievementPendingHint || 'Achievement available when you finish every lesson in this folder';
    return (
        <span
            className={`mobile-panel-achievement-badge${
                earned ? ' mobile-panel-achievement-badge--earned' : ' mobile-panel-achievement-badge--locked'
            }`}
            aria-label={hint}
        >
            <ChromeEmoji emoji="🏆" size={16} className="arborito-emoji-glyph" />
        </span>
    );
}

export function DefaultPanelHead({ construct, back, headEmoji, titleCell, parentTools, actions, moveHere, achievementBadge }) {
    return (
        <div className={`mobile-panel-head${construct ? ' mobile-panel-head--construction' : ''}`}>
            <div className="mobile-panel-header">
                {back}
                {headEmoji}
                {titleCell}
                {achievementBadge}
                {parentTools}
                {actions}
            </div>
            {moveHere}
        </div>
    );
}
