import { store } from '../../core/store.js';
import { ArboritoComponent } from '../../shared/ui/component.js';
import { curriculumBaseName } from '../version-updates/version-switch-logic.js';
import { bindMobileTap } from '../../shared/ui/mobile-tap.js';
import { shouldShowMobileUI, initMobileDetection, useDockModalChrome } from '../../shared/ui/breakpoints.js';
import { updateSearchResultsPanels } from '../search/search-panel.js';
import { applySearchIndexBanner } from '../search/search-index-banner.js';
import { renderSidebarHtml, buildMobileMoreMenuParts } from './sidebar-template.js';
import { syncMobileTreeShellClass } from '../../shared/ui/mobile-tree-shell-class.js';


initMobileDetection();

class ArboritoSidebar extends ArboritoComponent {
    constructor() { 
        super();
        this.isMobileMenuOpen = false;
        this.mobileMenuStack = [];
        this.renderKey = null;
        /** @type {null | 'forward' | 'back'} drill animation direction for mobile “Más” body */
        this._mmenuPaneDir = null;
        /** When true, the next More sheet paint uses the dock slide-in (first open only). */
        this._mmenuFreshEnter = false;
        /** When true, reopening More after a modal (no enter animation). */
        this._mmenuReopenInstant = false;
        /** @type {string|null} pending About tab after drill */
        this._aboutDrillTab = null;
        this._aboutDrillImpressum = false;
        /** Desktop forest: search panel in header (no modal). */
        this.desktopSearchOpen = false;
        this._ds = { query: '', results: [], isSearching: false };
        this._dsTimer = null;
        this._deskSearchClickCapture = null;
    }

    /** Close bottom sheet and reset drill stack (e.g. before opening a dock modal). */
    closeMobileMenuIfOpen() {
        if (!this.isMobileMenuOpen) return;
        this.isMobileMenuOpen = false;
        this.mobileMenuStack = [];
        this.renderKey = null;
        this.render();
    }

    /** @override */
    update() {
        this.render();
    }

    connectedCallback() {
        super.connectedCallback();
        this._resizeHandler = () => {
            this.renderKey = null;
            this.scheduleUpdate(true);
        };
        window.addEventListener('resize', this._resizeHandler);
        window.addEventListener('orientationchange', () => setTimeout(this._resizeHandler, 200));

        this._onDeskSearchOpen = () => {
            if (!document.documentElement.classList.contains('arborito-desktop') || shouldShowMobileUI()) return;
            this.desktopSearchOpen = true;
            this._ds = { query: '', results: [], isSearching: false };
            if (this._dsTimer) clearTimeout(this._dsTimer);
            this._dsTimer = null;
            this.renderKey = null;
            this.render();
        };
        this._onDeskSearchRefresh = () => {
            if (!this.desktopSearchOpen) return;
            queueMicrotask(() => this._refreshDesktopSearchResults());
        };
        window.addEventListener('arborito-desktop-search-open', this._onDeskSearchOpen);
        window.addEventListener('arborito-desktop-search-refresh', this._onDeskSearchRefresh);

        this._deskSearchEscape = (e) => {
            if (e.key !== 'Escape' || !this.desktopSearchOpen) return;
            if (!document.documentElement.classList.contains('arborito-desktop') || shouldShowMobileUI()) return;
            this._closeDesktopSearch();
        };
        document.addEventListener('keydown', this._deskSearchEscape);

        this._syncDeskIndexBanner = () => {
            if (!this.desktopSearchOpen) return;
            const b = this.querySelector('#arborito-desk-search-index-banner');
            applySearchIndexBanner(b, store.value, store.ui);
        };
        store.addEventListener('state-change', this._syncDeskIndexBanner);
    }

