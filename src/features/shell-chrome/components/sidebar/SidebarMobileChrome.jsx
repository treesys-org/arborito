import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { useShellChrome } from '../../hooks/useShellChrome.js';
import { prefetchModalChunkOnIntent } from '../../../../app/modal-open-bridge.js';
import { ArboritoLogoMark } from './SidebarMobileMoreMenu.jsx';

export function SidebarMobileTopActions({ ui, chrome }) {
    const { setModal, toggleTheme, modal } = useShellChrome();
    const { g, mobProfileChipLabel, mobProgressPct, mobProgressScope, constructionMode } = chrome;

    const openProfile = () => {
        prefetchModalChunkOnIntent('profile');
        const cur = modal;
        const curType = cur && (typeof cur === 'string' ? cur : cur.type);
        if (curType === 'profile') {
            setModal(null);
            return;
        }
        setModal({ type: 'profile', focus: 'seeds' });
    };

    return (
        <div
            className="arborito-mob-top-actions"
            role="toolbar"
            aria-label={`${ui.navProfile || 'Profile'} · ${ui.progressTitle || 'Progress'} · ${ui.themeToggle || 'Theme'}`}
        >
            <button
                type="button"
                className="arborito-mob-top-actions__btn arborito-mob-top-actions__btn--profile js-btn-mobile-profile"
                data-arbor-tour="mob-profile"
                aria-label={mobProfileChipLabel}
                onPointerEnter={() => prefetchModalChunkOnIntent('profile')}
                onClick={openProfile}
            >
                <span className="arborito-mob-top-actions__profile-ic" aria-hidden="true">
                    <ChromeEmoji emoji={g.avatar || '👤'} size={20} />
                </span>
                <span className="arborito-mob-top-actions__profile-name">{mobProfileChipLabel}</span>
            </button>
            {!constructionMode ? (
                <button
                    type="button"
                    className={`arborito-mob-top-actions__btn arborito-mob-top-actions__btn--progress js-btn-progress-mobile arborito-chrome-tip ${mobProgressScope}`}
                    data-arbor-tour="mob-progress"
                    data-arbor-tip={`${ui.progressTitle || 'Progress'} (${mobProgressPct}%)`}
                    aria-label={`${ui.progressTitle || 'Progress'} (${mobProgressPct}%)`}
                    onClick={() => document.dispatchEvent(new CustomEvent('toggle-progress-widget'))}
                >
                    <span className="arborito-mob-top-actions__progress-ic" aria-hidden="true">
                        <ChromeEmoji emoji="🎒" size={20} />
                    </span>
                    <span className="arborito-mob-top-actions__progress-pct">{mobProgressPct}%</span>
                </button>
            ) : null}
            <button
                type="button"
                className="arborito-mob-top-actions__btn js-btn-theme-inline arborito-chrome-tip"
                data-arbor-tour="mob-theme"
                data-arbor-tip={ui.themeToggle || 'Toggle theme'}
                aria-label={ui.themeToggle || 'Toggle theme'}
                onClick={() => toggleTheme()}
            >
                <span aria-hidden="true">
                    <ChromeEmoji emoji={chrome.theme === 'light' ? '🌙' : '☀️'} size={20} />
                </span>
            </button>
        </div>
    );
}

