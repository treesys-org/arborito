import { useCallback, useRef } from 'react';
import { useShellChrome } from '../../hooks/useShellChrome.js';
import { useDockModalChrome } from '../../../../shared/ui/breakpoints.js';
import {
    prefetchProfileMenuOnIntent,
    prefetchConstructionShellOnIntent,
} from '../../../../app/modal-open-bridge.js';
import { prefetchModal } from '../../../../app/modal-open.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { shouldBlockSageChromeToggle } from '../../../learning/api/sage-pointer-guard.js';
import { ArboritoLogoMark, LanguageIcon } from './SidebarMobileMoreMenu.jsx';
import { SidebarDesktopSearch } from './SidebarDesktopSearch.jsx';
import { CreatorModerationBell } from './CreatorModerationBell.jsx';
import { CommunityChromeButton } from '../CommunityChromeButton.jsx';

function DesktopMenuItem({ icon, label, onClick, prefetchType }) {
    return (
        <button
            type="button"
            className="arborito-desktop-menu-item"
            role="menuitem"
            onPointerEnter={() => prefetchType && prefetchModal(prefetchType)}
            onClick={onClick}
        >
            <span className="arborito-desktop-menu-item__ic" aria-hidden="true">
                {icon}
            </span>
            <span className="arborito-desktop-menu-item__txt">{label}</span>
        </button>
    );
}

