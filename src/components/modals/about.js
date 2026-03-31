import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

const TREESYS_LOGO_DATA_URL = 'data:image/png;base64,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';

class ArboritoModalAbout extends HTMLElement {
    constructor() {
        super();
        this.activeTab = 'manifesto'; // 'manifesto' | 'roadmap' | 'privacy' | 'legal'
        this.showImpressumDetails = false;
        this._onStoreChange = () => this.render();
    }

    connectedCallback() {
        this.embedded = this.hasAttribute('embed');
        // Handle direct linking to specific tabs (e.g. from Privacy modal) — not when embedded in “More” sheet
        const modalState = store.value.modal;
        if (!this.embedded && modalState && modalState.tab) {
            this.activeTab = modalState.tab;
        }

        this.render();
        store.addEventListener('state-change', this._onStoreChange);
    }

    disconnectedCallback() {
        store.removeEventListener('state-change', this._onStoreChange);
    }

    close() {
        if (this.embedded) return;
        store.dismissModal();
    }

    setTab(tab) {
        this.activeTab = tab;
        this.render();
    }

    toggleDetails() {
        this.showImpressumDetails = !this.showImpressumDetails;
        this.render();
    }

    getContent(ui) {
        if (this.activeTab === 'manifesto') {
            return `
            <div class="animate-in fade-in slide-in-from-bottom-2">
                <div class="text-center mb-8">
                    <img src="${TREESYS_LOGO_DATA_URL}" alt="${ui.treesysLogoAlt || 'Treesys'}" width="92" height="92" class="mx-auto mb-4 block h-[92px] w-[92px] object-contain brightness-0 dark:invert" />
                    <p class="text-base font-medium text-slate-600 dark:text-slate-300">${ui.aboutTreesysProductLine}</p>
                </div>
                
                <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl text-left mb-6 border border-slate-100 dark:border-slate-800">
                    <p class="text-slate-600 dark:text-slate-300 leading-relaxed mb-6 font-medium text-sm md:text-base select-text">${ui.missionText}</p>
                    
                    <a href="https://github.com/treesys-org/arborito" target="_blank" class="flex items-center justify-center gap-2 w-full py-3.5 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all shadow-lg active:scale-95 group text-sm">
                        <svg class="w-5 h-5 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.164 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.322-3.369-1.322-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.597 1.028 2.688 0 3.848-2.339 4.685-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg>
                        ${ui.viewOnGithub}
                    </a>
                </div>
                
                <div class="pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
                    <h3 class="font-bold text-slate-400 dark:text-slate-500 mb-2 text-xs uppercase tracking-widest">${ui.metaphorTitle}</h3>
                    <blockquote class="text-slate-500 dark:text-slate-400 italic text-sm font-serif select-text">"${ui.metaphorText}"</blockquote>
                </div>
            </div>`;
        } 
        else if (this.activeTab === 'roadmap') {
            return `
            <div class="animate-in fade-in slide-in-from-bottom-2 pl-4">
                <div class="flex items-center gap-3 mb-8">
                    <span class="text-3xl">🗺️</span>
                    <h2 class="text-xl font-black text-slate-800 dark:text-white">${ui.roadmapTitle || 'The Roadmap'}</h2>
                </div>

                <div class="relative space-y-8 border-l-2 border-slate-200 dark:border-slate-700 ml-3">
                    
                    <!-- Phase 1: Current -->
                    <div class="relative pl-8">
                        <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white dark:border-slate-900 shadow-sm animate-pulse"></div>
                        <div class="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-200 dark:border-green-900/30">
                            <span class="text-[10px] font-black uppercase text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded mb-2 inline-block">${ui.roadmapCurrent || "Current Phase"}</span>
                            <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-1">🌱 ${ui.roadmapPhase1 || "Phase 1: The Seed"}</h3>
                            <p class="text-sm text-slate-600 dark:text-slate-300">${ui.roadmapPhase1Desc || "Foundation & Content Growth"}</p>
                        </div>
                    </div>

                    <!-- Phase 2 -->
                    <div class="relative pl-8 opacity-80">
                        <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-900"></div>
                        <h3 class="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">🌿 ${ui.roadmapPhase2 || "Phase 2: The Sapling"}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${ui.roadmapPhase2Desc || "Community & Collaboration"}</p>
                    </div>

                    <!-- Phase 3 -->
                    <div class="relative pl-8 opacity-60">
                        <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900"></div>
                        <h3 class="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">🌳 ${ui.roadmapPhase3 || "Phase 3: The Forest"}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${ui.roadmapPhase3Desc || "Decentralized Ecosystem"}</p>
                    </div>
                </div>

                <!-- Link to Live Repo -->
                <div class="mt-12 text-center pl-4 pr-8">
                    <a href="https://github.com/treesys-org/arborito/blob/main/ROADMAP.md" target="_blank" class="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span>🚧</span>
                        <span>View Live Technical Roadmap</span>
                        <span class="text-[10px]">➜</span>
                    </a>
                </div>
            </div>`;
        } 
        else if (this.activeTab === 'privacy') {
            const privacyText = (ui.privacyText || "").replace('{impressum}', `<span class="text-slate-400 italic">[See Legal Tab]</span>`);
            return `
            <div class="animate-in fade-in slide-in-from-bottom-2">
                <div class="flex items-center gap-3 mb-6">
                    <span class="text-3xl">🛡️</span>
                    <h2 class="text-xl font-black text-slate-800 dark:text-white">${ui.privacyTitle || "Privacy"}</h2>
                </div>
                <div class="prose prose-sm prose-slate dark:prose-invert max-w-none text-left select-text">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6 not-prose">
                        <p class="text-xs text-blue-800 dark:text-blue-300 font-bold leading-relaxed">
                            <strong>Note:</strong> Data is stored locally (LocalStorage) by default. Cloud transfer only occurs if you explicitly connect to optional services.
                        </p>
                    </div>
                    ${privacyText}
                </div>
            </div>`;
        } 
        else if (this.activeTab === 'legal') {
            const impressumHtml = ui.impressumText || '';
            const impressumDetailsDecoded = ui.impressumDetails || '';
            return `
            <div class="animate-in fade-in slide-in-from-bottom-2">
                <div class="flex items-center gap-3 mb-6">
                    <span class="text-3xl">⚖️</span>
                    <h2 class="text-xl font-black text-slate-800 dark:text-white">${ui.impressumTitle}</h2>
                </div>
                
                <div class="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 mb-6">
                    <p class="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed text-sm select-text">${impressumHtml}</p>
                    
                    ${!this.showImpressumDetails ? `
                        <div class="mt-4 text-center">
                            <button id="btn-show-imp" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors underline decoration-slate-300 dark:decoration-slate-700 underline-offset-4">
                                ${ui.showImpressumDetails}
                            </button>
                        </div>
                    ` : `
                        <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2 fade-in">
                             <div class="flex flex-row flex-nowrap items-center justify-start gap-2.5 mb-4 w-full pl-0.5">
                                 <div class="w-11 h-11 shrink-0 bg-white dark:bg-slate-900 rounded-xl shadow-sm flex items-center justify-center text-lg border border-slate-100 dark:border-slate-800">🌲</div>
                                 <p class="font-black text-slate-800 dark:text-white text-sm m-0 leading-none whitespace-nowrap">treesys.org</p>
                             </div>
                             <pre class="whitespace-pre-wrap font-mono text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800 select-all">${impressumDetailsDecoded}</pre>
                        </div>
                    `}
                </div>
            </div>`;
        }
    }

