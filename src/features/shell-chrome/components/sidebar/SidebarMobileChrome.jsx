import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { useShellChrome } from '../../hooks/useShellChrome.js';
import { prefetchModal } from '../../../../app/modal-open.js';
import { shouldBlockSageChromeToggle } from '../../../learning/api/sage-pointer-guard.js';
import { MobDockBar } from '../../../../shared/ui/MobDockBar.jsx';
import { MobDockTab, MobDockMenuIcon } from '../../../../shared/ui/MobDockTab.jsx';
import { ArboritoLogoMark } from './SidebarMobileMoreMenu.jsx';
import { CreatorModerationBell } from './CreatorModerationBell.jsx';
import { GuestAccountHintBadge } from './GuestAccountHintBadge.jsx';

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

export function SidebarMobileTopActions({ ui, chrome, onCloseMenu, dockToggleModal }) {
    const { setModal, toggleTheme, modal } = useShellChrome();
    const {
        g,
        mobProfileChipLabel,
        mobProgressPct,
        mobProgressScope,
        constructionMode,
        sourcesActive,
    } = chrome;

    const openProfile = () => {
        prefetchModal('profile');
        const cur = modal;
        const curType = cur && (typeof cur === 'string' ? cur : cur.type);
        if (curType === 'profile') {
            setModal(null);
            return;
        }
        setModal({ type: 'profile', focus: 'seeds' });
    };

    const sourcesLabel = ui.navSources || ui.moreMenuRowSources || 'Courses';

    return (
        <div
            className="arborito-mob-top-actions"
            role="toolbar"
            aria-label={`${sourcesLabel} · ${ui.navProfile || 'Profile'} · ${ui.progressTitle || 'Progress'} · ${ui.themeToggle || 'Theme'}`}
        >
            <button
                type="button"
                className={`arborito-mob-top-actions__btn arborito-mob-top-actions__btn--lead js-btn-sources-mobile-top${sourcesActive ? ' is-active' : ''}`}
                data-arbor-tour="mob-sources-chip"
                title={sourcesLabel}
                aria-label={sourcesLabel}
                aria-pressed={sourcesActive ? 'true' : 'false'}
                onPointerEnter={() => prefetchModal('sources')}
                onClick={() =>
                    openSourcesDock({
                        onCloseMenu,
                        sourcesActive,
                        setModal,
                        dockToggleModal,
                    })
                }
            >
                <span className="arborito-mob-top-actions__lead-ic" aria-hidden="true">
                    <ChromeEmoji emoji="🌲" size={22} />
                </span>
                <span className="arborito-mob-top-actions__lead-name">{sourcesLabel}</span>
            </button>
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

    const arcadeLabel = ui.navArcade || 'Arcade';
    const arcadeAria = `${arcadeLabel}${dueCount > 0 ? ` (${dueCount})` : ''}`;

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
                        onCloseMenu();
                        requestGoHome();
                    }}
                    icon={<ArboritoLogoMark size={30} className="arborito-mob-home-svg" />}
                    iconClass="arborito-mob-tab__icon--svg"
                    label={ui.navHome || 'Home'}
                />
                <MobDockTab
                    className="js-btn-search-mobile-dock"
                    tour="mob-search"
                    active={searchActive}
                    title={ui.navSearch}
                    ariaLabel={ui.navSearch}
                    onPointerEnter={() => prefetchModal('search')}
                    onClick={() => {
                        onCloseMenu();
                        dockToggleModal({ type: 'search', dockUi: true });
                    }}
                    icon={<ChromeEmoji emoji="🔍" size={22} />}
                    label={ui.navSearch}
                />
                <MobDockTab
                    className="js-btn-sage-mobile-dock"
                    tour="mob-sage"
                    active={sageActive}
                    title={ui.navSage}
                    ariaLabel={ui.navSage}
                    onClick={() =>
                        openSageFromChrome({
                            onCloseMenu,
                            selectedNode,
                            modal,
                            setModal,
                            openSageModal,
                        })
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
                        onCloseMenu();
                        dockToggleModal({ type: 'arcade', dockUi: true });
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
                        onToggleMenu();
                    }}
                    icon={<MobDockMenuIcon size={22} />}
                    label={ui.navMore || 'More'}
                />
            </div>
        </MobDockBar>
    );
}
