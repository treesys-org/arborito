import { useShellChrome } from '../hooks/useShellChrome.js';
import { useEffect } from 'react';
import { useSidebar } from './sidebar/useSidebar.jsx';
import { SidebarDesktopHeader } from './sidebar/SidebarDesktopHeader.jsx';
import { SidebarMobileTopActions, SidebarMobileDock } from './sidebar/SidebarMobileChrome.jsx';
import { SidebarMobileMoreMenu } from './sidebar/SidebarMobileMoreMenu.jsx';
import { DockHubPanelLayer } from '../../../app/components/DockHubPanelLayer.jsx';
import { SidebarEmbedPane } from './sidebar/SidebarEmbedPane.jsx';

export function Sidebar({ embed }) {
    const shell = useShellChrome();
    const { ui, viewMode, toggleConstructionMode } = shell;

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
                        forumNavEnabled={chrome.forumNavEnabled}
                        childrenEmbed={{ showWebDownload: chrome.showWebDownload, node: embedNode }}
                    />
                    <DockHubPanelLayer surface="browse" />
                </>
            )}
        </aside>
    );
}