    tabRowHtml(ui, opts) {
        const { embedded, isMob, mobileBackSlot, trailingSlot } = opts;
        const tabBtnClass = (isActive) =>
            `tab-btn flex-1 min-w-[4.5rem] py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${isActive ? 'border-slate-800 text-slate-800 dark:border-white dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`;
        const pad = embedded ? 'px-1' : isMob ? 'px-2 pt-1' : 'px-4 pt-3 pb-2';
        const backSlot = mobileBackSlot || '';
        const oneRowMob = !!mobileBackSlot;
        const rowAlign = trailingSlot || oneRowMob ? 'items-center' : 'items-stretch';
        return `
                <div class="flex ${pad} border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 overflow-x-auto ${rowAlign} ${oneRowMob ? 'arborito-about-tabs-with-back' : ''} gap-2">
                    ${backSlot}
                    <div class="flex flex-1 min-w-0 overflow-x-auto items-stretch">
                    <button type="button" class="${tabBtnClass(this.activeTab === 'manifesto')}" data-tab="manifesto">${ui.tabManifesto || 'Manifesto'}</button>
                    <button type="button" class="${tabBtnClass(this.activeTab === 'roadmap')}" data-tab="roadmap">${ui.tabRoadmap || 'Roadmap'}</button>
                    <button type="button" class="${tabBtnClass(this.activeTab === 'privacy')}" data-tab="privacy">${ui.tabPrivacy || 'Privacy'}</button>
                    <button type="button" class="${tabBtnClass(this.activeTab === 'legal')}" data-tab="legal">${ui.tabLegal || 'Legal'}</button>
                    </div>
                    ${trailingSlot || ''}
                </div>`;
    }

