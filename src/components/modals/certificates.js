import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { isModalBackdropEmptyTap } from '../../utils/mobile-tap.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { escHtml, escAttr } from '../graph/graph-mobile.js';

class ArboritoModalCertificates extends HTMLElement {
    constructor() {
        super();
        this.state = {
            searchQuery: '',
            showAll: false
        };
        this.lastRenderKey = null;
    }

    connectedCallback() {
        this.render();
        this._storeListener = () => this.render();
        store.addEventListener('state-change', this._storeListener);
    }

    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
    }

    close() {
        if (this.hasAttribute('embed')) {
            if (document.querySelector('arborito-sidebar') && document.querySelector('arborito-sidebar').closeMobileMenuIfOpen) document.querySelector('arborito-sidebar').closeMobileMenuIfOpen();
            return;
        }
        store.leaveCertificatesView();
    }

    render() {
        const ui = store.ui;
        const lang = store.value.lang;
        const theme = store.value.theme;
        const embedded = this.hasAttribute('embed');
        const mob = embedded ? true : shouldShowMobileUI();

        // Use new method to get all certificates, even unloaded ones
        const allCertifiable = store.getAvailableCertificates();

        // Anti-flicker key
        const renderKey = JSON.stringify({
            lang, theme, mob, embedded,
            search: this.state.searchQuery,
            showAll: this.state.showAll,
            count: allCertifiable.length,
            completedCount: allCertifiable.filter(c => c.isComplete).length
        });

        const query = this.state.searchQuery.toLowerCase();
        let filtered = allCertifiable.filter(m => m.name.toLowerCase().includes(query));
        
        const showAll = this.state.showAll;
        const visibleModules = showAll ? filtered : filtered.filter(m => m.isComplete);
        
        const toggleBtnLabel = showAll ? ui.showEarned || 'My Achievements' : ui.showAll || 'Show All';
        const toggleBtnText = escHtml(toggleBtnLabel);
        const toggleBtnClass = showAll
            ? 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-yellow-500/20' 
            : 'bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600';

        let listHtml = '';
        if (visibleModules.length === 0) {
            listHtml = `
            <div class="flex flex-col items-center justify-center h-full text-center opacity-50">
                <div class="text-8xl mb-6 grayscale">🎓</div>
                <h2 class="text-2xl font-bold mb-2 text-slate-800 dark:text-white">${escHtml(ui.noResults || 'No results')}</h2>
            </div>`;
        } else {
            const cardPad = mob ? 'p-4' : 'p-5';
            const cardGap = mob ? 'gap-3' : 'gap-4';
            const iconBox = mob ? 'w-14 h-14 text-3xl' : 'w-16 h-16 text-4xl';
            const titleCls = mob ? 'text-base' : 'text-lg';
            listHtml = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${mob ? 'gap-3' : 'gap-4'} overflow-y-auto custom-scrollbar ${mob ? 'p-0' : 'p-1'}">
                ${visibleModules.map(m => {
                    const isLocked = !m.isComplete;
                    const mid = escAttr(String(m.id));
                    const mname = escHtml(m.name);
                    const mic = isLocked ? '🔒' : escHtml(m.icon || '🎓');
                    return `
                    <div class="border-2 ${isLocked ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50' : 'border-yellow-400/30 bg-yellow-50 dark:bg-yellow-900/10'} ${cardPad} rounded-2xl flex ${mob ? 'flex-row items-center' : 'flex-col'} ${cardGap} relative overflow-hidden group transition-all ${mob ? '' : 'hover:scale-[1.02] hover:shadow-lg'} h-full">
                         <div class="absolute -right-6 -bottom-6 text-9xl opacity-5 rotate-12 pointer-events-none select-none ${isLocked ? 'grayscale' : ''}">📜</div>

                         <div class="flex ${mob ? 'flex-row items-center gap-3 flex-1 min-w-0' : 'items-start justify-between'} relative z-10 w-full">
                             <div class="${iconBox} ${isLocked ? 'bg-slate-200 dark:bg-slate-800 grayscale opacity-50' : 'bg-white dark:bg-slate-800'} rounded-2xl flex items-center justify-center shadow-sm border ${isLocked ? 'border-slate-300 dark:border-slate-600' : 'border-yellow-200 dark:border-yellow-700/50'} shrink-0">
                                ${mic}
                             </div>
                             <div class="flex-1 min-w-0 ${mob ? 'flex flex-col gap-1' : ''}">
                             <span class="text-[10px] uppercase font-black px-2 py-0.5 rounded-full w-fit ${isLocked ? 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400'}">
                                ${isLocked ? escHtml(ui.lockedCert || 'Locked') : escHtml(ui.lessonFinished || 'Earned')}
                             </span>
                             <h3 class="font-black ${isLocked ? 'text-slate-500 dark:text-slate-500' : 'text-slate-800 dark:text-white'} ${titleCls} leading-tight ${mob ? 'line-clamp-2' : 'line-clamp-2 mb-2'}">${mname}</h3>
                             ${mob ? `
                             <div class="w-full pt-1">
                                 ${isLocked ? `
                                 <button type="button" class="w-full text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 py-2.5 rounded-xl cursor-not-allowed opacity-70">
                                    ${escHtml(ui.viewCert || 'View')}
                                 </button>
                                 ` : `
                                 <button type="button" class="btn-view-cert w-full text-xs font-bold text-white bg-slate-900 dark:bg-slate-700 active:bg-blue-600 py-2.5 rounded-xl transition-colors shadow-md" data-id="${mid}">
                                    ${escHtml(ui.viewCert || 'View Diploma')}
                                 </button>
                                 `}
                             </div>
                             ` : ''}
                             </div>
                         </div>

                         ${mob ? '' : `
                         <div class="flex-1 relative z-10 min-w-0 flex flex-col">
                             <div class="mt-auto pt-2">
                                 ${isLocked ? `
                                 <button type="button" class="w-full text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 py-2 rounded-xl cursor-not-allowed opacity-70">
                                    ${escHtml(ui.viewCert || 'View')}
                                 </button>
                                 ` : `
                                 <button type="button" class="btn-view-cert w-full text-xs font-bold text-white bg-slate-900 dark:bg-slate-700 hover:bg-blue-600 py-2 rounded-xl transition-colors transition-transform active:scale-[0.98] shadow-md" data-id="${mid}">
                                    ${escHtml(ui.viewCert || 'View Diploma')}
                                 </button>
                                 `}
                             </div>
                         </div>
                         `}
                    </div>
                `;
                }).join('')}
            </div>`;
        }

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        const container = this.querySelector('#certs-list-container');
        const toggleBtn = this.querySelector('#btn-toggle-certs');
        const searchInput = this.querySelector('#inp-cert-search');
        const titleEl = this.querySelector('#modal-title-text');

        if (container && toggleBtn && searchInput) {
            if (titleEl) titleEl.textContent = ui.navCertificates || 'Certificates';
            toggleBtn.textContent = toggleBtnLabel;
            toggleBtn.className = `px-4 py-2 rounded-xl ${toggleBtnClass} font-bold text-xs whitespace-nowrap transition-colors shadow-sm shrink-0`;
            container.innerHTML = listHtml;
            searchInput.placeholder = ui.searchCert || 'Search...';

            this.querySelectorAll('.btn-view-cert').forEach(b => {
                b.onclick = (e) => store.setModal({ type: 'certificate', moduleId: e.currentTarget.dataset.id });
            });
            return;
        }

        const toolbarPad = embedded ? 'px-4 pb-3 pt-3' : mob ? 'px-4 pb-3' : 'px-4 pb-4';
        const listPad = embedded ? 'px-4 pb-4 pt-2' : mob ? 'px-4 pb-4 pt-2' : 'px-4 py-6 md:py-8';
        const toolbarBg = mob
            ? 'bg-slate-50/90 dark:bg-slate-950/80'
            : 'bg-slate-100 dark:bg-slate-900/98';
        const listBg = mob ? 'bg-slate-50/50 dark:bg-slate-900/50' : 'bg-white dark:bg-slate-900';

        const headerBlock = embedded
            ? `<h2 id="modal-title-text" class="hidden">${ui.navCertificates || 'Certificates'}</h2>`
            : mob
              ? `
                    <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-start gap-2">
                        ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0 mt-0.5', { tagClass: 'btn-close-certs-mob' })}
                        <div class="min-w-0 flex-1">
                            <h2 id="modal-title-text" class="arborito-mmenu-subtitle m-0">${ui.navCertificates || 'Certificates'}</h2>
                            <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">${ui.certificatesTagline || 'Achievements & Diplomas'}</p>
                        </div>
                        ${modalWindowCloseXHtml(ui, 'btn-close-certs')}
                    </div>`
              : `
                    <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 items-start px-4 pt-4 pb-3">
                        ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0 mt-0.5', { tagClass: 'btn-close-certs-mob' })}
                        <div class="min-w-0 flex-1">
                            <h2 id="modal-title-text" class="arborito-mmenu-subtitle m-0">${ui.navCertificates || 'Certificates'}</h2>
                            <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">${ui.certificatesTagline || 'Achievements & Diplomas'}</p>
                        </div>
                        ${modalWindowCloseXHtml(ui, 'btn-close-certs')}
                    </div>`;

        const toolbarBlock = `
                    <div class="flex flex-col sm:flex-row gap-2 ${toolbarPad} ${toolbarBg}">
                        <div class="relative flex-1 min-w-0 min-h-[2.75rem] flex items-center">
                            <div class="absolute left-0 top-1/2 -translate-y-1/2 pl-3 flex items-center justify-center pointer-events-none text-slate-400 text-[1.05rem] leading-none select-none" aria-hidden="true">
                                🔍
                            </div>
                            <input id="inp-cert-search" type="text" placeholder="${escAttr(ui.searchCert || 'Search...')}"
                                class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-3 text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-sky-500 shadow-sm leading-normal"
                                value="${escAttr(this.state.searchQuery)}">
                        </div>
                        <button id="btn-toggle-certs" type="button" class="px-4 py-2.5 rounded-xl ${toggleBtnClass} font-bold text-xs whitespace-nowrap transition-colors shadow-sm shrink-0">
                            ${toggleBtnText}
                        </button>
                    </div>`;

        const innerPanel = `
                <div class="shrink-0 flex flex-col border-b border-slate-100 dark:border-slate-800">
                    ${headerBlock}
                    ${toolbarBlock}
                </div>

                <div id="certs-list-container" class="${listPad} flex-1 overflow-y-auto ${listBg} min-h-0">
                    ${listHtml}
                </div>`;

        if (embedded) {
            this.innerHTML = `
            <div class="arborito-certs-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden bg-white dark:bg-slate-900">
                ${innerPanel}
            </div>`;
        } else {
            const shellStyle = mob
                ? 'max-height: min(92dvh, calc(100dvh - var(--arborito-mob-dock-clearance, 4.25rem) - env(safe-area-inset-top, 0px) - 8px));'
                : '';

            const shellCls = mob
                ? 'bg-white dark:bg-slate-900 rounded-none border-0 shadow-2xl w-full relative overflow-hidden flex flex-col min-h-0 cursor-auto'
                : 'arborito-float-modal-card arborito-float-modal-card--certs bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl w-full relative overflow-hidden flex flex-col min-h-0 cursor-auto';

            this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex ${mob ? 'items-end justify-center pb-[var(--arborito-mob-dock-clearance,4.25rem)] pt-0 px-0' : 'items-center justify-center p-4'} bg-slate-950 animate-in fade-in arborito-modal-root ${mob ? 'arborito-modal--mobile arborito-modal--mobile-fullbleed' : ''}">
            <div class="${shellCls}" style="${shellStyle}">
                ${innerPanel}
            </div>
        </div>`;
        }

        this.bindEvents();
    }

    bindEvents() {
        const backdrop = this.querySelector('#modal-backdrop');
        if (backdrop) {
            backdrop.onclick = (e) => {
                if (isModalBackdropEmptyTap(backdrop, e)) this.close();
            };
        }

        this.querySelectorAll('.btn-close-certs-mob').forEach((b) => (b.onclick = () => this.close()));
        this.querySelectorAll('.btn-close-certs').forEach((b) => (b.onclick = () => this.close()));
        
        const searchInput = this.querySelector('#inp-cert-search');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.state.searchQuery = e.target.value;
                this.render();
                
                requestAnimationFrame(() => {
                    const el = this.querySelector('#inp-cert-search');
                    if (el) {
                        el.focus({ preventScroll: true });
                        if (el.value.length === this.state.searchQuery.length) {
                            el.selectionStart = el.selectionEnd = el.value.length;
                        }
                    }
                });
            };
        }

        const toggleBtn = this.querySelector('#btn-toggle-certs');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                this.state.showAll = !this.state.showAll;
                this.render();
            };
        }

        this.querySelectorAll('.btn-view-cert').forEach(b => {
             b.onclick = (e) => store.setModal({ type: 'certificate', moduleId: e.currentTarget.dataset.id });
        });
    }
}
customElements.define('arborito-modal-certificates', ArboritoModalCertificates);
