import { store } from '../store.js';
import { ArboritoComponent } from '../utils/component.js';
import { curriculumBaseName } from '../utils/version-switch-logic.js';
import { bindMobileTap } from '../utils/mobile-tap.js';
import { shouldShowMobileUI, initMobileDetection, useDockModalChrome } from '../utils/breakpoints.js';
import { updateSearchResultsPanels } from '../utils/search-panel.js';
import { applySearchIndexBanner } from '../utils/search-index-banner.js';
import { renderSidebarHtml } from './sidebar-template.js';
import { syncMobileTreeShellClass } from '../utils/mobile-tree-shell-class.js';


initMobileDetection();

class ArboritoSidebar extends ArboritoComponent {
    constructor() { 
        super();
        this.isMobileMenuOpen = false;
        this.mobileMenuStack = [];
        this.renderKey = null;
        /** @type {null | 'forward' | 'back'} drill animation direction for mobile “Más” body */
        this._mmenuPaneDir = null;
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
            /* Close dock modals so Sage/search/arcade are not left “under” the menu */
            const m = store.value.modal;
            const t = m && (typeof m === 'string' ? m : m.type);
            if (t === 'search' || t === 'sage' || t === 'arcade' || t === 'forum') {
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
            this.renderKey = null;
            this.render();
        } else {
            this.toggleMobileMenu();
        }
    }

    /** After closing a modal opened from More (`fromMobileMore`), return to root sheet. */
    openMobileMoreMenu() {
        this.isMobileMenuOpen = true;
        this.mobileMenuStack = [];
        this.renderKey = null;
        this.render();
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
        const mobileMenuAction = (fn) => {
            return (e) => {
                const wasOpen = this.isMobileMenuOpen;
                const fromMmenu = wasOpen;
                if (wasOpen) {
                    this.isMobileMenuOpen = false;
                }
                fn(e, fromMmenu);
                if (wasOpen) {
                    queueMicrotask(() => {
                        this.renderKey = null;
                        this.render();
                    });
                }
            };
        };
        /** Modal from More sheet: single way to set `fromMobileMore` (back → reopens More). */
        const mmenuOpenModal = (payload) =>
            mobileMenuAction((_, fromMmenu) => {
                store.setModal(fromMmenu ? { ...payload, fromMobileMore: true } : payload);
            });
        
        this.querySelectorAll('.js-btn-search-mobile-dock').forEach((b) =>
            bindMobileTap(b, () => {
                this.closeMobileMenuIfOpen();
                store.setModal({ type: 'search', dockUi: true });
            })
        );
        this.querySelectorAll('.js-btn-arcade-mobile-dock').forEach((b) =>
            bindMobileTap(b, () => {
                this.closeMobileMenuIfOpen();
                store.setModal({ type: 'arcade', dockUi: true });
            })
        );
        this.querySelectorAll('.js-btn-construct').forEach((b) =>
            bindMobileTap(b, mobileMenuAction(() => store.toggleConstructionMode()))
        );
        this.querySelectorAll('.js-btn-sage-mobile-dock').forEach((b) =>
            bindMobileTap(b, () => {
                this.closeMobileMenuIfOpen();
                store.setModal({ type: 'sage', dockUi: true });
            })
        );

        this.querySelectorAll('.js-btn-home-mobile-dock').forEach((btn) =>
            bindMobileTap(btn, () => {
                this.closeMobileMenuIfOpen();
                store.goHome();
            })
        );

        // --- DESKTOP HEADER EVENTS ---
        this.querySelectorAll('.js-btn-desktop-home').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.goHome();
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
            store.setModal({ type: 'sage', dockUi: useDockModalChrome() });
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
                store.openTreeIntroModal();
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
        this.querySelectorAll('.js-btn-desktop-manual').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.setModal('manual');
        });
        this.querySelectorAll('.js-btn-desktop-certs').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.setViewMode('certificates');
        });
        this.querySelectorAll('.js-btn-desktop-forum').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            store.setModal({ type: 'forum' });
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
                    store.setModal({ type: 'profile', focus: 'seeds' });
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
        if (mmenuPaneHost && this._mmenuPaneDir) {
            const dir = this._mmenuPaneDir;
            this._mmenuPaneDir = null;
            mmenuPaneHost.classList.remove('arborito-mmenu-pane--fwd', 'arborito-mmenu-pane--back');
            void mmenuPaneHost.offsetWidth;
            mmenuPaneHost.classList.add(dir === 'forward' ? 'arborito-mmenu-pane--fwd' : 'arborito-mmenu-pane--back');
        }

        if (isDesktop && this.desktopSearchOpen) {
            queueMicrotask(() => this._bindDesktopSearch());
        }

        syncMobileTreeShellClass(store, { mobileMoreOpen: this.isMobileMenuOpen });
    }
}
customElements.define('arborito-sidebar', ArboritoSidebar);
