
import { store } from '../../store.js';
import { useDockModalChrome, isDesktopForestInlineSearch, shouldShowMobileUI } from '../../utils/breakpoints.js';
import { DOCK_SHEET_BODY_WRAP, modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { updateSearchResultsPanels } from '../../utils/search-panel.js';

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
        /* Capture: #modal-panel stops bubble to backdrop, so delegation on this must run in capture phase */
        this._onSearchResultClick = (e) => {
            const btn = e.target.closest && e.target.closest('.btn-search-result');
            if (!btn || !this.contains(btn)) return;
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
        this.close();
        await store.navigateTo(nodeId, payload);
    }

    connectedCallback() {
        const ui = store.ui;
        this.render(ui);
        this.addEventListener('click', this._onSearchResultClick, true);
        this.bindEvents();
        // Anti-flicker: Re-render only on language change to update text
        this._lastLang = store.value.lang;
        this._storeListener = (e) => {
            const nextLang = e.detail?.lang;
            if (!nextLang || nextLang === this._lastLang) return;
            this._lastLang = nextLang;
            this.render(store.ui);
            this.bindEvents();
            // Restore focus
            const inp = this.querySelector('#inp-search');
            if (inp) inp.focus();
        };
        store.addEventListener('state-change', this._storeListener);
        
        // Initial State: Show Bookmarks if query is empty
        this.updateResultsDOM();
    }

    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.removeEventListener('click', this._onSearchResultClick, true);
    }

    close() {
        store.dismissModal();
    }

    render(ui) {
        const dockChrome = useDockModalChrome();
        const head = dockChrome
            ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-close-search' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">🔍</span>
                    <div class="flex-1 min-w-0">
                        <h2 class="arborito-mmenu-subtitle m-0">${ui.navSearch || 'Search'}</h2>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-close-search')}
                </div>`
            : `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-close-search' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">🔍</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.navSearch || 'Search'}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close-search')}
                </div>`;
        const inputRadius = dockChrome ? 'rounded-lg' : 'rounded-xl';
        const field = `
                <div class="relative w-full ${dockChrome ? 'mb-3' : 'mb-4'} group shrink-0">
                    <span class="absolute left-4 inset-y-0 flex items-center text-slate-400 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-5 h-5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                    </span>
                    <input id="inp-search" type="text" placeholder="${ui.searchPlaceholder || "Search topics..."}" 
                        class="w-full h-14 ${dockChrome ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100' : 'bg-[#1e293b] border border-slate-700 text-slate-200'} ${inputRadius} pl-12 pr-14 font-bold outline-none focus:ring-2 focus:ring-emerald-500 ${dockChrome ? '' : 'shadow-sm'} text-lg transition-all ${dockChrome ? 'placeholder:text-slate-400' : 'placeholder:text-slate-500'}"
                        value="${this.state.query}" autofocus autocomplete="off">
                    <div class="absolute right-3 inset-y-0 flex items-center gap-2 pointer-events-auto">
                    </div>
                </div>`;
        /* Dock: sin segunda “tarjeta”; mismo criterio que Arcade (#modal-content) — lista sobre el gradiente del panel */
        const listShell = dockChrome
            ? 'flex-1 overflow-y-auto custom-scrollbar min-h-0 border-0 shadow-none bg-transparent rounded-none hidden arborito-search-results-list arborito-search-results-list--dock-light border-t border-slate-200/60 dark:border-slate-700/50 pt-2 mt-1'
            : 'flex-1 overflow-y-auto custom-scrollbar bg-[#1e293b] rounded-xl border border-slate-600/80 shadow-inner hidden min-h-0 arborito-search-results-list';
        const body = `
                ${field}
                <div id="search-msg-area" class="text-center text-slate-500 dark:text-slate-400 py-4 font-medium text-sm transition-opacity duration-300 hidden">
                    ${ui.searchKeepTyping}
                </div>
                <div id="search-results-list" class="${listShell}">
                </div>`;

        if (dockChrome) {
            const mobUi = shouldShowMobileUI();
            const rootCls = `arborito-modal-root arborito-modal--search arborito-modal-search-dock${mobUi ? ' arborito-modal--mobile' : ''}`;
            /* inset-0 cubriría el dock; bottom explícito para que el tap llegue a la barra inferior */
            this.innerHTML = `
            <div id="modal-backdrop" class="${rootCls} fixed z-[70] flex flex-col items-stretch justify-start p-0 m-0 bg-slate-950 animate-in fade-in" style="top:0;left:0;right:0;bottom:var(--arborito-mob-dock-clearance,4.25rem);width:100%;max-width:100vw;height:auto;min-height:0;max-height:none;box-sizing:border-box;">
                <div id="modal-panel" class="arborito-modal-dock-panel w-full flex flex-col flex-1 min-h-0 min-w-0 h-full max-h-full cursor-auto overflow-hidden">
                    ${head}
                    <div class="${DOCK_SHEET_BODY_WRAP}">
                        ${body}
                    </div>
                </div>
            </div>`;
        } else {
            const mobUi = shouldShowMobileUI();
            const rootCls = `arborito-modal-root arborito-modal--search${mobUi ? ' arborito-modal--mobile' : ''}`;
            this.innerHTML = `
            <div id="modal-backdrop" class="${rootCls} fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in">
                <div id="modal-panel" class="arborito-float-modal-card arborito-float-modal-card--search flex flex-col relative cursor-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                    <div class="arborito-float-modal-card__inner p-3 md:p-4 flex flex-col min-h-0">
                    ${head}
                    <div class="flex-1 flex flex-col min-h-0 mt-2">
                        ${body}
                    </div>
                    </div>
                </div>
            </div>`;
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
            lightChrome: useDockModalChrome(),
        });
    }

    bindEvents() {
        const inp = this.querySelector('#inp-search');
        const backdrop = this.querySelector('#modal-backdrop');
        const panel = this.querySelector('#modal-panel');
        if (backdrop) {
            backdrop.onclick = (e) => {
                // Close only when clicking outside the panel
                if (e.target === backdrop) this.close();
            };
        }
        if (panel) panel.onclick = (e) => e.stopPropagation();
        this.querySelectorAll('.btn-close-search').forEach((b) => {
            b.onclick = () => this.close();
        });
        
        if (inp) {
            // Restore query if re-binding
            inp.value = this.state.query;
            
            inp.focus();
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

            /* En móvil+dock, el blur al tocar la barra inferior cerraba la búsqueda antes de que el dock recibiera el tap */
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
