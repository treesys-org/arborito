import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { useShellChrome } from '../../hooks/useShellChrome.js';
import { prefetchModal } from '../../../../app/modal-open.js';
import { shouldBlockSageChromeToggle } from '../../../learning/api/sage-pointer-guard.js';
import { MobDockBar } from '../../../../shared/ui/MobDockBar.jsx';
import { MobDockTab, MobDockMenuIcon } from '../../../../shared/ui/MobDockTab.jsx';
import { ArboritoLogoMark } from './SidebarMobileMoreMenu.jsx';
import { CreatorModerationBell } from './CreatorModerationBell.jsx';
import { GuestAccountHintBadge } from './GuestAccountHintBadge.jsx';
import { SidebarDesktopSearch } from './SidebarDesktopSearch.jsx';

function openSageFromChrome({ onCloseMenu, selectedNode, modal, setModal, openSageModal }) {
    onCloseMenu?.();
    if (shouldBlockSageChromeToggle()) return;
    const inLesson = !!(
        selectedNode &&
        (selectedNode.type === 'leaf' || selectedNode.type === 'exam')
    );
    const curType = modal && (typeof modal === 'string' ? modal : modal.type);
    if (curType === 'sage') {
        setModal(null);
        return;
    }
    openSageModal({
        type: 'sage',
        mode: 'context',
        dockUi: true,
        ...(inLesson ? { sageLessonContext: true } : {}),
    });
}

function openSourcesDock({ onCloseMenu, sourcesActive, setModal, dockToggleModal }) {
    onCloseMenu?.();
    if (sourcesActive) {
        setModal(null);
        return;
    }
    if (typeof dockToggleModal === 'function') {
        dockToggleModal({ type: 'sources', dockUi: true });
        return;
    }
    setModal({ type: 'sources', dockUi: true });
}

export function SidebarMobileTopActions({
    ui,
    chrome,
    onCloseMenu,
    searchOpen,
    deskSearch,
    onOpenSearch,
    onCloseSearch,
    onSearchInput,
    onSearchRefresh,
}) {
    const { setModal, toggleTheme, modal } = useShellChrome();
    const {
        g,
        mobProfileChipLabel,
        mobProgressPct,
        mobProgressScope,
        constructionMode,
        searchActive,
    } = chrome;

    const openProfile = () => {
        onCloseSearch?.();
        prefetchModal('profile');
        const cur = modal;
        const curType = cur && (typeof cur === 'string' ? cur : cur.type);
        if (curType === 'profile') {
            setModal(null);
            return;
        }
        setModal({ type: 'profile', focus: 'seeds' });
    };

    const openInlineSearch = () => {
        onCloseMenu?.();
        onOpenSearch?.();
    };

    return (
        <>
            {searchOpen ? (
                <button
                    type="button"
                    className="arborito-mob-search-scrim"
                    aria-label={ui.close || 'Close'}
                    onClick={() => onCloseSearch?.()}
                />
            ) : null}
            <div
                className={`arborito-mob-top-actions${searchOpen ? ' arborito-mob-top-actions--search-open' : ''}`}
                role="toolbar"
                aria-label={`${ui.searchInCourseTitle || ui.navSearch || 'Search'} · ${ui.navProfile || 'Profile'} · ${ui.progressTitle || 'Progress'} · ${ui.themeToggle || 'Theme'}`}
            >
                <div
                    className={`arborito-mob-top-actions__search-wrap${searchOpen ? ' arborito-mob-top-actions__search-wrap--open' : ''}`}
                >
                    <SidebarDesktopSearch
                        ui={ui}
                        open={!!searchOpen}
                        searchActive={searchActive}
                        deskSearch={deskSearch}
                        onOpen={openInlineSearch}
                        onClose={onCloseSearch}
                        onInput={onSearchInput}
                        onRefresh={onSearchRefresh}
                    />
                </div>
                {!searchOpen ? (
                    <div className="arborito-mob-top-actions__trailing" role="group">
                        <div className="arborito-guest-account-hint-host">
                            <button
                                type="button"
                                className="arborito-mob-top-actions__btn arborito-mob-top-actions__btn--profile js-btn-mobile-profile"
                                data-arbor-tour="mob-profile"
                                aria-label={mobProfileChipLabel}
                                onPointerEnter={() => prefetchModal('profile')}
                                onClick={openProfile}
                            >
                                <span className="arborito-mob-top-actions__profile-ic" aria-hidden="true">
                                    <ChromeEmoji emoji={g.avatar || '👤'} size={22} />
                                </span>
                                <span className="arborito-mob-top-actions__profile-name">{mobProfileChipLabel}</span>
                            </button>
                            <GuestAccountHintBadge />
                        </div>
                        {!constructionMode ? (
                            <button
                                type="button"
                                className={`arborito-mob-top-actions__btn arborito-mob-top-actions__btn--progress js-btn-progress-mobile ${mobProgressScope}`}
                                data-arbor-tour="mob-progress"
                                aria-label={`${ui.progressTitle || 'Progress'} (${mobProgressPct}%)`}
                                onClick={() => document.dispatchEvent(new CustomEvent('toggle-progress-widget'))}
                            >
                                <span className="arborito-mob-top-actions__progress-ic" aria-hidden="true">
                                    <ChromeEmoji emoji="🎒" size={20} />
                                </span>
                                <span className="arborito-mob-top-actions__progress-pct">{mobProgressPct}%</span>
                            </button>
                        ) : null}
                        <CreatorModerationBell className="arborito-mob-top-actions__btn arborito-mob-top-actions__btn--bell" />
                        <button
                            type="button"
                            className="arborito-mob-top-actions__btn arborito-mob-top-actions__btn--icon js-btn-theme-inline"
                            data-arbor-tour="mob-theme"
                            aria-label={ui.themeToggle || 'Toggle theme'}
                            onClick={() => toggleTheme()}
                        >
                            <span aria-hidden="true">
                                <ChromeEmoji emoji={chrome.theme === 'light' ? '🌙' : '☀️'} size={22} />
                            </span>
                        </button>
                    </div>
                ) : null}
            </div>
        </>
    );
}

