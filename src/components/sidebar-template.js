import { store } from '../store.js';
import { shouldShowMobileUI } from '../utils/breakpoints.js';
import { escSidebarHtml } from './sidebar-utils.js';


export function renderSidebarHtml(ctx) {

        const { theme, lang, viewMode, modal, selectedNode, previewNode, gamification, githubUser, constructionMode, activeSource, availableReleases } = store.value;
        const modalType = typeof modal === 'string' ? modal : modal?.type || null;
        const lessonOpen = !!(selectedNode || previewNode);
        const g = gamification;
        
        const seedsCount = g.seeds ? g.seeds.length : (g.fruits ? g.fruits.length : 0);
        
        const dueNodes = store.userStore.settings.getDueNodes();
        const dueCount = dueNodes.length;
        
        const isArchive = activeSource?.type === 'archive';
        const isLocal = activeSource?.type === 'local';
        
        let versionLabel = "Live / Rolling";
        let versionIcon = "🌊";
        
        if (isArchive) {
            versionIcon = "📦";
            const relInfo = (availableReleases || []).find(r => r.url === activeSource.url);
            versionLabel = relInfo ? (relInfo.year || relInfo.name) : (store.ui.releasesSnapshot || 'Version');
        } else if (isLocal) {
            versionIcon = "🌱";
            versionLabel = "Local";
        }

        const mobUi = shouldShowMobileUI();
        const isDesktop = document.documentElement.classList.contains('arborito-desktop') && !mobUi;

        const searchActive = isDesktop
            ? ctx.desktopSearchOpen
            : modal === 'search' || modalType === 'search';
        const sageActive = modal === 'sage' || modalType === 'sage';
        const arcadeActive = modal === 'arcade' || modalType === 'arcade';
        const homeActive = viewMode === 'explore' && !modal && !lessonOpen && !ctx.isMobileMenuOpen;
        const moreActive = ctx.isMobileMenuOpen;

        ctx.mobileMenuStack = ctx.mobileMenuStack.filter(p => !['info', 'settings', 'version'].includes(p));
        const drillOk = new Set(['language', 'about', 'manual', 'sources', 'releases', 'profile', 'certs']);
        ctx.mobileMenuStack = ctx.mobileMenuStack.filter(p => drillOk.has(p));
        if (ctx.mobileMenuStack.length > 1) {
            ctx.mobileMenuStack = [ctx.mobileMenuStack[ctx.mobileMenuStack.length - 1]];
        }
        const mmenuPane = ctx.mobileMenuStack.length ? ctx.mobileMenuStack[ctx.mobileMenuStack.length - 1] : 'root';
        const omitProfileVolatile = ctx.isMobileMenuOpen && mmenuPane !== 'root';

        const currentKey = JSON.stringify({
            theme, lang, viewMode,
            modalType,
            deskSearch: isDesktop ? ctx.desktopSearchOpen : false,
            lessonOpen,
            streak: omitProfileVolatile ? 0 : g.streak,
            seedsCount: omitProfileVolatile ? 0 : seedsCount,
            ghUser: omitProfileVolatile ? null : githubUser?.login,
            mobileOpen: ctx.isMobileMenuOpen,
            mmenuStack: ctx.mobileMenuStack.join('/'),
            username: omitProfileVolatile ? '' : g.username,
            avatar: omitProfileVolatile ? '' : g.avatar,
            constructionMode,
            dueCount,
            sourceId: activeSource?.id
        });
        
        if (currentKey === ctx.renderKey) {
            return { skipped: true, currentKey, isDesktop };
        }

        const ui = store.ui;
        const curLangDesktop = store.currentLangInfo;
        const icDesktopMenu = {
            profile: `<span class="arborito-desktop-menu-item__ic" aria-hidden="true">👤</span>`,
            theme: `<span class="arborito-desktop-menu-item__ic" aria-hidden="true">${store.value.theme === 'light' ? '🌙' : '☀️'}</span>`,
            language: `<span class="arborito-desktop-menu-item__ic" aria-hidden="true">${curLangDesktop ? curLangDesktop.flag : '🌍'}</span>`,
            version: `<span class="arborito-desktop-menu-item__ic" aria-hidden="true">${versionIcon}</span>`,
            about: `<span class="arborito-desktop-menu-item__ic" aria-hidden="true">ℹ️</span>`,
            manual: `<span class="arborito-desktop-menu-item__ic" aria-hidden="true">📖</span>`,
            sources: `<span class="arborito-desktop-menu-item__ic" aria-hidden="true">🌳</span>`,
            certs: `<span class="arborito-desktop-menu-item__ic" aria-hidden="true">🏆</span>`
        };

        // --- Bottom sheet “Más” — drill-down ---
        let mobileMenuHtml = '';
        if (!isDesktop && ctx.isMobileMenuOpen) {
            const chevronDrill = `<svg class="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>`;
            const mmenuHint = (h) => (h ? `<span class="text-xs font-semibold text-slate-400 dark:text-slate-500 truncate max-w-[9rem] text-right shrink-0">${h}</span>` : '');
            const curLang = store.currentLangInfo;
            const icRow = {
                construct: `<span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">${constructionMode ? '🏗️' : '👷'}</span>`,
                themeLight: `<span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">🌙</span>`,
                themeDark: `<span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">☀️</span>`,
                language: `<span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">${curLang ? curLang.flag : '🌍'}</span>`,
                version: `<span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">${versionIcon}</span>`
            };
            const icMmenu = {
                manual: `<span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">📖</span>`,
                sources: `<span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">🌳</span>`,
                certs: `<span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">🏆</span>`,
                about: `<span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">ℹ️</span>`
            };
            const certsMoreActive = store.value.viewMode === 'certificates' || mmenuPane === 'certs';
            const subTitles = {
                language: ui.languageTitle,
                about: ui.navAbout,
                manual: ui.moreMenuRowManual || ui.navManual || 'Arborito Guide',
                sources: ui.moreMenuRowSources || ui.navSources,
                releases: ui.menuVersion || 'Version',
                profile: ui.navProfile,
                certs: ui.moreMenuRowCertificates || ui.navCertificates
            };

            const mmenuToolbarRow = (title) => `
                <button type="button" class="arborito-mmenu-back js-mmenu-back shrink-0" aria-label="${ui.navBack || 'Back'}">←</button>
                <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${title}</h2>
                <span class="w-10 shrink-0" aria-hidden="true"></span>`;
            const mmenuHero = mmenuPane === 'root' ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero arborito-mmenu-hero--root">
                    <div class="arborito-sheet__grab" aria-hidden="true"></div>
                    <div class="arborito-mmenu-toolbar">
                        ${mmenuToolbarRow(ui.navMore || 'More')}
                    </div>
                </div>` : `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero">
                    ${mmenuToolbarRow(subTitles[mmenuPane] || mmenuPane)}
                </div>`;

            const mmenuBodyRoot = `
                <div class="px-4 pt-4 w-full">
                    <button type="button" class="js-mmenu-push arborito-profile-card arborito-profile-card--mmenu mb-3 shrink-0 w-full" data-pane="profile">
                        <div class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-2xl shrink-0 shadow-inner">${g.avatar || '👤'}</div>
                        <div class="text-left flex-1 min-w-0">
                            <p class="text-sm font-black text-slate-800 dark:text-white truncate tracking-tight">${g.username || ui.navProfile}</p>
                            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">${g.streak} ${ui.days} · ${seedsCount} ${ui.seedsTitle || 'seeds'}</p>
                        </div>
                        ${chevronDrill}
                    </button>
                    <p class="arborito-menu-section">${ui.menuSectionContent || 'Content'}</p>
                    <button type="button" class="js-mmenu-push arborito-mmenu-drill-row" data-pane="manual">
                        ${icMmenu.manual}
                        <span class="flex-1 min-w-0 text-left">${ui.moreMenuRowManual || ui.navManual || 'Arborito Guide'}</span>
                        ${mmenuHint(ui.moreMenuRowManualSub)}
                        ${chevronDrill}
                    </button>
                    <button type="button" class="js-mmenu-push arborito-mmenu-drill-row" data-pane="about">
                        ${icMmenu.about}
                        <span class="flex-1 min-w-0 text-left">${ui.navAbout}</span>
                        ${mmenuHint(ui.moreMenuRowAboutSub)}
                        ${chevronDrill}
                    </button>
                    <button type="button" class="js-mmenu-push arborito-mmenu-drill-row" data-pane="sources">
                        ${icMmenu.sources}
                        <span class="flex-1 min-w-0 text-left">${ui.moreMenuRowSources || ui.navSources}</span>
                        ${mmenuHint(ui.moreMenuRowSourcesSub)}
                        ${chevronDrill}
                    </button>
                    <button type="button" class="js-mmenu-push arborito-mmenu-drill-row ${certsMoreActive ? 'ring-2 ring-amber-400/45 dark:ring-amber-500/35' : ''}" data-pane="certs">
                        ${icMmenu.certs}
                        <span class="flex-1 min-w-0 text-left">${ui.moreMenuRowCertificates || ui.navCertificates}</span>
                        ${mmenuHint(ui.moreMenuRowCertificatesSub)}
                        ${chevronDrill}
                    </button>
                    <hr class="arborito-mmenu-divider" aria-hidden="true">
                    <p class="arborito-menu-section">${ui.menuSectionTools || 'Tools'}</p>
                    <button type="button" class="js-btn-construct arborito-mmenu-drill-row ${constructionMode ? 'ring-2 ring-orange-400/50 dark:ring-orange-500/40' : ''}">
                        ${icRow.construct}
                        <span class="flex-1 min-w-0 text-left">${ui.navConstruct || 'Construction Mode'}</span>
                        ${constructionMode ? '<span class="w-2 h-2 rounded-full bg-orange-500 shrink-0" aria-hidden="true"></span>' : ''}
                    </button>
                    <hr class="arborito-mmenu-divider" aria-hidden="true">
                    <p class="arborito-menu-section">${ui.menuSectionApp || 'App'}</p>
                    <button type="button" class="js-btn-theme-inline arborito-mmenu-drill-row">
                        ${store.value.theme === 'light' ? icRow.themeLight : icRow.themeDark}
                        <span class="flex-1 min-w-0 text-left">${ui.themeToggle || 'Toggle Theme'}</span>
                    </button>
                    <button type="button" class="js-mmenu-push arborito-mmenu-drill-row" data-pane="language">
                        ${icRow.language}
                        <span class="flex-1 min-w-0 text-left">${ui.languageTitle}</span>
                        <span class="text-xs font-semibold text-slate-400 dark:text-slate-500 truncate max-w-[7rem] text-right">${curLang ? curLang.nativeName : ''}</span>
                        ${chevronDrill}
                    </button>
                    ${!isLocal ? `
                    <button type="button" class="js-mmenu-push arborito-mmenu-drill-row" data-pane="releases">
                        ${icRow.version}
                        <span class="flex-1 min-w-0 text-left">${ui.menuVersion || 'Version'}</span>
                        <span class="text-xs font-bold text-slate-400 dark:text-slate-500 truncate max-w-[6rem] text-right">${versionLabel}</span>
                        ${chevronDrill}
                    </button>
                    ` : ''}
                </div>`;

            const mmenuBodyLanguage = `
                    <div class="grid grid-cols-1 gap-2 pb-2 px-4 pt-4 w-full">
                        ${store.availableLanguages.map(l => `
                        <button type="button" class="js-btn-lang-pick flex items-start gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${store.value.lang === l.code ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-100 dark:border-slate-700 bg-white/70 dark:bg-slate-800/40'}" data-code="${l.code}">
                            <span class="text-3xl shrink-0 leading-none mt-0.5" aria-hidden="true">${l.flag}</span>
                            <div class="flex-1 min-w-0">
                                <span class="font-bold text-slate-800 dark:text-slate-100 block leading-tight">${l.nativeName}</span>
                                <span class="text-xs text-slate-500 leading-tight">${l.name}</span>
                            </div>
                            <span class="w-8 shrink-0 flex items-start justify-center text-xl font-bold text-green-500 leading-none pt-1" aria-hidden="true">${store.value.lang === l.code ? '✓' : ''}</span>
                        </button>
                        `).join('')}
                    </div>`;

            const mmenuBodyAbout = `
                    <div class="arborito-mmenu-about-host flex flex-col flex-1 min-h-0 w-full">
                        <arborito-modal-about embed></arborito-modal-about>
                    </div>`;

            const mmenuBodyManual = `
                    <div class="arborito-mmenu-embed-host flex flex-col flex-1 min-h-0 w-full min-w-0">
                        <arborito-modal-manual embed></arborito-modal-manual>
                    </div>`;

            const mmenuBodySources = `
                    <div class="arborito-mmenu-embed-host flex flex-col flex-1 min-h-0 w-full min-w-0">
                        <arborito-modal-sources embed></arborito-modal-sources>
                    </div>`;

            const mmenuBodyReleases = `
                    <div class="arborito-mmenu-embed-host flex flex-col flex-1 min-h-0 w-full min-w-0">
                        <arborito-modal-releases embed></arborito-modal-releases>
                    </div>`;

            const mmenuBodyProfile = `
                    <div class="arborito-mmenu-embed-host flex flex-col flex-1 min-h-0 w-full min-w-0">
                        <arborito-modal-profile embed data-focus="seeds"></arborito-modal-profile>
                    </div>`;

            const mmenuBodyCerts = `
                    <div class="arborito-mmenu-embed-host flex flex-col flex-1 min-h-0 w-full min-w-0">
                        <arborito-modal-certificates embed></arborito-modal-certificates>
                    </div>`;

            let mmenuBody;
            if (mmenuPane === 'language') mmenuBody = mmenuBodyLanguage;
            else if (mmenuPane === 'about') mmenuBody = mmenuBodyAbout;
            else if (mmenuPane === 'manual') mmenuBody = mmenuBodyManual;
            else if (mmenuPane === 'sources') mmenuBody = mmenuBodySources;
            else if (mmenuPane === 'releases') mmenuBody = mmenuBodyReleases;
            else if (mmenuPane === 'profile') mmenuBody = mmenuBodyProfile;
            else if (mmenuPane === 'certs') mmenuBody = mmenuBodyCerts;
            else mmenuBody = mmenuBodyRoot;

            let mmenuScrollExtra = '';
            if (mmenuPane === 'about') mmenuScrollExtra = ' arborito-mmenu-scroll--about';
            else if (
                mmenuPane === 'manual' ||
                mmenuPane === 'sources' ||
                mmenuPane === 'releases' ||
                mmenuPane === 'profile' ||
                mmenuPane === 'certs'
            ) {
                mmenuScrollExtra = ' arborito-mmenu-scroll--embed-pane';
            }

            mobileMenuHtml = `
            <div id="mobile-menu-backdrop" class="arborito-sheet-backdrop arborito-sheet-backdrop--mobile-more animate-in fade-in" aria-hidden="true"></div>
            <div id="mobile-menu" class="arborito-sheet arborito-sheet--mobile-more min-h-0"
                 role="dialog" aria-modal="true" aria-label="Menu">
                ${mmenuHero}
                <div class="arborito-mmenu-scroll arborito-mmenu-pane-host custom-scrollbar${mmenuScrollExtra}" style="padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 12px));">
                    ${mmenuBody}
                </div>
            </div>
            `;
        }

    return {
        html: `
        ${isDesktop ? `
        <header class="arborito-desktop-app-header" role="banner">
            <div class="arborito-desktop-header__left">
                <button type="button" class="arborito-desktop-header__brand arborito-desktop-hit js-btn-desktop-home" data-arbor-tour="home" aria-label="Arborito — ${ui.navHome || 'Home'}" title="Arborito — ${ui.navHome || 'Home'}" ${homeActive ? 'aria-current="page"' : ''}>
                    <span class="arborito-desktop-header__brand-mark" aria-hidden="true">🌳</span>
                    <span class="arborito-desktop-header__brand-name">Arborito</span>
                </button>
                <nav class="arborito-desktop-nav arborito-desktop-header__nav" aria-label="${ui.navHome ? `${ui.navHome} — ${ui.navSources || 'Navigation'}` : 'Primary navigation'}">
                    <button type="button" class="arborito-desktop-nav__btn arborito-desktop-hit js-btn-desktop-sources ${modalType === 'sources' ? 'is-active' : ''}" data-arbor-tour="sources" title="${ui.navSources || 'Sources'}">
                        <span class="arborito-desktop-nav__ic" aria-hidden="true">🌲</span>
                        <span class="arborito-desktop-nav__lb">${ui.navSources || 'Sources'}</span>
                    </button>
                    <button type="button" class="arborito-desktop-nav__btn arborito-desktop-hit js-btn-desktop-arcade relative ${arcadeActive ? 'is-active' : ''}" data-arbor-tour="arcade" title="${ui.navArcade || 'Arcade'}">
                        <span class="arborito-desktop-nav__ic" aria-hidden="true">🎮</span>
                        <span class="arborito-desktop-nav__lb">${ui.navArcade || 'Arcade'}</span>
                        ${dueCount > 0 ? '<span class="arborito-desktop-nav__badge" aria-hidden="true"></span>' : ''}
                    </button>
                    <button type="button" class="arborito-desktop-nav__btn arborito-desktop-hit js-btn-construct ${constructionMode ? 'is-active arborito-desktop-nav__btn--construct-on' : ''}" data-arbor-tour="construct" title="${constructionMode ? (ui.navConstructExit || 'Exit construction') : (ui.navConstruct || 'Construction Mode')}" aria-pressed="${constructionMode ? 'true' : 'false'}">
                        <span class="arborito-desktop-nav__ic ${constructionMode ? 'arborito-desktop-nav__ic--construct-exit-blink' : ''}" aria-hidden="true">${constructionMode ? '🚪' : '👷'}</span>
                        <span class="arborito-desktop-nav__lb">${constructionMode ? (ui.navConstructExit || 'Exit construction') : (ui.navConstruct || 'Construction')}</span>
                    </button>
                </nav>
            </div>
            <div class="arborito-desktop-header__search-wrap arborito-desktop-hit ${ctx.desktopSearchOpen ? 'arborito-desktop-search-wrap--open' : ''}" data-arbor-tour="search" role="search">
                ${ctx.desktopSearchOpen ? `
                <div class="arborito-desktop-search-inline">
                    <div class="arborito-desktop-search-inline__row">
                        <span class="arborito-desktop-search-inline__ic" aria-hidden="true">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                        </span>
                        <input id="arborito-desk-search-input" type="search" enterkeyhint="search" placeholder="${escSidebarHtml(ui.searchPlaceholder || 'Search topics...')}" autocomplete="off" class="arborito-desktop-search-inline__input" aria-label="${escSidebarHtml(ui.navSearch || 'Search')}" />
                        <button type="button" class="arborito-desktop-search-inline__close js-desk-search-close" aria-label="${escSidebarHtml(ui.close || 'Close')}">×</button>
                    </div>
                    <div id="arborito-desk-search-msg" class="arborito-desktop-search-inline__msg hidden" aria-live="polite"></div>
                    <div id="arborito-desk-search-results" class="arborito-desktop-search-inline__results custom-scrollbar"></div>
                </div>
                ` : `
                <button type="button" class="arborito-desktop-search-trigger js-btn-desktop-search ${searchActive ? 'is-active' : ''}" aria-label="${ui.navSearch || 'Search'}" title="${ui.navSearch || 'Search'}">
                    <span class="arborito-desktop-search-trigger__icon" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" width="20" height="20" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                    </span>
                    <span class="arborito-desktop-search-trigger__placeholder">${escSidebarHtml(ui.searchPlaceholder || 'Search topics...')}</span>
                </button>
                `}
            </div>
            <div class="arborito-desktop-actions" aria-label="Actions">
                <button type="button" class="arborito-desktop-action arborito-desktop-hit js-btn-theme-inline" title="${ui.themeToggle || 'Toggle Theme'}">
                    ${icDesktopMenu.theme}
                </button>
                <button type="button" class="arborito-desktop-action arborito-desktop-hit js-btn-desktop-language" title="${ui.languageTitle || 'Language'}">
                    ${icDesktopMenu.language}
                </button>
                <div class="arborito-desktop-profile-wrap arborito-desktop-hit" aria-haspopup="menu">
                    <button type="button" class="arborito-desktop-action arborito-desktop-action--profile js-btn-desktop-profile" data-arbor-tour="profile" aria-label="${ui.navProfile || 'Profile'}" title="${ui.navProfile || 'Profile'}">${g.avatar || '👤'}</button>
                    <div class="arborito-desktop-profile-popover" role="menu" aria-label="${ui.navMore || 'Menu'}">
                        <button type="button" class="arborito-desktop-menu-item js-btn-desktop-profile-menu" role="menuitem">${icDesktopMenu.profile}<span class="arborito-desktop-menu-item__txt">${ui.navProfile || 'Profile'}</span></button>
                        ${!isLocal ? `<button type="button" class="arborito-desktop-menu-item js-btn-desktop-versions" role="menuitem">${icDesktopMenu.version}<span class="arborito-desktop-menu-item__txt">${ui.menuVersion || 'Version'}</span></button>` : ''}
                        <button type="button" class="arborito-desktop-menu-item js-btn-desktop-about" role="menuitem">${icDesktopMenu.about}<span class="arborito-desktop-menu-item__txt">${ui.navAbout || 'About'}</span></button>
                        <button type="button" class="arborito-desktop-menu-item js-btn-desktop-manual" data-arbor-tour="manual-menu" role="menuitem">${icDesktopMenu.manual}<span class="arborito-desktop-menu-item__txt">${ui.moreMenuRowManual || ui.navManual || 'Guide'}</span></button>
                        <button type="button" class="arborito-desktop-menu-item js-btn-desktop-certs" role="menuitem">${icDesktopMenu.certs}<span class="arborito-desktop-menu-item__txt">${ui.moreMenuRowCertificates || ui.navCertificates || 'Certificates'}</span></button>
                    </div>
                </div>
            </div>
        </header>
        <button type="button" class="arborito-desktop-sage-fab arborito-desktop-hit js-btn-desktop-sage ${sageActive ? 'is-active' : ''}" data-arbor-tour="sage-fab" aria-label="${ui.navSage || 'Sage'}" title="${ui.navSage || 'Sage'}">
            <span class="arborito-desktop-sage-fab__ic" aria-hidden="true">🦉</span>
        </button>
        ` : ``}
        ${isDesktop ? `
        ` : `
        <div class="arborito-mob-dock-wrap" role="presentation">
            <div class="arborito-app-nav-inner">
            <nav class="arborito-mob-dock" role="navigation" aria-label="Main navigation">
                <div class="arborito-desktop-nav-group arborito-desktop-nav-group--primary">
                <button type="button" class="js-btn-home-mobile-dock arborito-mob-tab ${homeActive ? 'arborito-mob-tab--active' : ''}" data-arbor-tour="mob-home" aria-label="Home" title="Home" ${homeActive ? 'aria-current="page"' : ''}>
                    <span class="arborito-mob-tab__icon" aria-hidden="true">🌳</span>
                    <span class="arborito-mob-tab__label">Home</span>
                </button>
                <button type="button" class="js-btn-search-mobile-dock arborito-mob-tab ${searchActive ? 'arborito-mob-tab--active' : ''}" data-arbor-tour="mob-search" aria-label="${ui.navSearch}" title="${ui.navSearch}">
                    <span class="arborito-mob-tab__icon" aria-hidden="true">🔍</span>
                    <span class="arborito-mob-tab__label">${ui.navSearch}</span>
                </button>
                <button type="button" class="js-btn-sage-mobile-dock arborito-mob-tab ${sageActive ? 'arborito-mob-tab--active' : ''}" data-arbor-tour="mob-sage" aria-label="${ui.navSage}" title="${ui.navSage}">
                    <span class="arborito-mob-tab__icon" aria-hidden="true">🦉</span>
                    <span class="arborito-mob-tab__label">${ui.navSageDock || ui.navSage}</span>
                </button>
                <button type="button" class="js-btn-arcade-mobile-dock arborito-mob-tab relative ${arcadeActive ? 'arborito-mob-tab--active' : ''}" data-arbor-tour="mob-arcade" aria-label="${ui.navArcade || 'Arcade'}${dueCount > 0 ? ` (${dueCount} pending)` : ''}" title="${ui.navArcade || 'Arcade'}">
                    <span class="arborito-mob-tab__icon" aria-hidden="true">🎮</span>
                    <span class="arborito-mob-tab__label">${ui.navArcade || 'Arcade'}</span>
                    ${dueCount > 0 ? '<span class="arborito-mob-tab__badge" aria-hidden="true"></span>' : ''}
                </button>
                </div>
                <div class="arborito-desktop-nav-group arborito-desktop-nav-group--footer">
                <button type="button" class="js-btn-menu-mobile arborito-mob-tab ${moreActive ? 'arborito-mob-tab--active' : ''}" data-arbor-tour="mob-more" aria-label="${ui.navMore || 'More options'}" title="${ui.navMore || 'More'}" aria-expanded="${ctx.isMobileMenuOpen}">
                    <span class="arborito-mob-tab__icon arborito-mob-tab__icon--menu" aria-hidden="true">☰</span>
                    <span class="arborito-mob-tab__label">${ui.navMore || 'More'}</span>
                </button>
                </div>
            </nav>
            </div>
        </div>
        `}
        ${mobileMenuHtml}
        `,
        isDesktop,
        currentKey
    };
}