export function SidebarDesktopHeader({
    ui,
    chrome,
    desktopSearchOpen,
    deskSearch,
    onOpenSearch,
    onCloseSearch,
    onSearchInput,
    onSearchRefresh,
}) {
    const { setModal, openSageModal, requestGoHome, toggleTheme, toggleConstructionMode, setViewMode, modal, selectedNode } =
        useShellChrome();
    const profileWrapRef = useRef(null);
    const {
        g,
        modalType,
        homeActive,
        sageActive,
        arcadeActive,
        constructionMode,
        dueCount,
        curLang,
        lang,
        showWebDownload,
    } = chrome;

    const wireProfilePopover = useCallback((wrap) => {
        if (!wrap || wrap.dataset.profilePopoverBound === '1') return;
        wrap.dataset.profilePopoverBound = '1';
        const root = document.documentElement;
        const open = () => root.classList.add('arborito-desktop-profile-menu-open');
        const close = () => root.classList.remove('arborito-desktop-profile-menu-open');
        wrap.addEventListener('mouseenter', open);
        wrap.addEventListener('mouseleave', (e) => {
            if (e.relatedTarget instanceof Node && wrap.contains(e.relatedTarget)) return;
            close();
        });
        wrap.addEventListener('focusin', open);
        wrap.addEventListener('focusout', (e) => {
            if (e.relatedTarget instanceof Node && wrap.contains(e.relatedTarget)) return;
            close();
        });
    }, []);

    const openProfile = (e) => {
        e?.stopPropagation?.();
        prefetchModal('profile');
        setModal({ type: 'profile', focus: 'seeds' });
    };

    const toggleSage = (e) => {
        e.stopPropagation();
        if (shouldBlockSageChromeToggle()) return;
        const cur = modal;
        const curType = cur && (typeof cur === 'string' ? cur : cur.type);
        if (curType === 'sage') {
            setModal(null);
            return;
        }
        openSageModal({
            type: 'sage',
            dockUi: useDockModalChrome(),
            sageLessonContext: !!(
                selectedNode &&
                (selectedNode.type === 'leaf' || selectedNode.type === 'exam')
            ),
        });
    };

    return (
        <>
            <header className="arborito-desktop-app-header" role="banner">
                <div className="arborito-desktop-header__left">
                    <button
                        type="button"
                        className="arborito-desktop-header__brand arborito-desktop-hit js-btn-desktop-home"
                        data-arbor-tour="home"
                        aria-label={`Arborito, ${ui.navHome || 'Home'}`}
                        title={`Arborito, ${ui.navHome || 'Home'}`}
                        aria-current={homeActive ? 'page' : undefined}
                        onClick={(e) => {
                            e.stopPropagation();
                            requestGoHome();
                        }}
                    >
                        <span className="arborito-desktop-header__brand-mark arborito-desktop-header__brand-mark--svg" aria-hidden="true">
                            <ArboritoLogoMark size={30} className="arborito-brand-mark-svg" />
                        </span>
                        <span className="arborito-desktop-header__brand-name">Arborito</span>
                    </button>
                    <nav className="arborito-desktop-nav arborito-desktop-header__nav" aria-label={ui.ariaDesktopMainNav || 'Primary navigation'}>
                        <button
                            type="button"
                            className={`arborito-desktop-nav__btn arborito-desktop-hit js-btn-desktop-sources ${modalType === 'sources' ? 'is-active' : ''}`}
                            data-arbor-tour="sources"
                            title={ui.navSources || 'Sources'}
                            onPointerEnter={() => prefetchModal('sources')}
                            onClick={(e) => {
                                e.stopPropagation();
                                setModal('sources');
                            }}
                        >
                            <span className="arborito-desktop-nav__ic" aria-hidden="true">
                                <ChromeEmoji emoji="🌲" size={18} />
                            </span>
                            <span className="arborito-desktop-nav__lb">{ui.navSources || 'Sources'}</span>
                        </button>
                        <button
                            type="button"
                            className={`arborito-desktop-nav__btn arborito-desktop-hit js-btn-desktop-arcade relative ${arcadeActive ? 'is-active' : ''}`}
                            data-arbor-tour="arcade"
                            title={ui.navArcade || 'Arcade'}
                            onPointerEnter={() => prefetchModal('arcade')}
                            onClick={(e) => {
                                e.stopPropagation();
                                setModal({ type: 'arcade', dockUi: useDockModalChrome() });
                            }}
                        >
                            <span className="arborito-desktop-nav__ic" aria-hidden="true">
                                <ChromeEmoji emoji="🎮" size={18} />
                            </span>
                            <span className="arborito-desktop-nav__lb">{ui.navArcade || 'Arcade'}</span>
                            {dueCount > 0 ? <span className="arborito-desktop-nav__badge" aria-hidden="true" /> : null}
                        </button>
                        <button
                            type="button"
                            className={`arborito-desktop-nav__btn arborito-desktop-hit js-btn-construct ${constructionMode ? 'is-active arborito-desktop-nav__btn--construct-on' : ''}`}
                            data-arbor-tour="construct"
                            title={constructionMode ? ui.navConstructExit || 'Exit construction' : ui.navConstruct || 'Construction Mode'}
                            aria-pressed={constructionMode ? 'true' : 'false'}
                            onPointerEnter={() => prefetchConstructionShellOnIntent()}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleConstructionMode();
                            }}
                        >
                            <span
                                className={`arborito-desktop-nav__ic ${constructionMode ? 'arborito-desktop-nav__ic--construct-exit-blink' : ''}`}
                                aria-hidden="true"
                            >
                                <ChromeEmoji emoji={constructionMode ? '⛑️' : '👷'} size={18} />
                            </span>
                            <span className="arborito-desktop-nav__lb">
                                {constructionMode ? ui.navConstructExit || 'Exit construction' : ui.navConstruct || 'Construction Mode'}
                            </span>
                        </button>
                    </nav>
                </div>
                <div
                    className={`arborito-desktop-header__search-wrap arborito-desktop-hit ${desktopSearchOpen ? 'arborito-desktop-search-wrap--open' : ''}`}
                    data-arbor-tour="search"
                    role="search"
                >
                    <SidebarDesktopSearch
                        ui={ui}
                        open={desktopSearchOpen}
                        searchActive={chrome.searchActive}
                        deskSearch={deskSearch}
                        onOpen={onOpenSearch}
                        onClose={onCloseSearch}
                        onInput={onSearchInput}
                        onRefresh={onSearchRefresh}
                    />
                </div>
                <div className="arborito-desktop-actions" aria-label={ui.ariaActions || 'Actions'}>
                    <CommunityChromeButton ui={ui} />
                    <button
                        type="button"
                        className="arborito-desktop-action arborito-desktop-hit js-btn-theme-inline arborito-chrome-tip"
                        data-arbor-tip={ui.themeToggle || 'Toggle Theme'}
                        aria-label={ui.themeToggle || 'Toggle Theme'}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleTheme();
                        }}
                    >
                        <span className="arborito-desktop-menu-item__ic" aria-hidden="true">
                            <ChromeEmoji emoji={chrome.theme === 'light' ? '🌙' : '☀️'} size={18} />
                        </span>
                    </button>
                    <button
                        type="button"
                        className="arborito-desktop-action arborito-desktop-hit js-btn-desktop-language arborito-desktop-action--icon-lang arborito-chrome-tip"
                        data-arbor-tip={`${ui.languageTitle || 'Language'}, ${curLang?.nativeName || lang}`}
                        aria-label={`${ui.languageTitle || 'Language'}, ${curLang?.nativeName || lang}`}
                        onPointerEnter={() => prefetchModal('language')}
                        onClick={(e) => {
                            e.stopPropagation();
                            setModal('language');
                        }}
                    >
                        <span className="arborito-desktop-action__lang-wrap" aria-hidden="true">
                            {curLang?.flag ? (
                                <span className="arborito-desktop-action__lang-flag">
                                    <ChromeEmoji emoji={curLang.flag} size={18} />
                                </span>
                            ) : (
                                <LanguageIcon size={18} className="arborito-desktop-header__lang-ic" />
                            )}
                        </span>
                        <span className="arborito-desktop-action__lang-code" aria-hidden="true">
                            {lang}
                        </span>
                    </button>
                    <CreatorModerationBell className="arborito-desktop-action arborito-desktop-hit" />
                    <div
                        className="arborito-desktop-profile-wrap arborito-desktop-hit"
                        aria-haspopup="menu"
                        onPointerEnter={() => prefetchProfileMenuOnIntent()}
                        ref={(el) => {
                            profileWrapRef.current = el;
                            if (el) wireProfilePopover(el);
                        }}
                    >
                        <button
                            type="button"
                            className="arborito-desktop-action arborito-desktop-action--profile js-btn-desktop-profile arborito-chrome-tip"
                            data-arbor-tour="profile"
                            data-arbor-tip={ui.navProfile || 'Profile'}
                            aria-label={ui.navProfile || 'Profile'}
                            onClick={openProfile}
                        >
                            <span className="arborito-desktop-action__profile-ic" aria-hidden="true">
                                <ChromeEmoji emoji={g.avatar || '👤'} size={22} />
                            </span>
                        </button>
                        <div className="arborito-desktop-profile-popover" role="menu" aria-label={ui.navMore || 'Menu'}>
                            <DesktopMenuItem
                                icon={<ChromeEmoji emoji="👤" size={18} />}
                                label={ui.navProfile || 'Profile'}
                                prefetchType="profile"
                                onClick={openProfile}
                            />
                            <DesktopMenuItem
                                icon={<ChromeEmoji emoji="🔊" size={18} />}
                                label={ui.profileGardenPrefsGroup || 'Sonidos y animaciones'}
                                prefetchType="celebration-prefs"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setModal('celebration-prefs');
                                }}
                            />
                            <DesktopMenuItem
                                icon={<ChromeEmoji emoji="♿" size={18} />}
                                label={ui.a11yPrefsTitle || 'Accesibilidad'}
                                prefetchType="accessibility-prefs"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setModal('accessibility-prefs');
                                }}
                            />
                            {showWebDownload ? (
                                <DesktopMenuItem
                                    icon={<ChromeEmoji emoji="📲" size={18} />}
                                    prefetchType="download-app"
                                    label={
                                        ui.downloadAppOptionalShort
                                            ? `${ui.downloadAppChip || 'Download'} (${ui.downloadAppOptionalShort})`
                                            : ui.downloadAppChip || 'Download app'
                                    }
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setModal({ type: 'download-app' });
                                    }}
                                />
                            ) : null}
                            <DesktopMenuItem
                                icon={<ChromeEmoji emoji="ℹ️" size={18} />}
                                label={ui.navAbout || 'About'}
                                prefetchType="about"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setModal('about');
                                }}
                            />
                            <DesktopMenuItem
                                icon={<ChromeEmoji emoji="🏆" size={18} />}
                                label={ui.moreMenuRowCertificates || ui.navCertificates || 'Certificates'}
                                prefetchType="certificates"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setViewMode('certificates');
                                }}
                            />
                            <div className="px-2 pt-2 pb-1 mt-2 mb-1 border-t border-slate-100 dark:border-slate-800 opacity-60 hover:opacity-100 transition-opacity">
                                <button
                                    type="button"
                                    className="js-btn-legal-shortcut text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 w-full text-center py-1 underline decoration-slate-300 dark:decoration-slate-700 underline-offset-4"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setModal({ type: 'about', tab: 'legal' });
                                    }}
                                >
                                    treesys.org · {ui.tabLegal || 'Legal notice'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            <button
                type="button"
                className={`arborito-desktop-sage-fab arborito-desktop-hit js-btn-desktop-sage ${sageActive ? 'is-active' : ''}`}
                data-arbor-tour="sage-fab"
                aria-label={ui.navSage || 'Sage'}
                title={ui.navSage || 'Sage'}
                onClick={toggleSage}
            >
                <span className="arborito-desktop-sage-fab__ic" aria-hidden="true">
                    <ChromeEmoji emoji="🦉" size={28} />
                </span>
            </button>
        </>
    );
}