    disconnectedCallback() {
        if (this._syncDeskIndexBanner) {
            store.removeEventListener('state-change', this._syncDeskIndexBanner);
            this._syncDeskIndexBanner = null;
        }
        super.disconnectedCallback();
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
        if (this._escapeHandler) document.removeEventListener('keydown', this._escapeHandler);
        if (this._onDeskSearchOpen) window.removeEventListener('arborito-desktop-search-open', this._onDeskSearchOpen);
        if (this._onDeskSearchRefresh) window.removeEventListener('arborito-desktop-search-refresh', this._onDeskSearchRefresh);
        if (this._deskSearchEscape) document.removeEventListener('keydown', this._deskSearchEscape);
        if (this._dsTimer) clearTimeout(this._dsTimer);
        if (this._deskSearchClickCapture) document.removeEventListener('click', this._deskSearchClickCapture, true);
    }

    toggleMobileMenu() {
        const opening = !this.isMobileMenuOpen;
        if (opening) {
            this.mobileMenuStack = [];
            this._mmenuFreshEnter = true;
            /* Close *any* modal that the user could otherwise see "under" the More sheet
             * (Profile, Privacy, Tree-info, Backup, About, Sources, etc.). Modals with
             * their own confirm/cleanup flow (game-player, onboarding gate) are skipped so
             * the user is not pulled out of a critical step. */
            const m = store.value.modal;
            const t = m && (typeof m === 'string' ? m : m.type);
            const keepOpen = new Set(['game-player', 'onboarding']);
            if (t && !keepOpen.has(t)) {
                store.setModal(null);
            }
        }
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
        this.render();
    }

    mobileMenuGoBack() {
        if (this.mobileMenuStack.length > 0) {
            this._mmenuPaneDir = 'back';
            this.mobileMenuStack.pop();
            if (this._patchMobileMenuDrill()) return;
            this.renderKey = null;
            this.render();
        } else {
            this.toggleMobileMenu();
        }
    }

    /** Update hero + pane in place (no full sidebar remount) when drilling “Más”. */
    _patchMobileMenuDrill() {
        const menu = this.querySelector('#mobile-menu');
        const host = menu?.querySelector('.arborito-mmenu-pane-host');
        const paneBody = host?.querySelector('.arborito-mmenu-pane-body');
        if (!menu || !host || !paneBody || !this.isMobileMenuOpen) return false;

        const parts = buildMobileMoreMenuParts(this);
        const heroSlot = menu.querySelector(':scope > .arborito-sheet__hero--mmenu-sub, :scope > .arborito-sheet__hero');
        if (heroSlot) {
            const tmp = document.createElement('div');
            tmp.innerHTML = parts.heroHtml.trim();
            const nextHero = tmp.firstElementChild;
            if (nextHero) heroSlot.replaceWith(nextHero);
        }

        host.className = `arborito-mmenu-scroll arborito-mmenu-pane-host custom-scrollbar${parts.scrollExtra}`;
        host.style.paddingBottom = 'calc(1.25rem + env(safe-area-inset-bottom, 12px))';
        paneBody.innerHTML = parts.bodyHtml;

        this._applyMmenuPaneAnimation(host, paneBody);
        this._bindMobileMenuPanelEvents();
        syncMobileTreeShellClass(store, { mobileMoreOpen: true });
        return true;
    }

    _applyMmenuPaneAnimation(host, paneBody) {
        const body = paneBody || host?.querySelector('.arborito-mmenu-pane-body');
        if (!body || !this._mmenuPaneDir) return;
        const dir = this._mmenuPaneDir;
        this._mmenuPaneDir = null;
        body.classList.remove('arborito-mmenu-pane--fwd', 'arborito-mmenu-pane--back');
        void body.offsetWidth;
        body.classList.add(dir === 'forward' ? 'arborito-mmenu-pane--fwd' : 'arborito-mmenu-pane--back');
    }