export function SidebarMobileDock({
    ui,
    chrome,
    isMobileMenuOpen,
    onToggleMenu,
    onCloseMenu,
    dockToggleModal,
}) {
    const { setModal, openSageModal, requestGoHome, modal, selectedNode } = useShellChrome();
    const { homeActive, searchActive, sageActive, arcadeActive, moreActive, dueCount } = chrome;

    const openSage = () => {
        onCloseMenu();
        const inLesson = !!(
            selectedNode &&
            (selectedNode.type === 'leaf' || selectedNode.type === 'exam')
        );
        const cur = modal;
        const curType = cur && (typeof cur === 'string' ? cur : cur.type);
        if (curType === 'sage') {
            setModal(null);
            return;
        }
        openSageModal(
            inLesson
                ? { type: 'sage', mode: 'context', sageLessonContext: true }
                : { type: 'sage', mode: 'context', dockUi: true }
        );
    };

    return (
        <div className="arborito-mob-dock-wrap" role="presentation">
            <div className="arborito-app-nav-inner">
                <nav
                    className="arborito-mob-dock"
                    role="navigation"
                    aria-label={ui.ariaMainNavigation || ui.ariaDesktopMainNav || 'Main navigation'}
                >
                    <div className="arborito-desktop-nav-group arborito-desktop-nav-group--primary">
                        <button
                            type="button"
                            className={`js-btn-home-mobile-dock arborito-mob-tab ${homeActive ? 'arborito-mob-tab--active' : ''}`}
                            data-arbor-tour="mob-home"
                            aria-label={ui.navHome || 'Home'}
                            title={ui.navHome || 'Home'}
                            aria-current={homeActive ? 'page' : undefined}
                            onClick={() => {
                                onCloseMenu();
                                requestGoHome();
                            }}
                        >
                            <span className="arborito-mob-tab__icon arborito-mob-tab__icon--svg" aria-hidden="true">
                                <ArboritoLogoMark size={30} className="arborito-mob-home-svg" />
                            </span>
                            <span className="arborito-mob-tab__label">{ui.navHome || 'Home'}</span>
                        </button>
                        <button
                            type="button"
                            className={`js-btn-search-mobile-dock arborito-mob-tab ${searchActive ? 'arborito-mob-tab--active' : ''}`}
                            data-arbor-tour="mob-search"
                            aria-label={ui.navSearch}
                            title={ui.navSearch}
                            onClick={() => {
                                onCloseMenu();
                                dockToggleModal({ type: 'search', dockUi: true });
                            }}
                        >
                            <span className="arborito-mob-tab__icon" aria-hidden="true">
                                <ChromeEmoji emoji="🔍" size={22} />
                            </span>
                            <span className="arborito-mob-tab__label">{ui.navSearch}</span>
                        </button>
                        <button
                            type="button"
                            className={`js-btn-sage-mobile-dock arborito-mob-tab ${sageActive ? 'arborito-mob-tab--active' : ''}`}
                            data-arbor-tour="mob-sage"
                            aria-label={ui.navSage}
                            title={ui.navSage}
                            onClick={openSage}
                        >
                            <span className="arborito-mob-tab__icon" aria-hidden="true">
                                <ChromeEmoji emoji="🦉" size={22} />
                            </span>
                            <span className="arborito-mob-tab__label">{ui.navSageDock || ui.navSage}</span>
                        </button>
                        <button
                            type="button"
                            className={`js-btn-arcade-mobile-dock arborito-mob-tab relative ${arcadeActive ? 'arborito-mob-tab--active' : ''}`}
                            data-arbor-tour="mob-arcade"
                            aria-label={`${ui.navArcade || 'Arcade'}${dueCount > 0 ? ` (${dueCount})` : ''}`}
                            title={ui.navArcade || 'Arcade'}
                            onClick={() => {
                                onCloseMenu();
                                dockToggleModal({ type: 'arcade', dockUi: true });
                            }}
                        >
                            <span className="arborito-mob-tab__icon" aria-hidden="true">
                                <ChromeEmoji emoji="🎮" size={22} />
                            </span>
                            <span className="arborito-mob-tab__label">{ui.navArcade || 'Arcade'}</span>
                            {dueCount > 0 ? <span className="arborito-mob-tab__badge" aria-hidden="true" /> : null}
                        </button>
                    </div>
                    <div className="arborito-desktop-nav-group arborito-desktop-nav-group--footer">
                        <button
                            type="button"
                            className={`js-btn-menu-mobile arborito-mob-tab ${moreActive ? 'arborito-mob-tab--active' : ''}`}
                            data-arbor-tour="mob-more"
                            aria-label={ui.navMore || 'More'}
                            title={ui.navMore || 'More'}
                            aria-expanded={isMobileMenuOpen}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleMenu();
                            }}
                        >
                            <span className="arborito-mob-tab__icon arborito-mob-tab__icon--menu" aria-hidden="true">
                                ☰
                            </span>
                            <span className="arborito-mob-tab__label">{ui.navMore || 'More'}</span>
                        </button>
                    </div>
                </nav>
            </div>
        </div>
    );
}
