import { Fragment } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { prefetchModal } from '../../../app/modal-open.js';
import { useEditor } from '../hooks/useEditor.js';
import { CurriculumLangPicker } from '../../sources/components/CurriculumLangPicker.jsx';
import { LanguageIcon } from '../../../shared/ui/ArboritoIcons.jsx';
import { MmenuDrillRow } from '../../../shared/ui/MmenuChrome.jsx';
import { MobDockBar } from '../../../shared/ui/MobDockBar.jsx';
import { MobDockTab } from '../../../shared/ui/MobDockTab.jsx';
import { MobMoreSheet } from '../../../shared/ui/MobMoreSheet.jsx';
import { DockHubPanelLayer } from '../../../app/components/DockHubPanelLayer.jsx';
import { ConstructionDockPublishButton } from './ConstructionDockPublishButton.jsx';

function ReadonlyDockBanner({ editScope, ui, canFork, onFork }) {
    if (editScope.scope !== 'readonly' || !editScope.dock.readonlyMessage) return null;
    const forkLabel = ui.constructionForkForEditButton || 'Copy to My Garden';
    return (
        <aside className="construction-readonly-banner" aria-live="polite">
            <span className="construction-readonly-banner__msg">{editScope.dock.readonlyMessage}</span>
            {editScope.dock.showFork && canFork !== false ? (
                <button type="button" id="btn-fork-for-edit" className="construction-readonly-banner__action" onClick={onFork}>
                    {forkLabel}
                </button>
            ) : null}
        </aside>
    );
}

function resolveCurriculumSelectDisplayKey(curriculumEditLang, langKeys, appLang) {
    if (!langKeys.length) return '';
    if (curriculumEditLang && langKeys.includes(curriculumEditLang)) return curriculumEditLang;
    const al = appLang && String(appLang);
    if (al && langKeys.includes(al)) return al;
    return langKeys[0];
}

function CurriculumLangSelect({
    ui,
    langKeys,
    curriculumEditLang,
    appLang,
    constructionMode,
    canOfferCurriculumLanguageAdd,
    addCurriculumLanguageInteractive,
    setCurriculumEditLang,
    onPickAdd,
}) {
    const displayKey = resolveCurriculumSelectDisplayKey(curriculumEditLang, langKeys, appLang);
    const selectValue =
        curriculumEditLang && langKeys.includes(curriculumEditLang) ? curriculumEditLang : displayKey;
    const canAdd = constructionMode && canOfferCurriculumLanguageAdd();
    const fieldLb = ui.conCurriculumLangLabel || 'Content language';

    return (
        <CurriculumLangPicker
            langKeys={langKeys}
            value={selectValue}
            ariaLabel={fieldLb}
            compact
            canAdd={canAdd}
            addLabel={ui.conCurriculumLangAddOption || ui.conMoreRowAddLang || '+ Add language…'}
            onChange={(code) => setCurriculumEditLang(code || null)}
            onPickAdd={() => {
                onPickAdd?.();
                addCurriculumLanguageInteractive({ fromConstructionMore: true });
            }}
        />
    );
}

/** Construction dock tabs always use short labels (same row density as browse). */
function ConstructionDockTab(props) {
    return <MobDockTab truncateLabel {...props} />;
}

