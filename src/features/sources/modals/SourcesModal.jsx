import { useSourcesModal } from '../hooks/useSourcesModal.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { TabBar } from '../../../app/components/TabBar.jsx';
import { SourcesTreeEditor } from './SourcesTreeEditor.jsx';
import { SourcesTreesTab } from './components/SourcesTreesTab.jsx';
import { SourcesDeleteOverlay } from './components/SourcesDeleteOverlay.jsx';
import { SourcesTabFooter } from './components/SourcesTabFooter.jsx';
import { SourcesBranchesPanel } from './components/SourcesBranchesPanel.jsx';

export function ModalSources({ embed = false }) {
    const {
        ui,
        state,
        sources,
        mobile,
        rootRef,
        onAction,
        mainTab,
        mainTabs,
        tabSubtitle,
        switchMainTab,
        close,
        fromOnboarding,
    } = useSourcesModal(embed);

    const bodyInner = (
        <div className="arborito-sources-body relative isolate flex flex-col flex-1 min-h-0 overflow-hidden">
            <div
                id="tab-content"
                className={`flex-1 flex flex-col min-h-0 overflow-hidden relative z-0${sources.overlay === 'tree-editor' ? ' hidden' : ''}`}
                aria-hidden={sources.overlay === 'tree-editor' ? 'true' : 'false'}
            >
                <div
                    id="tab-content-scroll"
                    className={
                        mobile
                            ? 'flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 pt-3 pb-2 min-h-0 pr-1'
                            : 'flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar min-h-0'
                    }
                >
                    <div data-arbor-tour="sources-main-tabs">
                        <TabBar
                            tabs={mainTabs}
                            activeTab={mainTab}
                            onTabChange={switchMainTab}
                            ariaLabel={ui.sourcesMainTabsAria || 'Library'}
                        />
                        <p className="m-0 mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {tabSubtitle}
                        </p>
                    </div>
                    {mainTab === 'trees' ? (
                        <SourcesTreesTab
                            ui={ui}
                            state={state}
                            mainTab={mainTab}
                            treesQ={sources.treesQ}
                            setTreesQ={sources.setTreesQ}
                            treesScope={sources.treesScope}
                            setTreesScope={sources.setTreesScope}
                            treesAdvancedOpen={sources.treesAdvancedOpen}
                            setTreesAdvancedOpen={sources.setTreesAdvancedOpen}
                            globalDirRows={sources.globalDirRows}
                            globalDirMetrics={sources.globalDirMetrics}
                            globalDirLoading={sources.globalDirLoading}
                            globalDirError={sources.globalDirError}
                            globalDirUiTruncated={sources.globalDirUiTruncated}
                            sourcesTreeLoading={sources.sourcesTreeLoading}
                            rowActionsOpen={sources.rowActionsOpen}
                            collectCtx={sources.collectCtx}
                            onAction={onAction}
                            onToggleRowActions={sources.toggleRowActions}
                            onSwitchTab={switchMainTab}
                        />
                    ) : (
                        <SourcesBranchesPanel
                            ui={ui}
                            state={state}
                            sourcesQ={sources.sourcesQ}
                            setSourcesQ={sources.setSourcesQ}
                            sourcesScope={sources.sourcesScope}
                            setSourcesScope={sources.setSourcesScope}
                            sourcesAdvancedOpen={sources.sourcesAdvancedOpen}
                            setSourcesAdvancedOpen={sources.setSourcesAdvancedOpen}
                            globalDirFilter={sources.globalDirFilter}
                            globalDirLoading={sources.globalDirLoading}
                            globalDirError={sources.globalDirError}
                            globalDirUiTruncated={sources.globalDirUiTruncated}
                            treeFreezeBusy={sources.treeFreezeBusy}
                            rowActionsOpen={sources.rowActionsOpen}
                            toggleRowActions={sources.toggleRowActions}
                            getBranchesTabRows={sources.getBranchesTabRows}
                            bump={sources.bump}
                            onAction={onAction}
                        />
                    )}
                </div>
                <div id="sources-tab-foot" className="arborito-sources-tab-foot shrink-0 px-4 pb-4 pt-2">
                    <SourcesTabFooter ui={ui} mainTab={mainTab} onAction={onAction} />
                </div>
            </div>
            <div
                id="overlay-container"
                className={`absolute inset-0 z-[200] ${sources.overlay ? '' : 'hidden pointer-events-none'}`}
                aria-hidden={sources.overlay ? 'false' : 'true'}
            >
                {sources.overlay === 'delete' ? (
                    <SourcesDeleteOverlay
                        ui={ui}
                        onCancel={() => onAction('cancel-overlay')}
                        onConfirm={() => onAction('confirm-delete')}
                    />
                ) : null}
                {sources.overlay === 'tree-editor' ? (
                    <SourcesTreeEditor
                        treeEditor={sources.treeEditor}
                        setTreeEditor={sources.setTreeEditor}
                        ui={ui}
                        mobile={mobile}
                        onClose={() => {
                            sources.setOverlay(null);
                            sources.setTreeEditor(null);
                            sources.bump();
                        }}
                    />
                ) : null}
            </div>
        </div>
    );

    if (embed) {
        return (
            <div
                ref={rootRef}
                data-arborito-panel="modal-sources"
                data-embed="1"
                className="arborito-sources-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden"
            >
                <div className="arborito-sources-modal-shell arborito-sources-modal-shell--embed w-full relative flex flex-col min-h-0 flex-1 isolate overflow-hidden">
                    {bodyInner}
                </div>
            </div>
        );
    }

    const leadingIcon = fromOnboarding ? (
        <button
            type="button"
            className="btn-close arborito-mmenu-back shrink-0"
            aria-label={ui.onboardingBack || ui.navBack || 'Back'}
            title={ui.onboardingBack || ui.navBack || 'Back'}
            onClick={close}
        >
            ←
        </button>
    ) : (
        <span className="text-2xl leading-none" aria-hidden="true">
            📚
        </span>
    );

    return (
        <div ref={rootRef} data-arborito-panel="modal-sources">
            <DockModalShell
                mobile={mobile}
                sizeTier="HUB"
                rootClass="arborito-sources-modal-shell"
                skipBodyWrap
                onBackdropClick={close}
                hero={
                    <ModalHubHero
                        mobile={mobile}
                        title={ui.sourceManagerTitle}
                        subtitle={ui.sourceManagerDesc}
                        showClose={!mobile && !fromOnboarding}
                        showBack={fromOnboarding ? false : undefined}
                        leadingIcon={leadingIcon}
                        onClose={close}
                    />
                }
            >
                {bodyInner}
            </DockModalShell>
        </div>
    );
}

export { ModalSources as default };
