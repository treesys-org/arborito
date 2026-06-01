
import { store } from '../../../core/store.js';
import { useDockModalChrome, isDesktopForestInlineSearch, shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { isModalBackdropEmptyTap, bindCloseTaps } from '../../../shared/ui/mobile-tap.js';
import { DOCK_SHEET_BODY_WRAP } from '../../../shared/ui/dock-sheet-chrome.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { updateSearchResultsPanels } from '../search-panel.js';
import { applySearchIndexBanner } from '../search-index-banner.js';

class ArboritoModalSearch extends HTMLElement {
    constructor() {
        super();
        this.state = {
            query: '',
            results: [],
            isSearching: false
        };
        this.searchTimer = null;
        this._lastLang = null;
        this._searchTouchStart = { x: 0, y: 0 };
        this._lastSearchResultTouchAt = 0;
        /* Capture: #modal-panel stops bubble to backdrop, so delegation on this must run in capture phase */
        this._onSearchResultClick = (e) => {
            if (Date.now() - this._lastSearchResultTouchAt < 450) {
                e.preventDefault();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                return;
            }
            const btn = e.target.closest && e.target.closest('.btn-search-result');
            if (!btn || !this.contains(btn)) return;
            this.pickSearchResult(btn);
        };
        this._onSearchTouchStartCapture = (e) => {
            const pt = (e.touches ? e.touches[0] : undefined) || (e.changedTouches ? e.changedTouches[0] : undefined);
            if (!pt) return;
            this._searchTouchStart = { x: pt.clientX, y: pt.clientY };
        };
        this._onSearchTouchEndCapture = (e) => {
            if (!(e.changedTouches && e.changedTouches.length)) return;
            const t = e.changedTouches[0];
            if (
                Math.abs(t.clientX - this._searchTouchStart.x) > 14 ||
                Math.abs(t.clientY - this._searchTouchStart.y) > 14
            ) {
                return;
            }
            let el = null;
            try {
                el = document.elementFromPoint(t.clientX, t.clientY);
            } catch {
                return;
            }
            const btn = (el && el.closest ? el.closest('.btn-search-result') : null);
            if (!btn || !this.contains(btn)) return;
            try {
                e.preventDefault();
            } catch {
                /* noop */
            }
            this._lastSearchResultTouchAt = Date.now();
            this.pickSearchResult(btn);
        };
    }

    async pickSearchResult(btn) {
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
        if (!nodeId && (data && data.id) != null) nodeId = String(data.id);
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
            ? { ...(data || {}), ...node, path: node.path || node.p || (data && data.path) || (data && data.p) || pathHint }
            : { ...(data || {}), id: nodeId, path: (data && data.path) || (data && data.p) || pathHint };
        this.close();
        await store.navigateTo(nodeId, payload);
    }

    connectedCallback() {
        const ui = store.ui;
        this.render(ui);
        this.addEventListener('click', this._onSearchResultClick, true);
        this.addEventListener('touchstart', this._onSearchTouchStartCapture, { passive: true, capture: true });
        this.addEventListener('touchend', this._onSearchTouchEndCapture, { passive: false, capture: true });
        this.bindEvents();
        // Anti-flicker: Re-render only on language change to update text
        this._lastLang = store.value.lang;
        this._storeListener = (e) => {
            const d = e.detail;
            if (d && (d.searchIndexStatus !== undefined || d.searchIndexError !== undefined)) {
                applySearchIndexBanner(this.querySelector('#search-index-banner'), store.value, store.ui);
            }
            const nextLang = (d && d.lang);
            if (!nextLang || nextLang === this._lastLang) return;
            this._lastLang = nextLang;
            this.render(store.ui);
            this.bindEvents();
            applySearchIndexBanner(this.querySelector('#search-index-banner'), store.value, store.ui);
            // Restore focus (desktop only — mobile keyboard would cover the dock).
            const inp = this.querySelector('#inp-search');
            if (inp && !shouldShowMobileUI()) inp.focus();
        };
        store.addEventListener('state-change', this._storeListener);
        
        this.updateResultsDOM();
        applySearchIndexBanner(this.querySelector('#search-index-banner'), store.value, store.ui);
    }

    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.removeEventListener('click', this._onSearchResultClick, true);
        this.removeEventListener('touchstart', this._onSearchTouchStartCapture, true);
        this.removeEventListener('touchend', this._onSearchTouchEndCapture, true);
    }

    close() {
        store.dismissModal();
    }

    render(ui) {
        const dockChrome = useDockModalChrome();
        const head = modalHeroHtml(ui, {
            mobile: dockChrome,
            title: ui.navSearch || 'Search',
            leadingIcon: '<span class="text-2xl shrink-0" aria-hidden="true">🔍</span>',
            tagClass: 'btn-close-search',
        });
        const inputRadius = dockChrome ? 'rounded-lg' : 'rounded-xl';
        /* Campo y lista: mismo cromado claro/oscuro en dock y en tarjeta centrada (alineado a la barra inline) */
        const inputClass = `arborito-input arborito-input--search h-11 py-0 font-semibold ${inputRadius} pr-4 shadow-sm transition-all`;
        const field = `
                <div class="arborito-field-wrap w-full ${dockChrome ? 'mb-3' : 'mb-4'} group shrink-0">
                    <span class="arborito-search-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" class="w-[18px] h-[18px]" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                    </span>
                    <input id="inp-search" type="search" enterkeyhint="search" placeholder="${ui.searchPlaceholder || "Search topics..."}" 
                        class="${inputClass}"
                        value="${this.state.query}"${shouldShowMobileUI() ? '' : ' autofocus'} autocomplete="off" aria-label="${ui.navSearch || 'Search'}">
                </div>`;
        const listShell = dockChrome
            ? 'flex-1 overflow-y-auto custom-scrollbar min-h-0 border-0 shadow-none bg-transparent rounded-none hidden arborito-search-results-list arborito-search-results-list--dock-light border-t border-slate-200/60 dark:border-slate-700/50 pt-2 mt-1'
            : 'flex-1 overflow-y-auto custom-scrollbar min-h-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 shadow-inner hidden arborito-search-results-list arborito-search-results-list--dock-light';
        const body = `
                ${field}
                <div id="search-index-banner" class="hidden text-center text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/10 dark:bg-amber-500/15 rounded-xl px-3 py-2 mb-2 border border-amber-200/80 dark:border-amber-700/50" aria-live="polite"></div>
                <div id="search-msg-area" class="text-center text-slate-600 dark:text-slate-400 py-4 font-medium text-sm transition-opacity duration-300 hidden">
                    ${ui.searchKeepTyping}
                </div>
                <div id="search-results-list" class="${listShell}">
                </div>`;

        const mobUi = shouldShowMobileUI();
        if (dockChrome) {
            /* Anchored over the bottom dock pill — uses `dock-bottom` layout. */
            const dockBody = `
                    ${head}
                    <div class="${DOCK_SHEET_BODY_WRAP}">
                        ${body}
                    </div>`;
            this.innerHTML = modalShellHtml({
                bodyHtml: dockBody,
                mobile: true,
                layout: 'dock-bottom',
                panelRadius: 'none',
                panelClass: 'arborito-modal-dock-panel w-full max-h-full',
                rootFlags: 'arborito-modal--search arborito-modal-search-dock',
            });
        } else {
            const cardBody = `<div class="arborito-float-modal-card__inner p-3 md:p-4 flex flex-col min-h-0">
                ${head}
                <div class="flex-1 flex flex-col min-h-0 mt-2">
                    ${body}
                </div>
            </div>`;
            this.innerHTML = modalShellHtml({
                bodyHtml: cardBody,
                mobile: false,
                layout: 'centered',
                panelSize: 'search',
                panelRadius: '2xl',
                rootFlags: 'arborito-modal--search',
            });
        }
    }

    updateResultsDOM() {
        const list = this.querySelector('#search-results-list');
        const msgArea = this.querySelector('#search-msg-area');
        const ui = store.ui;
        updateSearchResultsPanels(list, msgArea, this.state, ui, {
            reopenSearch: () => {
                if (isDesktopForestInlineSearch()) {
                    window.dispatchEvent(new CustomEvent('arborito-desktop-search-refresh'));
                } else {
                    store.setModal({ type: 'search', dockUi: useDockModalChrome() });
                }
            },
            lightChrome: true,
        });
    }

    bindEvents() {
        const inp = this.querySelector('#inp-search');
        const backdrop = this.querySelector('#modal-backdrop');
        const panel = this.querySelector('#modal-panel');
        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (isModalBackdropEmptyTap(backdrop, e)) this.close();
            });
        }
        if (panel) panel.onclick = (e) => e.stopPropagation();
        bindCloseTaps(this, () => this.close(), '.btn-close-search');
        
        if (inp) {
            // Restore query if re-binding
            inp.value = this.state.query;

            /* On mobile, do NOT auto-focus: that pops the virtual keyboard which then
             * covers the bottom dock and the user can't tap another dock button (or the
             * lupa again) to dismiss search. Let the user tap the input themselves. */
            if (!shouldShowMobileUI()) inp.focus();
            inp.oninput = (e) => {
                const q = e.target.value;
                this.state.query = q;
                
                if (this.searchTimer) clearTimeout(this.searchTimer);
                
                if (q.length === 0) {
                    this.state.results = [];
                    this.state.isSearching = false;
                    this.updateResultsDOM();
                } else if (q.length === 1) {
                    this.state.isSearching = true;
                    this.updateResultsDOM();
                    
                    this.searchTimer = setTimeout(async () => {
                        if (this.state.query !== q) return;
                        try {
                            this.state.results = await store.searchBroad(q);
                        } catch {
                            this.state.results = [];
                        } finally {
                            if (this.state.query === q) {
                                this.state.isSearching = false;
                                this.updateResultsDOM();
                            }
                        }
                    }, 3000);
                } else {
                    this.state.isSearching = true;
                    this.updateResultsDOM();
                    this.searchTimer = setTimeout(async () => {
                        try {
                            this.state.results = await store.search(q);
                        } catch {
                            this.state.results = [];
                        } finally {
                            this.state.isSearching = false;
                            this.updateResultsDOM();
                        }
                    }, 300);
                }
            };
            
            // ESC key handler is handled globally, but we can add local support too
            inp.onkeydown = (e) => {
                if(e.key === 'Escape') {
                    inp.blur();
                    this.close();
                }
                if(e.key === 'Enter') {
                    inp.blur();
                }
            }

            /* On mobile+dock, blur from tapping bottom bar closed search before dock got the tap */
            if (!shouldShowMobileUI()) {
                inp.addEventListener('blur', () => {
                    setTimeout(() => {
                        if (!this.contains(document.activeElement)) {
                            this.close();
                        }
                    }, 150);
                });
            }
        }
    }
}
customElements.define('arborito-modal-search', ArboritoModalSearch);
