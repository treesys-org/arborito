/** Welcome modal; step 1 layout CSS: src/styles/modals/welcome-modal-step1.css */

import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalWelcome extends HTMLElement {
    constructor() {
        super();
        this.activeStep = 0;
        this.lastContentHtml = null; // Cache to prevent re-animation loop
        this.lastFooterHtml = null;
        this.lastSidebarHtml = null;
        this._welcomeStateSig = null;
        /** Theme + mobile/desktop layout only; language can change without replacing the whole DOM */
        this._welcomeLayoutKey = null;
        /** Evita que el atajo de “partial update” (solo tema/layout) deje textos viejos tras `setLanguage`. */
        this._lastWelcomeI18nLang = null;
        this.handleStateChange = () => {
            const langNow = store.value.lang;
            if (this._lastWelcomeI18nLang != null && this._lastWelcomeI18nLang !== langNow) {
                this._welcomeLayoutKey = null;
            }
            this._lastWelcomeI18nLang = langNow;

            const sig = this.getWelcomeStateSig();
            if (sig === this._welcomeStateSig && this.querySelector('#modal-backdrop')) return;
            this._welcomeStateSig = sig;
            this.render();
        };
    }

    getWelcomeStateSig() {
        const steps = store.ui.welcomeSteps || [];
        const titles = steps.map((s) => s.title).join('\u001f');
        return `${store.value.lang}|${store.value.theme}|${shouldShowMobileUI()}|${titles}`;
    }

    connectedCallback() {
        this.render();
        this._onArboritoViewport = () => {
            this._welcomeLayoutKey = null;
            this.render();
        };
        window.addEventListener('arborito-viewport', this._onArboritoViewport);

        // Listen for store updates (Critical for language switching)
        store.addEventListener('state-change', this.handleStateChange);

        // Keyboard navigation support
        this.keyHandler = (e) => {
            if (e.key === 'ArrowRight') this.next();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'Escape') this.close();
        };
        window.addEventListener('keydown', this.keyHandler);
    }

    disconnectedCallback() {
        store.removeEventListener('state-change', this.handleStateChange);
        window.removeEventListener('keydown', this.keyHandler);
        if (this._onArboritoViewport) {
            window.removeEventListener('arborito-viewport', this._onArboritoViewport);
        }
    }

    close() {
        localStorage.setItem('arborito-welcome-seen', 'true');
        store.dismissModal();
        queueMicrotask(() => {
            if (!localStorage.getItem('arborito-ui-tour-done')) {
                window.dispatchEvent(new CustomEvent('arborito-start-tour', { detail: { source: 'post-welcome' } }));
            }
        });
    }

    next() {
        const steps = store.ui.welcomeSteps || [];
        if (this.activeStep < steps.length - 1) {
            this.activeStep++;
            this.render();
        } else {
            this.close();
        }
    }

    prev() {
        if (this.activeStep > 0) {
            this.activeStep--;
            this.render();
        }
    }

    goTo(index) {
        this.activeStep = index;
        this.render();
    }

    // --- HTML GENERATORS ---

    getSidebarItemsHtml(steps) {
        return steps.map((step, idx) => {
            const isActive = idx === this.activeStep;
            const isCompleted = idx < this.activeStep;
            
            return `
            <button class="sidebar-btn w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 group
                ${isActive 
                    ? 'bg-white shadow-sm border border-sky-100 dark:bg-slate-800 dark:border-sky-900/40' 
                    : 'arborito-welcome-sidebar-inactive hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400'}"
                data-idx="${idx}">
                
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                    ${isActive 
                        ? 'bg-sky-500 text-white' 
                        : (isCompleted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-700')}"
                >
                    ${isCompleted ? '✓' : idx + 1}
                </div>
                
                <span class="font-semibold text-sm truncate ${isActive ? 'text-slate-800 dark:text-white' : ''}">
                    ${step.title}
                </span>
            </button>
            `;
        }).join('');
    }

    getMobileProgressHtml(steps) {
        const mob = shouldShowMobileUI();
        if (!mob || steps.length <= 1) return '';
        const progressPad = mob && this.activeStep === 0 ? 'p-3 pb-0' : 'p-4 pb-0';
        return `
        <div class="${mob ? `flex gap-1 ${progressPad} shrink-0` : 'hidden'}">
            ${steps.map((_, i) => `
                <div class="h-1 flex-1 rounded-full ${i === this.activeStep ? 'bg-sky-500' : (i < this.activeStep ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-800')}"></div>
            `).join('')}
        </div>`;
    }

    getContentHtml(current, ui) {
        const mob = shouldShowMobileUI();
        const isFirst = this.activeStep === 0;
        const contentPad = mob
            ? (isFirst ? '' : 'px-3 py-8')
            : (isFirst ? '' : 'p-8 md:p-12');
        const proseW = mob ? 'max-w-none w-full' : 'max-w-md';
        const proseSize = 'prose-lg';
        const langRow = isFirst ? `
                <div class="arborito-welcome-lang-stack animate-in fade-in duration-300">
                    <p class="arborito-welcome-lang-hint text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">${ui.welcomeLangHint || 'Language'}</p>
                    <div class="arborito-welcome-lang-buttons">
                        ${store.availableLanguages.map(l => `
                            <button type="button" class="btn-lang-sel px-3 py-4 md:p-3 border-2 rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-2
                                ${store.value.lang === l.code
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'}"
                                data-code="${l.code}">
                                <span class="text-3xl leading-none" aria-hidden="true">${l.flag}</span>
                                <span class="text-sm md:text-xs font-bold ${store.value.lang === l.code ? 'text-blue-600 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}">${l.nativeName}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>` : '';
        const iconWrapOther = 'w-24 h-24 md:w-32 md:h-32 text-6xl md:text-7xl mb-6';
        const titleCls = isFirst
            ? 'text-2xl md:text-3xl font-bold text-slate-800 dark:text-white mb-0 max-w-lg w-full leading-tight px-1 mx-auto'
            : 'text-2xl md:text-3xl font-bold text-slate-800 dark:text-white mb-1 max-w-lg w-full leading-tight px-1 mx-auto';

        const heroHtml = isFirst
            ? `
            <div class="arborito-welcome-hero">
                <div class="arborito-welcome-step1-icon w-24 h-24 text-5xl mb-3 bg-gradient-to-br from-sky-50 to-emerald-50 dark:from-slate-800 dark:to-sky-950/50 rounded-full flex items-center justify-center shadow-sm border border-sky-100/80 dark:border-slate-600 animate-in zoom-in duration-500">
                    ${current.icon}
                </div>
                <h1 class="${titleCls}">
                    ${current.title}
                </h1>
                ${langRow}
            </div>`
            : `
            <div class="flex flex-col items-center shrink-0">
                <div class="${iconWrapOther} bg-gradient-to-br from-sky-50 to-emerald-50 dark:from-slate-800 dark:to-sky-950/50 rounded-full flex items-center justify-center shadow-sm border border-sky-100/80 dark:border-slate-600 animate-in zoom-in duration-500">
                    ${current.icon}
                </div>
                <h1 class="${titleCls}">
                    ${current.title}
                </h1>
                ${langRow}
            </div>`;

        const welcomeLegalHtml = `
            <div class="arborito-welcome-legal-wrap">
                <div class="arborito-welcome-legal"><p>${current.text}</p></div>
            </div>`;

        const proseHtml = (topMargin) => `
            <div class="w-full flex justify-center ${topMargin}">
                <div class="prose prose-slate dark:prose-invert prose-p:text-slate-600 dark:prose-p:text-slate-300 ${proseSize} ${proseW} text-left sm:text-center mx-auto">
                    <p>${current.text}</p>
                </div>
            </div>`;

        const aiPitchBlock = (mt) => (current.isAiPitch ? `
                <div class="${mt} p-3 bg-sky-50 dark:bg-sky-950/40 rounded-xl border border-sky-100 dark:border-sky-800/60 flex items-center gap-3 shrink-0">
                    <span class="text-xl" aria-hidden="true">🦉</span>
                    <div class="text-left">
                        <p class="text-xs font-semibold text-sky-800 dark:text-sky-200">${ui.aiPitchAction}</p>
                        <p class="text-[10px] text-sky-600/90 dark:text-sky-300/80">${ui.aiPitchSub}</p>
                    </div>
                </div>
            ` : '');

        if (isFirst) {
            const outerPad = contentPad ? `${contentPad} ` : '';
            return `
        <div class="${outerPad}flex-1 flex flex-col min-h-0 items-stretch text-center animate-in slide-in-from-right-4 fade-in duration-300 arborito-welcome-step1" key="${this.activeStep}">
            <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col arborito-welcome-step1-scroll">
                ${heroHtml}
                ${welcomeLegalHtml}
            </div>
            ${aiPitchBlock('mt-4')}
        </div>`;
        }

        return `
        <div class="flex-1 ${contentPad} flex flex-col min-h-0 items-stretch text-center animate-in slide-in-from-right-4 fade-in duration-300" key="${this.activeStep}">
            ${heroHtml}
            <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar w-full">
                ${proseHtml('mt-8')}
            </div>
            ${aiPitchBlock('mt-6')}
        </div>`;
    }

    getFooterHtml(ui, total, isLast) {
        const mob = shouldShowMobileUI();
        const single = total <= 1;
        const pageStr = (ui.tutorialPageIndicator || 'Step {n} of {total}')
            .replace('{n}', String(this.activeStep + 1))
            .replace('{total}', String(total));
        const leftFooter = single
            ? ''
            : this.activeStep === 0
              ? `<button type="button" class="btn-close text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-4 py-2 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">${ui.tutorialSkip}</button>`
              : `<button type="button" id="btn-prev" class="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                        <span>←</span> ${ui.tutorialPrev}
                    </button>`;
        return `
        <div class="p-6 md:p-8 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] border-t border-slate-100 dark:border-slate-800 flex ${single ? 'justify-end' : 'justify-between'} items-center bg-white dark:bg-slate-900 z-10 w-full shrink-0">
            <div>${leftFooter}</div>

            <!-- Page Indicator (Desktop Only) -->
            <div class="${mob || single ? 'hidden' : 'block'} text-xs font-medium text-slate-600 dark:text-slate-400 tracking-wide">
                ${pageStr}
            </div>

            <!-- Next / Finish -->
            <button type="button" id="btn-next" class="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold shadow-md transition-all active:scale-95 group text-white
                ${isLast 
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25' 
                    : 'bg-sky-600 hover:bg-sky-500 dark:bg-sky-600 dark:hover:bg-sky-500 shadow-sky-600/20'}">
                <span>${isLast ? ui.tutorialFinish : ui.tutorialNext}</span>
                ${!isLast ? '<span class="group-hover:translate-x-1 transition-transform">→</span>' : ''}
            </button>
        </div>`;
    }

    syncWelcomeBackdropClasses() {
        const backdrop = this.querySelector('#modal-backdrop');
        if (!backdrop) return;
        backdrop.classList.add('arborito-modal-root', 'arborito-modal--welcome');
        backdrop.classList.toggle('arborito-modal--mobile', shouldShowMobileUI());
        backdrop.classList.remove('arborito-modal--search', 'arborito-modal--immersive');
    }

    /** Step 1: desktop uses visible overflow on #welcome-content-area to avoid a spurious scrollbar */
    syncWelcomeContentAreaStepClass() {
        const el = this.querySelector('#welcome-content-area');
        if (!el) return;
        el.classList.toggle('arborito-welcome-content-area--step1', this.activeStep === 0);
    }

    bindStaticEvents() {
        this.querySelectorAll('.btn-close').forEach(b => b.onclick = () => this.close());
    }

    bindDynamicEvents() {
        // Re-bind sidebar buttons
        this.querySelectorAll('.sidebar-btn').forEach(btn => {
            btn.onclick = () => this.goTo(parseInt(btn.dataset.idx));
        });

        // Re-bind footer buttons
        const btnNext = this.querySelector('#btn-next');
        if (btnNext) btnNext.onclick = () => this.next();

        const btnPrev = this.querySelector('#btn-prev');
        if (btnPrev) btnPrev.onclick = () => this.prev();

        // Re-bind language buttons
        this.querySelectorAll('.btn-lang-sel').forEach(b => {
             b.onclick = (e) => {
                const code = e.currentTarget.dataset.code;
                if (store.value.lang !== code) {
                    store.setLanguage(code);
                }
             };
        });
        
        this.querySelectorAll('.btn-close').forEach(b => b.onclick = () => this.close());
    }

    render() {
        const ui = store.ui;
        const steps = ui.welcomeSteps || [];
        const theme = store.value.theme;
        
        // Safety check if steps haven't loaded or language switch causes index out of bounds
        if (this.activeStep >= steps.length) this.activeStep = 0;
        
        const current = steps[this.activeStep] || {};
        const total = steps.length;
        const isLast = this.activeStep === total - 1;
        const singleStep = total <= 1;
        const showDeskSidebar = !shouldShowMobileUI() && !singleStep;

        const mob = shouldShowMobileUI();
        const layoutKey = `${theme}-${mob}`;

        // --- PARTIAL UPDATE: same layout (theme + mobile/desktop); language or copy changes without replacing root innerHTML ---
        const contentContainer = this.querySelector('#welcome-content-area');

        if (contentContainer && this._welcomeLayoutKey === layoutKey) {
            const sidebarList = this.querySelector('#sidebar-list');
            if (sidebarList) {
                const sb = this.getSidebarItemsHtml(steps);
                if (sb !== this.lastSidebarHtml) {
                    sidebarList.innerHTML = sb;
                    this.lastSidebarHtml = sb;
                }
            }

            const mobileProgress = this.querySelector('#mobile-progress');
            if (mobileProgress) mobileProgress.innerHTML = this.getMobileProgressHtml(steps);

            const newContentHtml = this.getContentHtml(current, ui);
            if (this.lastContentHtml !== newContentHtml) {
                contentContainer.innerHTML = newContentHtml;
                this.lastContentHtml = newContentHtml;
            }

            const footerContainer = this.querySelector('#welcome-footer');
            if (footerContainer) {
                const ft = this.getFooterHtml(ui, total, isLast);
                if (ft !== this.lastFooterHtml) {
                    footerContainer.innerHTML = ft;
                    this.lastFooterHtml = ft;
                }
            }

            const mobTitle = this.querySelector('#welcome-mobile-title');
            if (mobTitle) mobTitle.textContent = ui.tutorialTitle || '';
            const deskTitle = this.querySelector('#welcome-desk-title');
            if (deskTitle) deskTitle.textContent = ui.tutorialTitle || '';

            this.syncWelcomeBackdropClasses();
            this.bindDynamicEvents();
            this.syncWelcomeContentAreaStepClass();
            this.classList.toggle('arborito-welcome--single', singleStep);
            return;
        }

        this._welcomeLayoutKey = layoutKey;

        const backdropLayout = mob
            ? 'fixed inset-0 z-[70] flex flex-col items-stretch justify-stretch p-0 m-0 h-[100dvh] min-h-[100dvh] bg-slate-950'
            : 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950';
        const cardLayout = mob
            ? 'bg-white dark:bg-slate-900 rounded-none shadow-none w-full flex-1 min-h-0 h-full max-h-none relative overflow-hidden flex flex-col border-0 transition-all duration-300'
            : 'arborito-welcome-desk-card bg-white dark:bg-slate-900 rounded-[var(--arborito-modal-radius,1.5rem)] w-full h-auto max-h-[90vh] relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 transition-all duration-300';

        const desktopWelcomeHead = mob
            ? ''
            : `
                <div class="arborito-welcome-desk-head arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-2 pb-2 flex items-center gap-3">
                    <h2 id="welcome-desk-title" class="arborito-welcome-desk-title m-0 flex-1 min-w-0 text-lg font-black tracking-tight">${ui.tutorialTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`;

        const mobileTopbar = mob
            ? `
                <div class="arborito-welcome-topbar flex px-2 pt-1 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 items-center gap-2">
                    <button type="button" class="btn-close arborito-mmenu-back arborito-about-inline-back shrink-0 self-center border-r border-slate-100 dark:border-slate-800 pr-2 mr-1 -ml-1" title="${ui.navBack || ui.close || 'Back'}" aria-label="${ui.navBack || ui.close || 'Back'}">←</button>
                    <span class="text-2xl shrink-0 leading-none" aria-hidden="true">👋</span>
                    <h2 id="welcome-mobile-title" class="flex-1 min-w-0 m-0 text-lg font-black tracking-tight text-slate-800 dark:text-white truncate">${ui.tutorialTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`
            : '';

        // --- INITIAL RENDER ---
        this.innerHTML = `
        <div id="modal-backdrop" class="${backdropLayout} animate-in fade-in">
            
            <!-- Main Card -->
            <div class="${cardLayout}">
                ${mobileTopbar}
                ${desktopWelcomeHead}
                <div class="flex flex-1 min-h-0 min-w-0 ${mob ? 'flex-col' : 'flex-row'}">
                <!-- LEFT SIDEBAR (Index) - Hidden on mobile or single-step flow -->
                <div class="${showDeskSidebar ? 'flex' : 'hidden'} arborito-welcome-desk-sidebar flex-col p-6 shrink-0 bg-gradient-to-b from-sky-50 to-emerald-50/40 dark:from-slate-900 dark:to-slate-950 border-sky-100/90 dark:border-slate-800 ${showDeskSidebar ? 'border-r' : ''}">
                    <div class="mb-6 pl-2">
                        <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">${ui.tutorialContentsLabel || 'Steps'}</p>
                    </div>
                    
                    <div id="sidebar-list" class="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-2">
                        ${this.getSidebarItemsHtml(steps)}
                    </div>

                    <div class="mt-6 pt-6 border-t border-slate-200/80 dark:border-slate-800 text-center shrink-0">
                        <p class="text-[10px] text-slate-400">Treesys</p>
                    </div>
                </div>

                <!-- RIGHT CONTENT (Page) -->
                <div class="arborito-welcome-desk-main flex-1 flex flex-col relative min-h-0 min-w-0 ${mob ? 'bg-gradient-to-b from-sky-50 dark:from-slate-800/90 to-white dark:to-slate-900' : 'bg-white dark:bg-slate-900'}">
                    
                    <!-- Mobile Progress Bar -->
                    <div id="mobile-progress">
                        ${this.getMobileProgressHtml(steps)}
                    </div>

                    <!-- Page Content Area -->
                    <div id="welcome-content-area" class="flex-1 flex flex-col relative overflow-hidden">
                        ${this.getContentHtml(current, ui)}
                    </div>

                    <!-- Footer Controls -->
                    <div id="welcome-footer" class="w-full shrink-0">
                        ${this.getFooterHtml(ui, total, isLast)}
                    </div>
                </div>
                </div>
            </div>
        </div>`;

        // Cache initial content state
        this.lastContentHtml = this.getContentHtml(current, ui);
        this.lastFooterHtml = this.getFooterHtml(ui, total, isLast);
        this.lastSidebarHtml = this.getSidebarItemsHtml(steps);
        this._welcomeStateSig = this.getWelcomeStateSig();

        this.syncWelcomeBackdropClasses();
        this.bindStaticEvents();
        this.bindDynamicEvents();
        this.syncWelcomeContentAreaStepClass();
        this.classList.toggle('arborito-welcome--single', singleStep);
    }
}
customElements.define('arborito-modal-welcome', ArboritoModalWelcome);