export function ConstructionToolbar({
    ui,
    editScope,
    useCompactDock,
    moreToolsOpen,
    conMoreInstantReveal,
    showCurriculumTools,
    langKeys,
    curriculumEditLang,
    appLang,
    publishingPublic,
    revokingPublic,
    openingPublishHub,
    canShowPublish,
    canRetractPublicTree,
    canWriteMapEdit,
    showGovernanceTab,
    isContributor,
    constructionLangModalOpen,
    canForkForEdit,
    dockExitlessDesktop,
    sageDockActive,
    historyDockActive,
    publishDockActive,
    onBack,
    onFork,
    onHistory,
    onSage,
    onCurriculum,
    onMoreToggle,
    onMoreClose,
    onGovernance,
    onGovernanceFromMore,
    onRetract,
    onPublish,
    onCurriculumLangAdd,
}) {
    const { constructionMode, editorActions } = useEditor();
    const {
        canOfferCurriculumLanguageAdd,
        addCurriculumLanguageInteractive,
        setCurriculumEditLang,
    } = editorActions;

    const constructTitle = ui.constructionDockAriaFallback || ui.navConstruct || 'Construction';
    const exitConstructL = ui.navConstructExit || ui.navBack || ui.close || 'Back';
    const undoL = ui.conUndoTooltip || ui.conUndoAria || 'Undo last map edit';
    const undoShort = ui.conUndoDockLabel || ui.conUndoLabel || 'Undo';
    const govTooltip = ui.conGovTooltip || ui.adminConsole || 'Governance';
    const govDockLbl = ui.conMoreRowGovernance || govTooltip;
    const retL = ui.revokePublicTreeDockTooltip || 'Retract public tree';
    const retShort = ui.revokePublicTreeDockLabel || 'Retract';
    const langDockL = ui.conLangDockTab || ui.conCurriculumLangLabel || 'Language';
    const moreDockL = ui.conDockMore || 'More';
    const moreDockAria = ui.conDockMoreAria || moreDockL;

    const publishButton = (
        <ConstructionDockPublishButton
            ui={ui}
            scopeKind={editScope.scope}
            canShowPublish={canShowPublish}
            publishingPublic={publishingPublic}
            revokingPublic={revokingPublic}
            openingPublishHub={openingPublishHub}
            publishHubActive={publishDockActive}
            onClick={onPublish}
        />
    );

    const dockTabs = [];

    if (!dockExitlessDesktop) {
        dockTabs.push(
            <ConstructionDockTab
                key="back"
                id="btn-back-construct"
                tour="con-exit"
                title={exitConstructL}
                onClick={onBack}
                icon="←"
                label={exitConstructL}
            />
        );
    }

    if (canWriteMapEdit) {
        dockTabs.push(
            <ConstructionDockTab
                key="history"
                id="btn-construction-history"
                tour="con-undo"
                active={historyDockActive}
                title={undoL}
                onClick={onHistory}
                icon={<ChromeEmoji emoji="🕒" size={22} />}
                label={undoShort}
            />
        );
    }

    if (useCompactDock) {
        if (canWriteMapEdit) {
            dockTabs.push(
                <ConstructionDockTab
                    key="sage"
                    id="btn-construction-sage"
                    tour="con-ai"
                    active={sageDockActive}
                    title={ui.navSage || 'Sage'}
                    onClick={onSage}
                    icon={<ChromeEmoji emoji="🦉" size={22} />}
                    label={ui.navSageDock || ui.navSage || 'Sage'}
                />
            );
        } else if (showGovernanceTab) {
            dockTabs.push(
                <ConstructionDockTab
                    key="governance"
                    id="btn-governance"
                    tour="con-gov"
                    variant="blue"
                    title={govTooltip}
                    onClick={onGovernance}
                    onPointerEnter={() => prefetchModal('contributor')}
                    icon={<ChromeEmoji emoji="🏛️" size={22} />}
                    label={govDockLbl}
                />
            );
        }

        if (publishButton) dockTabs.push(<Fragment key="publish">{publishButton}</Fragment>);

        dockTabs.push(
            <ConstructionDockTab
                key="more"
                id="btn-construction-more"
                tour="con-more"
                active={moreToolsOpen}
                title={moreDockAria}
                ariaLabel={moreDockAria}
                ariaExpanded={moreToolsOpen}
                ariaHaspopup="true"
                onClick={onMoreToggle}
                icon="☰"
                label={moreDockL}
            />
        );
    } else if (isContributor) {
        if (canWriteMapEdit && showCurriculumTools) {
            dockTabs.push(
                <ConstructionDockTab
                    key="curriculum"
                    id="btn-construction-curriculum"
                    tour="con-lang"
                    variant={constructionLangModalOpen ? 'accent' : undefined}
                    title={langDockL}
                    ariaLabel={langDockL}
                    ariaExpanded={constructionLangModalOpen}
                    ariaHaspopup="dialog"
                    onClick={onCurriculum}
                    icon={<LanguageIcon size={18} className="arborito-mob-tab__lang-svg" />}
                    label={langDockL}
                />
            );
        }
        if (showGovernanceTab) {
            dockTabs.push(
                <ConstructionDockTab
                    key="governance"
                    id="btn-governance"
                    tour="con-gov"
                    variant="blue"
                    title={govTooltip}
                    onClick={onGovernance}
                    onPointerEnter={() => prefetchModal('contributor')}
                    icon={<ChromeEmoji emoji="🏛️" size={22} />}
                    label={govDockLbl}
                />
            );
        }
        if (publishButton) dockTabs.push(<Fragment key="publish">{publishButton}</Fragment>);
    } else if (showGovernanceTab) {
        dockTabs.push(
            <ConstructionDockTab
                key="governance"
                id="btn-governance"
                tour="con-gov"
                variant="blue"
                title={govTooltip}
                onClick={onGovernance}
                onPointerEnter={() => prefetchModal('contributor')}
                icon={<ChromeEmoji emoji="🏛️" size={22} />}
                label={govDockLbl}
            />
        );
        if (publishButton) dockTabs.push(<Fragment key="publish">{publishButton}</Fragment>);
    } else if (publishButton) {
        dockTabs.push(<Fragment key="publish">{publishButton}</Fragment>);
    }

    const moreFreshEnter = moreToolsOpen && !conMoreInstantReveal;
    const secCurriculum = ui.conMoreSectionCurriculum || ui.conCurriculumLangLabel || 'Languages';
    const rowGov = ui.conMoreRowGovernance || govTooltip;
    const secTools = ui.conMoreSectionTools || ui.menuSectionTools || 'More actions';

    return (
        <div
            id="construction-dock-host"
            className={`construction-panel-host${useCompactDock ? ' construction-panel-host--mob-dock' : ' construction-panel-host--float-dock'}`}
            data-construction-dock
        >
            <div className="construction-dock-inner" role="region" aria-label={constructTitle}>
                <ReadonlyDockBanner editScope={editScope} ui={ui} canFork={canForkForEdit} onFork={onFork} />

                {useCompactDock ? (
                    <MobMoreSheet
                        open={moreToolsOpen}
                        freshEnter={moreFreshEnter}
                        instantReveal={conMoreInstantReveal}
                        backdropId="construction-more-backdrop"
                        sheetId="construction-more-sheet"
                        ariaLabel={moreDockAria}
                        onBackdropClose={onMoreClose}
                        ui={ui}
                        title={moreDockL}
                        backId="construction-more-close"
                        backAriaLabel={ui.navBack || ui.close || 'Close'}
                        onBack={onMoreClose}
                    >
                        {showCurriculumTools ? (
                            <div className="px-4 pt-4 w-full box-border" role="group" aria-label={secCurriculum}>
                                <p className="arborito-menu-section">{secCurriculum}</p>
                                <div className="construction-more__field">
                                    <span className="construction-more__field-lb">
                                        {ui.conCurriculumLangLabel || 'Content language'}
                                    </span>
                                    <CurriculumLangSelect
                                        ui={ui}
                                        langKeys={langKeys}
                                        curriculumEditLang={curriculumEditLang}
                                        appLang={appLang}
                                        constructionMode={constructionMode}
                                        canOfferCurriculumLanguageAdd={canOfferCurriculumLanguageAdd}
                                        addCurriculumLanguageInteractive={addCurriculumLanguageInteractive}
                                        setCurriculumEditLang={setCurriculumEditLang}
                                        onPickAdd={onCurriculumLangAdd}
                                    />
                                </div>
                            </div>
                        ) : null}
                        {showCurriculumTools ? (
                            <hr className="arborito-mmenu-divider mx-4 box-border" aria-hidden="true" />
                        ) : null}
                        <div className={`px-4 w-full box-border${showCurriculumTools ? '' : ' pt-4'}`}>
                            <p className="arborito-menu-section">{secTools}</p>
                        </div>
                        <div className="px-4 w-full box-border pb-1">
                            {showGovernanceTab ? (
                                <MmenuDrillRow
                                    id="construction-more-governance"
                                    glyph="🏛️"
                                    label={rowGov}
                                    role="menuitem"
                                    onClick={onGovernanceFromMore}
                                    onPointerEnter={() => prefetchModal('contributor')}
                                />
                            ) : null}
                            {canRetractPublicTree ? (
                                <MmenuDrillRow
                                    id="btn-retract-public-tree"
                                    glyph={revokingPublic ? '⏳' : '🛑'}
                                    label={revokingPublic ? '…' : retShort}
                                    extraClass="arborito-mmenu-drill-row--danger"
                                    role="menuitem"
                                    title={retL}
                                    ariaLabel={retL}
                                    disabled={revokingPublic}
                                    onClick={onRetract}
                                />
                            ) : null}
                        </div>
                    </MobMoreSheet>
                ) : null}

                <DockHubPanelLayer surface="construction" />

                <MobDockBar ariaLabel={constructTitle} floating={!useCompactDock}>
                    {dockTabs}
                </MobDockBar>
            </div>
        </div>
    );
}
