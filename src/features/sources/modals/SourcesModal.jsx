import '../styles/sources.css';
import { useSourcesModal } from '../hooks/useSourcesModal.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero, ModalBackChevronIcon } from '../../../app/components/ModalHero.jsx';
import { TabBar } from '../../../app/components/TabBar.jsx';
import { SourcesTreeEditor } from './SourcesTreeEditor.jsx';
import { SourcesForestTab } from './components/SourcesForestTab.jsx';
import { SourcesDeleteOverlay } from './components/SourcesDeleteOverlay.jsx';
import { SourcesCreateKindOverlay } from './components/SourcesCreateKindOverlay.jsx';
import { ExportCurriculumSheet } from './components/ExportCurriculumSheet.jsx';
import { SourcesTabFooter } from './components/SourcesTabFooter.jsx';
import { SourcesBranchesPanel } from './components/SourcesBranchesPanel.jsx';
import { SourcesLibraryBanner } from './components/SourcesLibraryBanner.jsx';
import { dismissLocalModeBanner } from '../api/local-mode-banner-prefs.js';

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
        switchMainTab,
        close,
        closeBlocked,
        modal,
        sourcesApp,
    } = useSourcesModal(embed);

    const sourcesChildModal = (type, extra = {}) => {
        const payload = { type, fromSources: true, ...extra };
        if (modal && typeof modal === 'object' && modal.fromOnboarding) {
            payload.fromOnboarding = modal.fromOnboarding;
        }
        return payload;
    };

    const openPrivacyFromSources = () => {
        sourcesApp.setModal?.(sourcesChildModal('privacy'));
    };

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
                            ? 'flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-0 pt-0 pb-2 min-h-0'
                            : 'flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar min-h-0'
                    }
                >
                    <div className="px-4">
                        <SourcesLibraryBanner
                            ui={ui}
                            onOpenPrivacy={openPrivacyFromSources}
                            onDismissLocal={() => {
                                dismissLocalModeBanner();
                                sources.bump();
                            }}
                        />
                        <div data-arbor-tour="sources-main-tabs">
                            {mainTab === 'trees' ? (
                                <div className="flex items-center gap-2 min-h-11">
                                    <button
                                        type="button"
                                        className="arborito-mmenu-back shrink-0"
                                        aria-label={ui.navBack || 'Back'}
                                        data-arbor-tour="sources-combined-back"
                                        onClick={() => switchMainTab('mine')}
                                    >
                                        <ModalBackChevronIcon />
                                    </button>
                                    <p className="m-0 text-sm font-extrabold text-slate-900 dark:text-white truncate">
                                        {ui.sourcesCombinedTitle ||
                                            ui.sourcesTabTrees ||
                                            'Combined courses'}
                                    </p>
                                </div>
                            ) : (
                                <TabBar
                                    tabs={mainTabs}
                                    activeTab={mainTab}
                                    onTabChange={switchMainTab}
                                    ariaLabel={ui.sourcesMainTabsAria || 'Library'}
                                />
                            )}
                        </div>
                    </div>
                    {mainTab === 'trees' ? (
                        <SourcesForestTab
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
                            globalDirHitCap={sources.globalDirHitCap}
                            sourcesTreeLoading={sources.sourcesTreeLoading}
                            rowActionsOpen={sources.rowActionsOpen}
                            collectCtx={sources.collectCtx}
                            bump={sources.bump}
                            onAction={onAction}
                            onToggleRowActions={sources.toggleRowActions}
                            onSwitchTab={switchMainTab}
                            onLoadMoreCatalog={sources.loadMoreDirectoryCatalog}
                        />
                    ) : (
                        <SourcesBranchesPanel
                            ui={ui}
                            state={state}
                            mainTab={mainTab}
                            sourcesQ={sources.sourcesQ}
                            setSourcesQ={sources.setSourcesQ}
                            sourcesScope={sources.sourcesScope}
                            setSourcesScope={sources.setSourcesScope}
                            sourcesAdvancedOpen={sources.sourcesAdvancedOpen}
                            setSourcesAdvancedOpen={sources.setSourcesAdvancedOpen}
                            sourcesKindFilter={sources.sourcesKindFilter}
                            setSourcesKindFilter={sources.setSourcesKindFilter}
                            globalDirFilter={sources.globalDirFilter}
                            globalDirLoading={sources.globalDirLoading}
                            globalDirError={sources.globalDirError}
                            globalDirHitCap={sources.globalDirHitCap}
                            globalDirMetrics={sources.globalDirMetrics}
                            treeFreezeBusy={sources.treeFreezeBusy}
                            sourcesTreeLoading={sources.sourcesTreeLoading}
                            rowActionsOpen={sources.rowActionsOpen}
                            toggleRowActions={sources.toggleRowActions}
                            collectCtx={sources.collectCtx}
                            onAction={onAction}
                            onSwitchTab={switchMainTab}
                            onLoadMoreCatalog={sources.loadMoreDirectoryCatalog}
                        />
                    )}
                </div>
                <div id="sources-tab-foot" className="arborito-sources-tab-foot shrink-0">
                    <SourcesTabFooter
                        ui={ui}
                        mainTab={mainTab}
                        onAction={onAction}
                    />
                </div>
            </div>
        </div>
    );

    /* Full-shell overlay (hero + body). Must not live inside the scroll body or the sheet clips. */
    const sourcesOverlay = (
        <div
            id="overlay-container"
            className={`arborito-sources-overlay absolute inset-0 z-[200] ${sources.overlay ? '' : 'hidden pointer-events-none'}`}
            aria-hidden={sources.overlay ? 'false' : 'true'}
        >
            {sources.overlay === 'create-kind' ? (
                <SourcesCreateKindOverlay
                    ui={ui}
                    onCancel={() => onAction('cancel-overlay')}
                    onCourse={(name) => {
                        onAction('create-course-named', { name });
                    }}
                    onPlaylist={(name) => {
                        onAction('create-composed-tree', { name });
                    }}
                />
            ) : null}
            {sources.overlay === 'delete' ? (
                <SourcesDeleteOverlay
                    ui={ui}
                    title={sources.deleteOverlayTitle}
                    body={sources.deleteOverlayBody}
                    onCancel={() => onAction('cancel-overlay')}
                    onConfirm={() => onAction('confirm-delete')}
                />
            ) : null}
            {sources.overlay === 'delete-composed-tree' ? (
                <SourcesDeleteOverlay
                    ui={ui}
                    title={sources.deleteOverlayTitle ?? ui.sourcesDeleteComposedTreeConfirm}
                    body={sources.deleteOverlayBody}
                    showAlsoMembers={!!sources.deleteAlsoMembersOption}
                    alsoMembersDefault={sources.deleteAlsoMembersDefault !== false}
                    alsoMembersLabel={
                        ui.sourcesDeleteComposedAlsoMembers || 'Also remove its courses'
                    }
                    onCancel={() => onAction('cancel-overlay')}
                    onConfirm={(opts) => onAction('confirm-delete-composed-tree', opts || {})}
                />
            ) : null}
            {sources.overlay === 'stop-private-sync' ? (
                <SourcesDeleteOverlay
                    ui={ui}
                    title={
                        sources.deleteOverlayTitle ||
                        ui.privateTreesStopSyncTitle ||
                        'Stop syncing?'
                    }
                    body={
                        sources.deleteOverlayBody ||
                        ui.privateTreesStopSyncBody ||
                        'Other devices you sign in on will no longer see this tree. The local copy on this device stays.'
                    }
                    confirmLabel={ui.privateTreesStopSyncShort || ui.privateTreesStopSync || 'Stop sync'}
                    onCancel={() => onAction('cancel-overlay')}
                    onConfirm={() => onAction('confirm-stop-private-sync')}
                />
            ) : null}
            {sources.overlay === 'stop-private-composed-sync' ? (
                <SourcesDeleteOverlay
                    ui={ui}
                    title={
                        sources.deleteOverlayTitle ||
                        ui.privateTreesStopSyncTitle ||
                        'Stop syncing?'
                    }
                    body={
                        sources.deleteOverlayBody ||
                        ui.privateTreesStopSyncBody ||
                        'Other devices you sign in on will no longer see this tree. The local copy on this device stays.'
                    }
                    confirmLabel={ui.privateTreesStopSyncShort || ui.privateTreesStopSync || 'Stop sync'}
                    onCancel={() => onAction('cancel-overlay')}
                    onConfirm={() => onAction('confirm-stop-private-composed-sync')}
                />
            ) : null}
            {sources.overlay === 'reset-branch-progress' ? (
                <SourcesDeleteOverlay
                    ui={ui}
                    title={
                        sources.deleteOverlayTitle ||
                        ui.sourcesResetBranchProgressTitle ||
                        'Reset progress?'
                    }
                    body={sources.deleteOverlayBody}
                    confirmLabel={ui.sourcesResetBranchProgressConfirm || ui.sourcesResetBranchProgress || 'Reset'}
                    onCancel={() => onAction('cancel-overlay')}
                    onConfirm={() => onAction('confirm-reset-branch-progress')}
                />
            ) : null}
            {sources.overlay === 'export-curriculum' && sources.exportTarget ? (
                <ExportCurriculumSheet
                    ui={ui}
                    target={sources.exportTarget}
                    busy={sources.exportBusy}
                    onCancel={() => onAction('cancel-overlay')}
                    onConfirm={(opts) => onAction('confirm-export-curriculum', opts)}
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
                    {sourcesOverlay}
                </div>
            </div>
        );
    }

    const sourcesDockUi = !!(mobile && modal && typeof modal === 'object' && modal.dockUi);
    const sourcesRootFlags = sourcesDockUi
        ? 'arborito-modal--sources arborito-sources-dock'
        : 'arborito-modal--sources';

    return (
        <div ref={rootRef} data-arborito-panel="modal-sources">
            <DockModalShell
                mobile={mobile}
                sizeTier="HUB"
                rootClass={`arborito-sources-modal-shell${sourcesDockUi ? ' arborito-sources-modal-shell--dock' : ''}`}
                skipBodyWrap
                shellOpts={{
                    rootFlags: sourcesRootFlags,
                    scrim: 'translucent',
                    ...(sourcesDockUi ? { layout: 'dock-bottom' } : {}),
                }}
                onBackdropClick={() => {
                    if (closeBlocked) return;
                    if (sources.overlay) {
                        onAction('cancel-overlay');
                        return;
                    }
                    close();
                }}
                overlay={sourcesOverlay}
                hero={
                    <ModalHubHero
                        mobile={mobile}
                        title={ui.sourceManagerTitle}
                        leadingIcon="📚"
                        showClose={!mobile}
                        showBack={!!mobile}
                        closeDisabled={closeBlocked}
                        onClose={() => {
                            if (closeBlocked) return;
                            if (sources.overlay) {
                                onAction('cancel-overlay');
                                return;
                            }
                            close();
                        }}
                    />
                }
            >
                {bodyInner}
            </DockModalShell>
        </div>
    );
}

export { ModalSources as default };