    _bindMobileMenuPanelEvents() {
        const isDesktop = !shouldShowMobileUI();
        if (isDesktop || !this.isMobileMenuOpen) return;

        const mmenuOpenModal = (payload) =>
            this._mobileMenuAction((_, fromMmenu) => {
                store.setModal(fromMmenu ? { ...payload, fromMobileMore: true } : payload);
            });

        this.querySelectorAll('.js-mmenu-forum').forEach((b) => {
            bindMobileTap(b, mmenuOpenModal({ type: 'forum' }));
        });
        /* "Sonidos y animaciones" entry surfaces what previously lived inside Profile.
         * Backup stays in Profile (next to Privacy & data) so it doesn't pollute the
         * top-level menu. */
        this.querySelectorAll('.js-mmenu-celebration').forEach((b) => {
            bindMobileTap(b, mmenuOpenModal({ type: 'celebration-prefs' }));
        });
        this.querySelectorAll('.js-mmenu-back').forEach((b) => bindMobileTap(b, () => this.mobileMenuGoBack()));
        this.querySelectorAll('.js-mmenu-push').forEach((b) =>
            bindMobileTap(b, () => {
                const p = b.dataset.pane;
                if (!p) return;
                this._mmenuPaneDir = 'forward';
                if (p === 'language') {
                    this.mobileMenuStack.push('language');
                } else {
                    this.mobileMenuStack = [p];
                }
                if (this._patchMobileMenuDrill()) return;
                this.renderKey = null;
                this.render();
            })
        );
        this.querySelectorAll('.js-btn-lang-pick').forEach((b) =>
            bindMobileTap(b, async () => {
                this._mmenuPaneDir = 'back';
                if (this.mobileMenuStack.length > 0) this.mobileMenuStack.pop();
                const code = b.dataset.code;
                if (this._patchMobileMenuDrill()) {
                    try {
                        await store.setLanguage(code);
                    } catch (e) {
                        console.error('[Arborito] sidebar language pick', e);
                    }
                    return;
                }
                this.renderKey = null;
                this.render();
                try {
                    await store.setLanguage(code);
                } catch (e) {
                    console.error('[Arborito] sidebar language pick', e);
                }
            })
        );
        this.querySelectorAll('.js-btn-construct').forEach((b) =>
            bindMobileTap(b, this._mobileMenuAction(() => store.toggleConstructionMode()))
        );
    }

    /** Close More sheet before running an action; reopen after if it was open. */
    _mobileMenuAction(fn) {
        return (e) => {
            const wasOpen = this.isMobileMenuOpen;
            const fromMmenu = wasOpen;
            if (wasOpen) {
                this.isMobileMenuOpen = false;
            }
            fn(e, fromMmenu);
            const m = store.value.modal;
            const keepMoreDom =
                wasOpen &&
                m &&
                typeof m === 'object' &&
                m.fromMobileMore;
            if (wasOpen && !keepMoreDom) {
                queueMicrotask(() => {
                    this.renderKey = null;
                    this.render();
                });
            }
        };
    }

    /** After closing a modal opened from More (`fromMobileMore`), return to root sheet. */
    openMobileMoreMenu() {
        this.isMobileMenuOpen = true;
        this.mobileMenuStack = [];
        this._mmenuFreshEnter = false;
        this._mmenuReopenInstant = true;
        if (this._patchMobileMenuDrill()) {
            this._mmenuReopenInstant = false;
            return;
        }
        this.renderKey = null;
        this.render();
    }

    /** Drill “Más” to About (e.g. legal tab) without opening a separate modal. */
    _drillMobileMoreAbout(tab = 'manifesto') {
        this.isMobileMenuOpen = true;
        this._mmenuPaneDir = 'forward';
        this.mobileMenuStack = ['about'];
        this._mmenuFreshEnter = false;
        this._aboutDrillTab = tab;
        if (this._patchMobileMenuDrill()) {
            this._applyAboutEmbedTab();
            return;
        }
        this.renderKey = null;
        this.render();
        queueMicrotask(() => this._applyAboutEmbedTab());
    }

    _applyAboutEmbedTab() {
        const tab = this._aboutDrillTab || 'manifesto';
        this._aboutDrillTab = null;
        const about = this.querySelector('#mobile-menu arborito-modal-about[embed]');
        if (about && typeof about.openTab === 'function') {
            about.openTab(tab);
        }
    }

