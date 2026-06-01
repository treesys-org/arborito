import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { isModalBackdropEmptyTap, bindCloseTaps } from '../../../shared/ui/mobile-tap.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { escHtml, escAttr } from '../../tree-graph/graph/graph-mobile-shared.js';

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
                             <span class="arborito-pill arborito-pill--chip ${isLocked ? 'arborito-pill--slate' : 'arborito-pill--yellow'} w-fit">
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
        /* When embedded under the "More" drill, the parent already paints the green-gradient hero.
         * Keep the toolbar transparent so it visually belongs to the same surface, instead of
         * reading as a second header. */
        const toolbarBg = embedded
            ? 'bg-transparent'
            : mob
                ? 'bg-slate-50/90 dark:bg-slate-950/80'
                : 'bg-slate-100 dark:bg-slate-900/98';
        const listBg = mob ? 'bg-slate-50/50 dark:bg-slate-900/50' : 'bg-white dark:bg-slate-900';

        const headerBlock = embedded
            ? `<h2 id="modal-title-text" class="hidden">${ui.navCertificates || 'Certificates'}</h2>`
            : modalHeroHtml(ui, {
                  mobile: mob,
                  align: 'start',
                  title: ui.navCertificates || 'Certificates',
                  titleId: 'modal-title-text',
                  subtitle: ui.certificatesTagline || 'Achievements & Diplomas',
                  subtitleClass: 'text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest',
                  backTagClass: 'btn-close-certs-mob',
                  closeTagClass: 'btn-close-certs',
              });

        const toolbarBlock = `
                    <div class="flex flex-col sm:flex-row gap-2 ${toolbarPad} ${toolbarBg}">
                        <div class="arborito-field-wrap flex-1 min-w-0 min-h-[2.75rem] flex items-center">
                            <span class="arborito-search-icon" aria-hidden="true">🔍</span>
                            <input id="inp-cert-search" type="text" placeholder="${escAttr(ui.searchCert || 'Search...')}"
                                class="arborito-input arborito-input--search font-bold shadow-sm leading-normal"
                                value="${escAttr(this.state.searchQuery)}">
                        </div>
                        <button id="btn-toggle-certs" type="button" class="px-4 py-2.5 rounded-xl ${toggleBtnClass} font-bold text-xs whitespace-nowrap transition-colors shadow-sm shrink-0">
                            ${toggleBtnText}
                        </button>
                    </div>`;

        const headerWrapBorder = embedded ? '' : ' border-b border-slate-100 dark:border-slate-800';
        const innerPanel = `
                <div class="shrink-0 flex flex-col${headerWrapBorder}">
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
            this.innerHTML = modalShellHtml({
                bodyHtml: innerPanel,
                mobile: mob,
                layout: 'dock',
                enter: 'fade',
                panelSize: mob ? undefined : 'certs',
                panelRadius: mob ? 'none' : undefined,
                panelClass: mob ? 'w-full max-h-[min(92dvh,calc(100dvh-var(--arborito-mob-dock-clearance,4.25rem)-env(safe-area-inset-top,0px)-8px))]' : 'w-full',
                rootFlags: mob ? 'arborito-modal--mobile-fullbleed' : '',
            });
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

        bindCloseTaps(this, () => this.close(), ['.btn-close-certs-mob', '.btn-close-certs']);
        
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