export function SidebarMobileDock({
    ui,
    chrome,
    isMobileMenuOpen,
    onToggleMenu,
    onCloseMenu,
    dockToggleModal,
    onCloseSearch,
}) {
    const { setModal, openSageModal, requestGoHome, modal, selectedNode } = useShellChrome();
    const { homeActive, sourcesActive, sageActive, arcadeActive, moreActive, dueCount } = chrome;

    const arcadeLabel = ui.navArcade || 'Arcade';
    const arcadeAria = `${arcadeLabel}${dueCount > 0 ? ` (${dueCount})` : ''}`;
    const sourcesLabel = ui.navSources || ui.moreMenuRowSources || 'Courses';

    const closeSearchThen = (fn) => {
        onCloseSearch?.();
        fn?.();
    };

    return (
        <MobDockBar ariaLabel={ui.ariaMainNavigation || ui.ariaDesktopMainNav || 'Main navigation'}>
            <div className="arborito-desktop-nav-group arborito-desktop-nav-group--primary">
                <MobDockTab
                    className="js-btn-home-mobile-dock"
                    tour="mob-home"
                    active={homeActive}
                    title={ui.navHome || 'Home'}
                    ariaLabel={ui.navHome || 'Home'}
                    ariaCurrent={homeActive ? 'page' : undefined}
                    onClick={() => {
                        closeSearchThen(() => {
                            onCloseMenu();
                            requestGoHome();
                        });
                    }}
                    icon={<ArboritoLogoMark size={30} className="arborito-mob-home-svg" />}
                    iconClass="arborito-mob-tab__icon--svg"
                    label={ui.navHome || 'Home'}
                />
                <MobDockTab
                    className="js-btn-sources-mobile-dock"
                    tour="mob-sources"
                    active={sourcesActive}
                    title={sourcesLabel}
                    ariaLabel={sourcesLabel}
                    onPointerEnter={() => prefetchModal('sources')}
                    onClick={() =>
                        closeSearchThen(() =>
                            openSourcesDock({
                                onCloseMenu,
                                sourcesActive,
                                setModal,
                                dockToggleModal,
                            })
                        )
                    }
                    icon={<ChromeEmoji emoji="🌲" size={22} />}
                    label={sourcesLabel}
                />
                <MobDockTab
                    className="js-btn-sage-mobile-dock"
                    tour="mob-sage"
                    active={sageActive}
                    title={ui.navSage}
                    ariaLabel={ui.navSage}
                    onClick={() =>
                        closeSearchThen(() =>
                            openSageFromChrome({
                                onCloseMenu,
                                selectedNode,
                                modal,
                                setModal,
                                openSageModal,
                            })
                        )
                    }
                    icon={<ChromeEmoji emoji="🦉" size={22} />}
                    label={ui.navSageDock || ui.navSage}
                />
                <MobDockTab
                    className="js-btn-arcade-mobile-dock relative"
                    tour="mob-arcade"
                    active={arcadeActive}
                    title={arcadeLabel}
                    ariaLabel={arcadeAria}
                    onPointerEnter={() => prefetchModal('arcade')}
                    onClick={() => {
                        closeSearchThen(() => {
                            onCloseMenu();
                            dockToggleModal({ type: 'arcade', dockUi: true });
                        });
                    }}
                    icon={<ChromeEmoji emoji="🎮" size={22} />}
                    label={arcadeLabel}
                >
                    {dueCount > 0 ? <span className="arborito-mob-tab__badge" aria-hidden="true" /> : null}
                </MobDockTab>
            </div>
            <div className="arborito-desktop-nav-group arborito-desktop-nav-group--footer">
                <MobDockTab
                    id="btn-menu-mobile"
                    className="js-btn-menu-mobile"
                    tour="mob-more"
                    active={moreActive}
                    title={ui.navMore || 'More'}
                    ariaLabel={ui.navMore || 'More'}
                    ariaExpanded={isMobileMenuOpen}
                    onClick={(e) => {
                        e.stopPropagation();
                        closeSearchThen(() => onToggleMenu());
                    }}
                    icon={<MobDockMenuIcon size={22} />}
                    label={ui.navMore || 'More'}
                />
            </div>
        </MobDockBar>
    );
}
