import { useShellChrome } from '../hooks/useShellChrome.js';
import { useEffect } from 'react';
import { useSidebar } from './sidebar/useSidebar.jsx';
import { SidebarDesktopHeader } from './sidebar/SidebarDesktopHeader.jsx';
import { SidebarMobileTopActions, SidebarMobileDock } from './sidebar/SidebarMobileChrome.jsx';
import { SidebarMobileMoreMenu } from './sidebar/SidebarMobileMoreMenu.jsx';
import { SidebarEmbedPane } from './sidebar/SidebarEmbedPane.jsx';

function SidebarCloudBanner({ ui, onEnable, onDismiss }) {
    return (
        <div className="px-3 pt-3" data-arbor-tour="cloud-sync">
            <div className="rounded-2xl border border-sky-200/80 dark:border-sky-800/70 bg-white/80 dark:bg-slate-900/70 backdrop-blur px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 dark:text-slate-100 m-0">
                            {ui.welcomeCloudSyncTitle || 'Online progress sync (optional)'}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 m-0 mt-1">
                            {ui.welcomeCloudSyncBodyShort || 'Sync your progress across devices (encrypted).'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 m-0 mt-1">
                            {ui.welcomeCloudSyncOffRisk || ''}
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <button
                            type="button"
                            className="js-cloudsync-enable arborito-cta-emerald px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEnable?.();
                            }}
                        >
                            {ui.welcomeCloudSyncOnLabel || 'Enable'}
                        </button>
                        <button
                            type="button"
                            className="js-cloudsync-dismiss px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismiss?.();
                            }}
                        >
                            {ui.cancel || 'Not now'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function Sidebar({ embed }) {
    const shell = useShellChrome();
    const {
        ui,
        viewMode,
        enableCloudSyncFromBanner,
        dismissCloudSyncBanner,
        toggleConstructionMode,
    } = shell;

    const sb = useSidebar();
    const {
        chrome,
        isMobileMenuOpen,
        mmenuPane,
        mmenuFreshEnter,
        mmenuReopenInstant,
        mmenuPaneDir,
        desktopSearchOpen,
        deskSearch,
        toggleMobileMenu,
        mobileMenuGoBack,
        pushMmenuPane,
        drillMobileMoreAbout,
        mmenuOpenModal,
        dockToggleModal,
        pickLanguage,
        closeDesktopSearch,
        openDesktopSearch,
        runDeskSearch,
        refreshDeskSearch,
        closeMobileMenuIfOpen,
        mobileMenuAction,
        forumEmbedSubNavOpen,
    } = sb;

    useEffect(() => {
        if (!isMobileMenuOpen || chrome.isDesktop) return undefined;
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            if (mmenuPane !== 'root') {
                mobileMenuGoBack();
            } else {
                toggleMobileMenu();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isMobileMenuOpen, chrome.isDesktop, mmenuPane, mobileMenuGoBack, toggleMobileMenu]);

    const certsMoreActive = viewMode === 'certificates' || mmenuPane === 'certs';

    const embedPanes = new Set(['about', 'sources', 'certs', 'forum', 'celebration', 'a11y']);
    const embedNode = embedPanes.has(mmenuPane) ? <SidebarEmbedPane pane={mmenuPane} /> : null;

    return (
        <aside
            data-arborito-panel="sidebar"
            data-embed={embed ? '1' : undefined}
            className={`h-full ${chrome.isDesktop ? 'arborito-sidebar--desktop-chrome' : ''}`}
        >
            {chrome.isDesktop ? (
                <>
                    <SidebarDesktopHeader
                        ui={ui}
                        chrome={chrome}
                        desktopSearchOpen={desktopSearchOpen}
                        deskSearch={deskSearch}
                        onOpenSearch={openDesktopSearch}
                        onCloseSearch={closeDesktopSearch}
                        onSearchInput={runDeskSearch}
                        onSearchRefresh={refreshDeskSearch}
                    />
                    {chrome.showCloudBanner ? (
                        <SidebarCloudBanner
                            ui={ui}
                            onEnable={enableCloudSyncFromBanner}
                            onDismiss={dismissCloudSyncBanner}
                        />
                    ) : null}
                </>
            ) : (
                <>
                    <SidebarMobileTopActions ui={ui} chrome={chrome} />
                    <SidebarMobileDock
                        ui={ui}
                        chrome={chrome}
                        isMobileMenuOpen={isMobileMenuOpen}
                        onToggleMenu={toggleMobileMenu}
                        onCloseMenu={closeMobileMenuIfOpen}
                        dockToggleModal={dockToggleModal}
                    />
                    <SidebarMobileMoreMenu
                        ui={ui}
                        open={isMobileMenuOpen}
                        mmenuPane={mmenuPane}
                        mmenuFreshEnter={mmenuFreshEnter}
                        mmenuReopenInstant={mmenuReopenInstant}
                        mmenuPaneDir={mmenuPaneDir}
                        onBackdropClose={toggleMobileMenu}
                        onBack={mobileMenuGoBack}
                        onPushPane={pushMmenuPane}
                        onDownload={mmenuOpenModal({ type: 'download-app' })}
                        onConstruct={mobileMenuAction(() => toggleConstructionMode())}
                        onLegal={() => drillMobileMoreAbout('legal')}
                        onPickLanguage={pickLanguage}
                        constructionMode={chrome.constructionMode}
                        curLang={chrome.curLang}
                        certsMoreActive={certsMoreActive}
                        hideRootHero={mmenuPane === 'forum' && forumEmbedSubNavOpen}
                        childrenEmbed={{ showWebDownload: chrome.showWebDownload, node: embedNode }}
                    />
                </>
            )}
        </aside>
    );
}
