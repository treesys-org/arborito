import { curriculumTreeDisplayName } from '../../../version-updates/api/version-switch-logic.js';
import {
    MobilePanelSwitcherChip,
    MobilePanelVersionCardChip,
    panelShowsBranchVersionChip,
} from './MobilePanelSwitcherChip.jsx';
import {
    DefaultPanelHead,
    ExplorePanelActions,
    MoveHereButton,
    PanelAchievementBadge,
    PanelBackButton,
    StackedBranchHead,
} from './mobile-panel-head-parts.jsx';

function ExplorePanelTitle({ current, ui, tree }) {
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

/** Browse / explore mode, forum, arcade, curriculum chip. */
export function ExplorePanelHead({ current, ui, tree, constructChrome = false }) {
    const mobilePath = Array.isArray(tree.graphUi?.mobilePath) ? tree.graphUi.mobilePath.map(String) : [];
    const pathDepth = mobilePath.length || 0;
    const showBack = pathDepth > 1;

    const back = <PanelBackButton ui={ui} showBack={showBack} onBack={tree.navigatePanelBack} />;
    const titleCell = <ExplorePanelTitle current={current} ui={ui} tree={tree} />;
    const actions = <ExplorePanelActions ui={ui} current={current} forumNavEnabled={tree.forumNavEnabled} />;
    const moveHere = <MoveHereButton folder={current} ui={ui} tree={tree} />;
    const achievementBadge = <PanelAchievementBadge current={current} ui={ui} />;

    if (tree.exploreShowsCurriculumChip(current)) {
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

    if (
        panelShowsBranchVersionChip(current) &&
        (current?.type === 'branch' || (constructChrome && current?.type === 'root'))
    ) {
        const branchChip = (
            <MobilePanelSwitcherChip
                current={current}
                ui={ui}
                intent="version"
                skipIcon={constructChrome}
            />
        );
        if (constructChrome) {
            return (
                <StackedBranchHead
                    ui={ui}
                    current={current}
                    construct
                    chrome={back}
                    chip={branchChip}
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
        <DefaultPanelHead
            construct={constructChrome}
            back={back}
            titleCell={titleCell}
            actions={actions}
            moveHere={moveHere}
            achievementBadge={achievementBadge}
        />
    );
}
