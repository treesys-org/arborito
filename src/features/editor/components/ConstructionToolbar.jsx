import { Fragment } from 'react';
import { useEditor } from '../hooks/useEditor.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { CurriculumLangPicker } from '../../sources/components/CurriculumLangPicker.jsx';
import { DOCK_SHEET_SCROLL } from '../../../shared/ui/dock-sheet-chrome.js';
import { LanguageIcon } from '../../../shared/ui/ArboritoIcons.jsx';
import { MmenuDrillRow, MmenuRootHero } from '../../../shared/ui/MmenuChrome.jsx';
import { ConstructionDockPublishButton, shortDockLabel } from './ConstructionDockPublishButton.jsx';

function ReadonlyDockBanner({ editScope, ui, canFork, onFork }) {
    if (editScope.scope !== 'readonly' || !editScope.dock.readonlyMessage) return null;
    const forkLabel = ui.constructionForkForEditButton || 'Copy to My Garden';
    return (
        <aside className="cp-dock-readonly-banner" aria-live="polite">
            <span className="cp-dock-readonly-banner__msg">{editScope.dock.readonlyMessage}</span>
            {editScope.dock.showFork && canFork !== false ? (
                <button type="button" id="btn-fork-for-edit" className="cp-dock-readonly-banner__action" onClick={onFork}>
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
    canShowPublish,
    canRetractPublicTree,
    canWriteMapEdit,
    showGovernanceTab,
    isContributor,
    constructionLangModalOpen,
    canForkForEdit,
    dockExitlessDesktop,
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
    const editor = useEditor();
    const {
        dismissModal,
        setModal,
        notify,
        update,
        setViewMode,
        constructionMode,
        editorActions,
    } = editor;

    const {
        canOfferCurriculumLanguageAdd,
        addCurriculumLanguageInteractive,
        setCurriculumEditLang,
    } = editorActions;

    const constructTitle = ui.navConstruct || 'Construction';
    const exitConstructL = ui.navConstructExit || ui.navBack || ui.close || 'Back';
    const undoL = ui.conUndoTooltip || ui.conUndoAria || 'Undo last map edit';
    const undoShort = ui.conUndoDockLabel || ui.conUndoLabel || 'Undo';
    const govTooltip = ui.conGovTooltip || ui.adminConsole || 'Governance';
    const govDockLbl = ui.conMoreRowGovernance || govTooltip;
    const retL = ui.revokePublicTreeDockTooltip || 'Retract public tree';
    const retShort = ui.revokePublicTreeDockLabel || 'Retract';
    const langDockL = ui.conLangDockTab || ui.conCurriculumLangLabel || 'Language';

    const publishButton = (
        <ConstructionDockPublishButton
            ui={ui}
            scopeKind={editScope.scope}
            canShowPublish={canShowPublish}
            publishingPublic={publishingPublic}
            revokingPublic={revokingPublic}
            onClick={onPublish}
        />
    );

    const curriculumTabBtn =
        showCurriculumTools ? (
            <button
                type="button"
                id="btn-cp-curriculum"
                data-arbor-tour="con-lang"
                className={`cp-dock-tab${constructionLangModalOpen ? ' cp-dock-tab--accent' : ''}`}
                title={langDockL}
                aria-label={langDockL}
                aria-expanded={constructionLangModalOpen}
                aria-haspopup="dialog"
                onClick={onCurriculum}
            >
                <span className="cp-dock-tab__curriculum-glyph cp-dock-tab__curriculum-glyph--svg" aria-hidden="true">
                    <LanguageIcon size={18} className="cp-dock-tab__lang-svg" />
                </span>
                <span className="cp-dock-tab__label">{shortDockLabel(langDockL)}</span>
            </button>
        ) : null;

    const governanceTabBtn = showGovernanceTab ? (
        <button
            type="button"
            id="btn-governance"
            data-arbor-tour="con-gov"
            className="cp-dock-tab cp-dock-tab--blue"
            title={govTooltip}
            aria-label={govTooltip}
            onClick={onGovernance}
        >
            <span className="cp-dock-tab__curriculum-glyph" aria-hidden="true">
                <ChromeEmoji emoji="🏛️" size={18} />
            </span>
            <span className="cp-dock-tab__label">{shortDockLabel(govDockLbl)}</span>
        </button>
    ) : null;

    const historyTabBtn = canWriteMapEdit ? (
        <button
            type="button"
            id="btn-construction-history"
            data-arbor-tour="con-undo"
            className="cp-dock-tab"
            title={undoL}
            aria-label={undoL}
            onClick={onHistory}
        >
            <span className="cp-dock-tab__curriculum-glyph" aria-hidden="true">
                <ChromeEmoji emoji="🕒" size={18} />
            </span>
            <span className="cp-dock-tab__label">{shortDockLabel(undoShort)}</span>
        </button>
    ) : null;

    if (useCompactDock) {
        const moreDockL = ui.conDockMore || 'More';
        const moreDockAria = ui.conDockMoreAria || moreDockL;
        const secCurriculum = ui.conMoreSectionCurriculum || ui.conCurriculumLangLabel || 'Languages';
        const rowGov = ui.conMoreRowGovernance || govTooltip;
        const secTools = ui.conMoreSectionTools || ui.menuSectionTools || 'More actions';
        const moreBackdropEnter = !moreToolsOpen || conMoreInstantReveal ? '' : ' animate-in fade-in';

        return (
            <div
                id="cp-dock-main"
                className="cp-dock-main construction-panel-host construction-panel-host--mob-dock"
                data-construction-dock
            >
                <div className="cp-construct-wrap" role="region" aria-label={ui.constructionDockAriaFallback || constructTitle}>
                    <ReadonlyDockBanner editScope={editScope} ui={ui} canFork={canForkForEdit} onFork={onFork} />

                    <div
                        id="cp-construct-more-backdrop"
                        className={`arborito-sheet-backdrop arborito-sheet-backdrop--mobile-more cp-construct-more-backdrop${moreBackdropEnter}${conMoreInstantReveal ? ' cp-construct-more-backdrop--instant' : ''}`}
                        aria-hidden={!moreToolsOpen}
                        hidden={!moreToolsOpen || undefined}
                        onClick={onMoreClose}
                    />

                    <div
                        id="cp-construct-more-pop"
                        className={`arborito-sheet arborito-sheet--mobile-more min-h-0 cp-construct-more-sheet${conMoreInstantReveal ? ' cp-construct-more-sheet--instant' : ''}`}
                        role="dialog"
                        aria-modal="true"
                        aria-label={moreDockAria}
                        hidden={!moreToolsOpen || undefined}
                    >
                        <MmenuRootHero
                            title={moreDockL}
                            backId="cp-more-close"
                            ariaLabel={ui.navBack || ui.close || 'Close'}
                            onBack={onMoreClose}
                        />
                        <div
                            className={`arborito-mmenu-scroll arborito-mmenu-pane-host ${DOCK_SHEET_SCROLL} cp-construct-more-mmenu-scroll`}
                            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 12px))' }}
                        >
                            {showCurriculumTools ? (
                                <div className="px-4 pt-4 w-full box-border" role="group" aria-label={secCurriculum}>
                                    <p className="arborito-menu-section">{secCurriculum}</p>
                                    <div className="cp-construct-more__field">
                                        <span className="cp-construct-more__field-lb">
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
                                        id="cp-more-governance"
                                        glyph="🏛️"
                                        label={rowGov}
                                        role="menuitem"
                                        onClick={onGovernanceFromMore}
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
                        </div>
                    </div>

                    <nav className="arborito-mob-dock arborito-mob-dock--floating" aria-label={ui.constructionDockAriaFallback || 'Tools'}>
                        <button
                            type="button"
                            id="btn-back-construct"
                            data-arbor-tour="con-exit"
                            className="arborito-mob-tab"
                            title={exitConstructL}
                            aria-label={exitConstructL}
                            onClick={onBack}
                        >
                            <span className="arborito-mob-tab__icon" aria-hidden="true">
                                ←
                            </span>
                            <span className="arborito-mob-tab__label">{shortDockLabel(exitConstructL)}</span>
                        </button>

                        {canWriteMapEdit ? (
                            <button
                                type="button"
                                id="btn-construction-history"
                                data-arbor-tour="con-undo"
                                className="arborito-mob-tab"
                                title={undoL}
                                aria-label={undoL}
                                onClick={onHistory}
                            >
                                <span className="arborito-mob-tab__icon" aria-hidden="true">
                                    <ChromeEmoji emoji="🕒" size={22} />
                                </span>
                                <span className="arborito-mob-tab__label">{shortDockLabel(undoShort)}</span>
                            </button>
                        ) : null}

                        {canWriteMapEdit ? (
                            <button
                                type="button"
                                id="btn-construction-sage"
                                data-arbor-tour="con-ai"
                                className="arborito-mob-tab"
                                title={ui.navSage || 'Sage'}
                                aria-label={ui.navSage || 'Sage'}
                                onClick={onSage}
                            >
                                <span className="arborito-mob-tab__icon" aria-hidden="true">
                                    <ChromeEmoji emoji="🦉" size={22} />
                                </span>
                                <span className="arborito-mob-tab__label">
                                    {shortDockLabel(ui.navSageDock || ui.navSage || 'Sage')}
                                </span>
                            </button>
                        ) : showGovernanceTab ? (
                            <button
                                type="button"
                                id="btn-governance"
                                data-arbor-tour="con-gov"
                                className="arborito-mob-tab"
                                title={govTooltip}
                                aria-label={govTooltip}
                                onClick={onGovernance}
                            >
                                <span className="arborito-mob-tab__icon" aria-hidden="true">
                                    <ChromeEmoji emoji="🏛️" size={22} />
                                </span>
                                <span className="arborito-mob-tab__label">{shortDockLabel(govDockLbl)}</span>
                            </button>
                        ) : null}

                        <ConstructionDockPublishButton
                            ui={ui}
                            scopeKind={editScope.scope}
                            canShowPublish={canShowPublish}
                            publishingPublic={publishingPublic}
                            revokingPublic={revokingPublic}
                            variant="mob"
                            onClick={onPublish}
                        />

                        <button
                            type="button"
                            id="btn-cp-more-tools"
                            data-arbor-tour="con-more"
                            className={`arborito-mob-tab${moreToolsOpen ? ' arborito-mob-tab--active' : ''}`}
                            aria-expanded={moreToolsOpen}
                            aria-haspopup="true"
                            title={moreDockAria}
                            aria-label={moreDockAria}
                            onClick={onMoreToggle}
                        >
                            <span className="arborito-mob-tab__icon arborito-mob-tab__icon--menu" aria-hidden="true">
                                ☰
                            </span>
                            <span className="arborito-mob-tab__label">{shortDockLabel(moreDockL)}</span>
                        </button>
                    </nav>
                </div>
            </div>
        );
    }

    const contributorScrollTabs = [];
    if (isContributor) {
        if (canWriteMapEdit) {
            contributorScrollTabs.push(
                <Fragment key="history">{historyTabBtn}</Fragment>,
                <Fragment key="curriculum">{curriculumTabBtn}</Fragment>
            );
        }
        if (showGovernanceTab) {
            contributorScrollTabs.push(<Fragment key="governance">{governanceTabBtn}</Fragment>);
        }
        contributorScrollTabs.push(<Fragment key="publish">{publishButton}</Fragment>);
    }

    const govOnlyDockTabs =
        showGovernanceTab && !canWriteMapEdit ? (
            <>
                {governanceTabBtn}
                {publishButton}
            </>
        ) : null;

    const scrollInner = isContributor ? contributorScrollTabs : govOnlyDockTabs || publishButton;

    return (
        <div id="cp-dock-main" className="cp-dock-main construction-panel-host" data-construction-dock>
            <div className="cp-dock-stack" role="region" aria-label={ui.constructionDockAriaFallback || constructTitle}>
                <ReadonlyDockBanner editScope={editScope} ui={ui} canFork={canForkForEdit} onFork={onFork} />
                <div className="cp-dock-row">
                    {!dockExitlessDesktop ? (
                        <button
                            type="button"
                            id="btn-back-construct"
                            data-arbor-tour="con-exit"
                            className="cp-dock-tab cp-dock-tab--edge"
                            title={exitConstructL}
                            aria-label={exitConstructL}
                            onClick={onBack}
                        >
                            <span className="cp-dock-tab__label">←</span>
                        </button>
                    ) : null}
                    <div className="cp-dock-scroll-wrap">
                        <div
                            className="cp-dock-scroll custom-scrollbar"
                            role="toolbar"
                            aria-label={ui.constructionDockAriaFallback || 'Tools'}
                        >
                            {scrollInner}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export { LessonEditorToolbarContent } from './LessonEditorToolbarBridge.jsx';