    render() {
        const ui = store.ui;
        this.embedded = this.hasAttribute('embed');
        const contentHtml = this.getContent(ui);
        const isMob = shouldShowMobileUI();

        // PARTIAL UPDATE STRATEGY
        // If container exists, just update content and tab states to avoid re-animation jumping
        const contentContainer = this.querySelector('#about-content-scroll');
        if (contentContainer) {
            contentContainer.innerHTML = contentHtml;

            this.querySelectorAll('.tab-btn').forEach(btn => {
                const isActive = btn.dataset.tab === this.activeTab;
                const activeClasses = ['border-slate-800', 'text-slate-800', 'dark:border-white', 'dark:text-white'];
                const inactiveClasses = ['border-transparent', 'text-slate-400', 'hover:text-slate-600', 'dark:hover:text-slate-300'];

                if (isActive) {
                    btn.classList.add(...activeClasses);
                    btn.classList.remove(...inactiveClasses);
                } else {
                    btn.classList.remove(...activeClasses);
                    btn.classList.add(...inactiveClasses);
                }
            });

            this.bindContentEvents();
            return;
        }

        const mobileBackSlot =
            !this.embedded && isMob
                ? modalNavBackHtml(ui, 'arborito-mmenu-back arborito-about-inline-back shrink-0 self-center border-r border-slate-100 dark:border-slate-800 pr-2 mr-1 -ml-1', { tagClass: 'btn-close' })
                : '';
        const trailingClose = !this.embedded && !isMob ? modalWindowCloseXHtml(ui, 'btn-close') : '';
        const tabRow = this.tabRowHtml(ui, {
            embedded: this.embedded,
            isMob,
            mobileBackSlot,
            trailingSlot: trailingClose,
        });
        const contentPad = this.embedded ? 'p-3 sm:p-4' : 'p-8';

        if (this.embedded) {
            this.innerHTML = `
            <div class="arborito-about-embed-root flex flex-col flex-1 min-h-0 w-full h-full">
                ${tabRow}
                <div id="about-content-scroll" class="${contentPad} overflow-y-auto custom-scrollbar flex-1 min-h-0 pb-10">
                    ${contentHtml}
                </div>
            </div>`;
            this.querySelectorAll('.tab-btn').forEach(btn => {
                btn.onclick = () => this.setTab(btn.dataset.tab);
            });
            this.bindContentEvents();
            return;
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--readme bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto">
                ${tabRow}
                <div id="about-content-scroll" class="${contentPad} overflow-y-auto custom-scrollbar flex-1 min-h-0 pb-12">
                    ${contentHtml}
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-close').forEach((b) => (b.onclick = () => this.close()));

        this.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => this.setTab(btn.dataset.tab);
        });

        this.bindContentEvents();
    }

    bindContentEvents() {
        const btnShow = this.querySelector('#btn-show-imp');
        if (btnShow) {
            btnShow.onclick = () => this.toggleDetails();
        }
    }
}
customElements.define('arborito-modal-about', ArboritoModalAbout);