    _closeDesktopSearch() {
        this.desktopSearchOpen = false;
        if (this._dsTimer) clearTimeout(this._dsTimer);
        this._dsTimer = null;
        this._ds = { query: '', results: [], isSearching: false };
        if (this._deskSearchClickCapture) {
            document.removeEventListener('click', this._deskSearchClickCapture, true);
            this._deskSearchClickCapture = null;
        }
        this.renderKey = null;
        this.render();
    }

    async _pickDesktopSearchResult(btn) {
        let nodeId = btn.getAttribute('data-node-id');
        if (nodeId) {
            try {
                nodeId = decodeURIComponent(nodeId);
            } catch {
                /* keep raw */
            }
        }
        let data = null;
        const raw = btn.getAttribute('data-json');
        if (raw) {
            try {
                data = JSON.parse(decodeURIComponent(raw));
            } catch {
                /* fall back to data-node-id */
            }
        }
        if (!nodeId && data?.id != null) nodeId = String(data.id);
        if (!nodeId) return;

        let pathHint = btn.getAttribute('data-breadcrumb');
        if (pathHint) {
            try {
                pathHint = decodeURIComponent(pathHint);
            } catch {
                /* keep raw */
            }
        }

        const node = store.findNode(nodeId);
        const payload = node
            ? { ...(data || {}), ...node, path: node.path || node.p || data?.path || data?.p || pathHint }
            : { ...(data || {}), id: nodeId, path: data?.path || data?.p || pathHint };
        await store.navigateTo(nodeId, payload);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => this._closeDesktopSearch());
        });
    }

    _refreshDesktopSearchResults() {
        const list = this.querySelector('#arborito-desk-search-results');
        const msg = this.querySelector('#arborito-desk-search-msg');
        if (!list || !msg) return;
        const b = this.querySelector('#arborito-desk-search-index-banner');
        applySearchIndexBanner(b, store.value, store.ui);
        const ui = store.ui;
        updateSearchResultsPanels(list, msg, this._ds, ui, {
            reopenSearch: () => {
                if (this.desktopSearchOpen) this._refreshDesktopSearchResults();
            },
        });
    }

    _bindDesktopSearch() {
        const wrap = this.querySelector('.arborito-desktop-header__search-wrap');
        const inp = this.querySelector('#arborito-desk-search-input');
        const list = this.querySelector('#arborito-desk-search-results');
        const msg = this.querySelector('#arborito-desk-search-msg');
        if (!wrap || !inp || !list || !msg) return;

        if (this._deskSearchClickCapture) {
            document.removeEventListener('click', this._deskSearchClickCapture, true);
            this._deskSearchClickCapture = null;
        }
        this._deskSearchClickCapture = (e) => {
            if (!this.desktopSearchOpen) return;
            if (wrap.contains(e.target)) return;
            this._closeDesktopSearch();
        };
        queueMicrotask(() => {
            if (this._deskSearchClickCapture) document.addEventListener('click', this._deskSearchClickCapture, true);
        });

        wrap.addEventListener(
            'click',
            (e) => {
                const btn = e.target.closest && e.target.closest('.btn-search-result');
                if (btn && wrap.contains(btn)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this._pickDesktopSearchResult(btn);
                }
            },
            true
        );

        inp.value = this._ds.query;
        inp.focus();

        const runUpdate = () => this._refreshDesktopSearchResults();

        inp.oninput = (e) => {
            const q = e.target.value;
            this._ds.query = q;
            if (this._dsTimer) clearTimeout(this._dsTimer);

            if (q.length === 0) {
                this._ds.results = [];
                this._ds.isSearching = false;
                runUpdate();
            } else if (q.length === 1) {
                this._ds.isSearching = true;
                runUpdate();
                this._dsTimer = setTimeout(async () => {
                    if (this._ds.query !== q) return;
                    try {
                        this._ds.results = await store.searchBroad(q);
                    } catch {
                        this._ds.results = [];
                    } finally {
                        if (this._ds.query === q) {
                            this._ds.isSearching = false;
                            runUpdate();
                        }
                    }
                }, 3000);
            } else {
                this._ds.isSearching = true;
                runUpdate();
                this._dsTimer = setTimeout(async () => {
                    try {
                        this._ds.results = await store.search(q);
                    } catch {
                        this._ds.results = [];
                    } finally {
                        this._ds.isSearching = false;
                        runUpdate();
                    }
                }, 300);
            }
        };

        inp.onkeydown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                this._closeDesktopSearch();
            }
        };

        const closeBtn = this.querySelector('.js-desk-search-close');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this._closeDesktopSearch();
            };
        }

        runUpdate();
        this._syncDeskIndexBanner?.();
    }

    render() {
        const result = renderSidebarHtml(this);
        if (result?.skipped) return;
        const { html, isDesktop, currentKey } = result;
        if (currentKey === this.renderKey) return;
        this.renderKey = currentKey;
        
        this.classList.toggle('arborito-sidebar--desktop-chrome', isDesktop);
        this.innerHTML = html;
        // --- EVENT BINDING ---
        const mobileMenuAction = (fn) => this._mobileMenuAction(fn);
        /** Modal from More sheet: single way to set `fromMobileMore` (back → reopens More). */
        const mmenuOpenModal = (payload) =>
            mobileMenuAction((_, fromMmenu) => {
                store.setModal(fromMmenu ? { ...payload, fromMobileMore: true } : payload);
            });
        
        /**
         * Dock buttons are toggles: tapping the icon a second time closes its own dock modal.
         * Without this the user is trapped — tapping the same button just re-emits the modal
         * state and nothing visible changes, leaving the search panel covering the screen.
         */
        const dockToggleModal = (payload) => {
            const cur = store.value.modal;
            const curType = cur && (typeof cur === 'string' ? cur : cur.type);
            if (curType === payload.type) {
                store.setModal(null);
                return;
            }
            store.setModal(payload);
        };
        this.querySelectorAll('.js-btn-search-mobile-dock').forEach((b) =>
            bindMobileTap(b, () => {
                this.closeMobileMenuIfOpen();
                dockToggleModal({ type: 'search', dockUi: true });
            })
        );
        this.querySelectorAll('.js-btn-arcade-mobile-dock').forEach((b) =>
            bindMobileTap(b, () => {
                this.closeMobileMenuIfOpen();
                dockToggleModal({ type: 'arcade', dockUi: true });
            })
        );
        this.querySelectorAll('.js-btn-construct').forEach((b) =>
            bindMobileTap(b, mobileMenuAction(() => store.toggleConstructionMode()))
        );
        this.querySelectorAll('.js-btn-sage-mobile-dock').forEach((b) =>
            bindMobileTap(b, () => {
                this.closeMobileMenuIfOpen();
                const inLesson =
                    !!(store.value.selectedNode &&
                        (store.value.selectedNode.type === 'leaf' || store.value.selectedNode.type === 'exam'));
                dockToggleModal(
                    inLesson
                        ? { type: 'sage', mode: 'context', sageLessonContext: true }
                        : { type: 'sage', mode: 'context', dockUi: true }
                );
            })
        );

        this.querySelectorAll('.js-btn-home-mobile-dock').forEach((btn) =>
            bindMobileTap(btn, () => {
                this.closeMobileMenuIfOpen();
                store.requestGoHome();
            })
        );

        // --- DESKTOP HEADER EVENTS ---
        this.querySelectorAll('.js-btn-desktop-home').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.requestGoHome();
        });
        this.querySelectorAll('.js-btn-desktop-search').forEach((b) => {
            b.onclick = (e) => {
                e.stopPropagation();
                this.desktopSearchOpen = true;
                this._ds = { query: '', results: [], isSearching: false };
                if (this._dsTimer) clearTimeout(this._dsTimer);
                this._dsTimer = null;
                this.renderKey = null;
                this.render();
            };
        });
        const btnDesktopSage = this.querySelector('.js-btn-desktop-sage');
        if (btnDesktopSage) btnDesktopSage.onclick = (e) => {
            e.stopPropagation();
            store.setModal({
                type: 'sage',
                dockUi: useDockModalChrome(),
                sageLessonContext: !!(store.value.selectedNode && (store.value.selectedNode.type === 'leaf' || store.value.selectedNode.type === 'exam'))
            });
        };
        const btnDesktopArcade = this.querySelector('.js-btn-desktop-arcade');
        if (btnDesktopArcade) btnDesktopArcade.onclick = (e) => {
            e.stopPropagation();
            store.setModal({ type: 'arcade', dockUi: useDockModalChrome() });
        };
        this.querySelectorAll('.js-btn-desktop-sources').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.setModal('sources');
        });
        const openProfile = (e) => {
            e.stopPropagation();
            store.setModal({ type: 'profile', focus: 'seeds' });
        };
        const btnDesktopProfile = this.querySelector('.js-btn-desktop-profile');
        if (btnDesktopProfile) btnDesktopProfile.onclick = openProfile;
        this.querySelectorAll('.js-btn-desktop-profile-menu').forEach(b => b.onclick = openProfile);
        this.querySelectorAll('.js-btn-desktop-tree-info').forEach((b) => {
            b.onclick = (e) => {
                e.stopPropagation();
                store.openTreeInfoModal();
            };
        });

        this.querySelectorAll('.js-btn-desktop-language').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.setModal('language');
        });
        this.querySelectorAll('.js-btn-desktop-versions').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            // Unified entrypoint: open the curriculum switcher on the Versions tab.
            store.dispatchEvent(new CustomEvent('open-curriculum-switcher', { detail: { preferTab: 'version' } }));
        });
        this.querySelectorAll('.js-btn-desktop-about').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.setModal('about');
        });
        this.querySelectorAll('.js-btn-desktop-celebration').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.setModal('celebration-prefs');
        });
        this.querySelectorAll('.js-btn-desktop-certs').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.setViewMode('certificates');
        });
        this.querySelectorAll('.js-btn-desktop-forum').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.setModal({ type: 'forum' });
        });
        this.querySelectorAll('.js-btn-legal-shortcut').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            if (!isDesktop) {
                this._drillMobileMoreAbout('legal');
                return;
            }
            store.setModal({ type: 'about', tab: 'legal' });
        });

        const btnCloudEnable = this.querySelector('.js-cloudsync-enable');
        if (btnCloudEnable) {
            btnCloudEnable.onclick = (e) => {
                e.stopPropagation();
                store.enableCloudSyncFromBanner();
                this.renderKey = null;
                this.render();
            };
        }
        const btnCloudDismiss = this.querySelector('.js-cloudsync-dismiss');
        if (btnCloudDismiss) {
            btnCloudDismiss.onclick = (e) => {
                e.stopPropagation();
                store.dismissCloudSyncBanner();
                this.renderKey = null;
                this.render();
            };
        }

        this.querySelectorAll('.js-mmenu-forum').forEach((b) => {
            bindMobileTap(b, mmenuOpenModal({ type: 'forum' }));
        });
        /* "Sonidos y animaciones" row in the Más sheet root — bound here because
         * the first time the sheet opens we come through this main `render()`
         * path (not `_patchMobileMenuDrill`, which only fires on sub-pane
         * navigation). Without this binding the button looked tappable but was
         * a no-op on first open. (Backup lives in Profile next to Privacy.) */
        this.querySelectorAll('.js-mmenu-celebration').forEach((b) => {
            bindMobileTap(b, mmenuOpenModal({ type: 'celebration-prefs' }));
        });
        if (isDesktop) {
            this.querySelectorAll('.js-btn-theme-inline').forEach(b => b.onclick = (e) => {
                e.stopPropagation();
                store.toggleTheme();
                this.renderKey = null;
                this.render();
            });
        } else {
            this.querySelectorAll('.js-btn-theme-inline').forEach((b) =>
                bindMobileTap(b, () => {
                    store.toggleTheme();
                    this.renderKey = null;
                    this.render();
                })
            );
            this.querySelectorAll('.js-btn-mobile-profile').forEach((b) =>
                bindMobileTap(b, () => {
                    this.closeMobileMenuIfOpen();
                    const cur = store.value.modal;
                    const curType = cur && (typeof cur === 'string' ? cur : cur.type);
                    if (curType === 'profile') {
                        store.setModal(null);
                        return;
                    }
                    store.setModal({ type: 'profile', focus: 'seeds' });
                })
            );
            this.querySelectorAll('.js-btn-progress-mobile').forEach((b) =>
                bindMobileTap(b, () => {
                    document.dispatchEvent(new CustomEvent('toggle-progress-widget'));
                })
            );
        }

        const mobileMenuToggle = this.querySelector('.js-btn-menu-mobile');
        if (mobileMenuToggle) {
            bindMobileTap(mobileMenuToggle, (e) => {
                e.stopPropagation();
                this.toggleMobileMenu();
            });
        }
        if (!isDesktop && this.isMobileMenuOpen) {
            if (this._escapeHandler) {
                document.removeEventListener('keydown', this._escapeHandler);
                this._escapeHandler = null;
            }
            const backdrop = this.querySelector('#mobile-menu-backdrop');
            if (backdrop) bindMobileTap(backdrop, () => this.toggleMobileMenu());

            this.querySelectorAll('.js-mmenu-back').forEach((b) => bindMobileTap(b, () => this.mobileMenuGoBack()));
            this.querySelectorAll('.js-mmenu-push').forEach((b) =>
                bindMobileTap(b, () => {
                    const p = b.dataset.pane;
                    if (!p) return;
                    this._mmenuPaneDir = 'forward';
                    if (p === 'language') {
                        this.mobileMenuStack.push('language');
                    } else {
                        this.mobileMenuStack = [p];
                    }
                    if (this._patchMobileMenuDrill()) return;
                    this.renderKey = null;
                    this.render();
                })
            );
            this.querySelectorAll('.js-mmenu-open-switcher').forEach((b) =>
                bindMobileTap(b, () => {
                    this.closeMobileMenuIfOpen();
                    store.dispatchEvent(new CustomEvent('open-curriculum-switcher'));
                })
            );
            this.querySelectorAll('.js-btn-lang-pick').forEach((b) =>
                bindMobileTap(b, async () => {
                    this._mmenuPaneDir = 'back';
                    if (this.mobileMenuStack.length > 0) this.mobileMenuStack.pop();
                    const code = b.dataset.code;
                    if (this._patchMobileMenuDrill()) {
                        try {
                            await store.setLanguage(code);
                        } catch (e) {
                            console.error('[Arborito] sidebar language pick', e);
                        }
                        return;
                    }
                    this.renderKey = null;
                    this.render();
                    try {
                        await store.setLanguage(code);
                    } catch (e) {
                        console.error('[Arborito] sidebar language pick', e);
                    }
                })
            );
            this._escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    if (this.mobileMenuStack.length > 0) {
                        this._mmenuPaneDir = 'back';
                        this.mobileMenuStack.pop();
                        if (this._patchMobileMenuDrill()) return;
                        this.renderKey = null;
                        this.render();
                    } else {
                        this.toggleMobileMenu();
                    }
                }
            };
            document.addEventListener('keydown', this._escapeHandler);
        } else if (this._escapeHandler) {
            document.removeEventListener('keydown', this._escapeHandler);
            this._escapeHandler = null;
        }

        const mmenuPaneHost = this.querySelector('.arborito-mmenu-pane-host');
        const mmenuPaneBody = mmenuPaneHost?.querySelector('.arborito-mmenu-pane-body');
        this._applyMmenuPaneAnimation(mmenuPaneHost, mmenuPaneBody);

        if (isDesktop && this.desktopSearchOpen) {
            queueMicrotask(() => this._bindDesktopSearch());
        }

        this._mmenuFreshEnter = false;
        this._mmenuReopenInstant = false;
        syncMobileTreeShellClass(store, { mobileMoreOpen: this.isMobileMenuOpen });
    }
}
customElements.define('arborito-sidebar', ArboritoSidebar);

