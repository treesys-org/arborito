
import { store } from '../../store.js';
import { isModalBackdropEmptyTap } from '../../utils/mobile-tap.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalManual extends HTMLElement {
    constructor() {
        super();
        this.activeSection = 'intro';
    }

    connectedCallback() {
        this._onArboritoViewport = () => {
            if (!this.isConnected || this.hasAttribute('embed')) return;
            const mob = shouldShowMobileUI();
            const layoutKey = mob ? 'mob' : 'desk';
            if (this._manualLayoutMob === layoutKey && this.querySelector('#manual-content')) return;
            this.innerHTML = '';
            this._manualLayoutMob = undefined;
            this.render();
        };
        window.addEventListener('arborito-viewport', this._onArboritoViewport);
        this.render();
    }

    disconnectedCallback() {
        if (this._onArboritoViewport) {
            window.removeEventListener('arborito-viewport', this._onArboritoViewport);
        }
    }

    close() {
        if (this.hasAttribute('embed')) return;
        store.dismissModal();
    }

    scrollToSection(id) {
        this.activeSection = id;
        this.updateSidebarUI();

        const el = this.querySelector(`#sec-${id}`);
        const container = this.querySelector('#manual-content');
        if (!el || !container) return;
        const top =
            el.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop;
        container.scrollTo({ top: Math.max(0, top - 10), behavior: 'smooth' });
    }

    updateSidebarUI() {
        const buttons = this.querySelectorAll('.sidebar-btn');
        buttons.forEach(btn => {
            const section = btn.dataset.section;
            const isActive = this.activeSection === section;
            
            // Toggle Classes
            if (isActive) {
                btn.classList.add('bg-white', 'shadow-sm', 'border', 'border-slate-200', 'dark:bg-slate-800', 'dark:border-slate-700');
                btn.classList.remove('hover:bg-slate-100', 'dark:hover:bg-slate-800/50', 'text-slate-500', 'dark:text-slate-400');
                
                const span = btn.querySelector('.btn-text');
                if(span) span.classList.add('text-slate-800', 'dark:text-white');
            } else {
                btn.classList.remove('bg-white', 'shadow-sm', 'border', 'border-slate-200', 'dark:bg-slate-800', 'dark:border-slate-700');
                btn.classList.add('hover:bg-slate-100', 'dark:hover:bg-slate-800/50', 'text-slate-500', 'dark:text-slate-400');
                
                const span = btn.querySelector('.btn-text');
                if(span) span.classList.remove('text-slate-800', 'dark:text-white');
            }
        });
    }

    render() {
        const embedded = this.hasAttribute('embed');
        const layoutKey = embedded ? 'embed' : (shouldShowMobileUI() ? 'mob' : 'desk');
        if (this.querySelector('#manual-content') && this._manualLayoutMob === layoutKey) {
            this.updateSidebarUI();
            return;
        }
        this._manualLayoutMob = layoutKey;

        const ui = store.ui;
        const titleText = ui.navManual || 'Arborito Guide';

        const sections = [
            { id: 'intro', title: ui.manualPhilosophyTitle || 'Philosophy', icon: '🌱' },
            { id: 'nav', title: ui.manualNavigationTitle || 'Navigation', icon: '🗺️' },
            { id: 'learn', title: ui.manualLearningTitle || 'Learning', icon: '📝' },
            { id: 'garden', title: ui.manualGardenTitle || 'The Garden', icon: '🎒' },
            { id: 'arcade', title: ui.manualArcadeTitle || 'Arcade', icon: '🎮' },
            { id: 'sage', title: ui.manualSageTitle || 'Sage (AI)', icon: '🦉' },
            { id: 'construct', title: ui.navConstruct || ui.manualConstructTitle || 'Construction Mode', icon: '👷' },
            { id: 'authoring', title: ui.manualAuthoringTitle || 'Courses without a terminal', icon: '🚀' },
            { id: 'data', title: ui.manualDataTitle || 'Data & Sync', icon: '💾' }
        ];

        const sidebarHtml = sections.map(s => `
            <button class="sidebar-btn w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 group text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                data-section="${s.id}">
                <span class="text-lg">${s.icon}</span>
                <span class="btn-text font-bold text-sm">${s.title}</span>
            </button>`
        ).join('');

        const contentHtml = `
        <div class="prose prose-slate dark:prose-invert max-w-4xl mx-auto pb-20 pt-2">
            <section id="sec-intro" class="mb-20 scroll-mt-6">
                <h1>${ui.manualHeader || ui.manualTitle || 'Arborito Guide'}</h1>
                <p class="lead text-xl">${ui.manualIntroText}</p>
                <div class="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-100 dark:border-blue-800 my-6">
                    <strong class="text-blue-700 dark:text-blue-300 block mb-2">${ui.manualPhilosophyCore}</strong>
                    ${ui.manualPhilosophyDesc}
                </div>
            </section>

            <hr class="border-slate-200 dark:border-slate-800 my-12">

            <section id="sec-nav" class="mb-20 scroll-mt-6">
                <h2>${ui.manualNavigationTitle}</h2>
                <p>${ui.manualNavDesc}</p>
                <ul class="grid grid-cols-1 md:grid-cols-2 gap-4 list-none pl-0">
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>${ui.manualNavPan}</strong><br>${ui.manualNavPanDesc}
                    </li>
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>${ui.manualNavZoom}</strong><br>${ui.manualNavZoomDesc}
                    </li>
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>${ui.manualNavExpand}</strong><br>${ui.manualNavExpandDesc}
                    </li>
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>${ui.manualNavFocus}</strong><br>${ui.manualNavFocusDesc}
                    </li>
                </ul>
            </section>

            <section id="sec-learn" class="mb-20 scroll-mt-6">
                <h2>${ui.manualLearningTitle}</h2>
                <p>${ui.manualLearnDesc}</p>
                <ul class="space-y-2">
                    <li><strong>${ui.manualLearnRoots} (🌳):</strong> ${ui.manualLearnRootsDesc || ''}</li>
                    <li><strong>${ui.manualLearnModules} (📁):</strong> ${ui.manualLearnModulesDesc || ''}</li>
                    <li><strong>${ui.manualLearnLessons} (📄):</strong> ${ui.manualLearnLessonsDesc || ''}</li>
                    <li><strong>${ui.manualLearnExams} (⚔️):</strong> ${ui.manualLearnExamsDesc || ''}</li>
                </ul>
            </section>

            <section id="sec-garden" class="mb-20 scroll-mt-6">
                <h2>${ui.manualGardenTitle}</h2>
                <p>${ui.manualGardenDesc}</p>
                <ul>
                    <li><strong>${ui.manualGardenSeeds}</strong></li>
                    <li><strong>${ui.manualGardenStreak}</strong></li>
                    <li><strong>${ui.manualGardenXP}</strong></li>
                    <li><strong>${ui.manualGardenMemory}</strong></li>
                </ul>
            </section>

            <section id="sec-arcade" class="mb-20 scroll-mt-6">
                <h2>${ui.manualArcadeTitle}</h2>
                <p>${ui.manualArcadeDesc}</p>
                <div class="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800 text-sm">
                    <strong>${ui.manualArcadeContextTitle || ''}</strong> ${ui.manualArcadeContextBody || ''}
                </div>
            </section>

            <section id="sec-sage" class="mb-20 scroll-mt-6">
                <h2>${ui.manualSageTitle}</h2>
                <p>${ui.manualSageIntro || ''}</p>
                <h3>${ui.manualSageProvidersHeading || 'Providers'}</h3>
                <ul>
                    <li><strong>${ui.sageModeLocal}:</strong> ${ui.manualSageLocalDesc || ''}</li>
                    <li><strong>${ui.sageModeInBrowser || 'In-browser'}:</strong> ${ui.manualSageInBrowser || ''}</li>
                </ul>
            </section>

            <section id="sec-construct" class="mb-20 scroll-mt-6">
                <h2>${ui.navConstruct || ui.manualConstructTitle}</h2>
                <p>${ui.manualConstructDesc}</p>
                <ol>
                    <li>${ui.manualConstructStep1 || ''}</li>
                    <li>${ui.manualConstructStep2 || ''}</li>
                    <li>${ui.manualConstructStep3 || ''}</li>
                    <li>${ui.manualConstructStep4 || ''}</li>
                    <li>${ui.manualConstructStep5 || ''}</li>
                </ol>
            </section>

            <section id="sec-authoring" class="mb-20 scroll-mt-6">
                <h2>${ui.manualAuthoringTitle || 'Courses without a terminal'}</h2>
                <div class="manual-authoring-body">${ui.manualAuthoringBody || ''}</div>
            </section>

            <section id="sec-data" class="mb-20 scroll-mt-6">
                <h2>${ui.manualDataTitle}</h2>
                <p>${ui.manualDataDesc}</p>
                ${ui.manualDataPresence ? `<p>${ui.manualDataPresence}</p>` : ''}
                <ul>
                    <li>${ui.manualDataExport || ''}</li>
                    <li>${ui.manualDataImport || ''}</li>
                </ul>
            </section>
        </div>`;

        if (embedded) {
            this.innerHTML = `
            <div class="arborito-manual-embed-root flex flex-col flex-1 min-h-0 w-full min-w-0 h-full overflow-hidden">
                <div id="manual-content" class="flex-1 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar p-4 scroll-smooth min-h-0 overscroll-contain">
                    ${contentHtml}
                </div>
            </div>`;
            this.querySelectorAll('.js-manual-start-tour').forEach((b) => {
                b.onclick = () => {
                    window.dispatchEvent(
                        new CustomEvent('arborito-start-tour', {
                            detail: {
                                force: true,
                                mode: store.value.constructionMode ? 'construction' : 'default'
                            }
                        })
                    );
                };
            });
            this.updateSidebarUI();
            return;
        }

        const mob = layoutKey === 'mob';
        const mobileChrome = mob
            ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <span class="text-2xl shrink-0" aria-hidden="true">📖</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${titleText}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`
            : `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <span class="text-2xl shrink-0" aria-hidden="true">📖</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${titleText}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`;

        const shellHeight = mob ? 'height:100%;max-height:100%;' : '';
        const shellOuter = mob
            ? 'arborito-manual-modal-shell bg-slate-50 dark:bg-slate-900 rounded-none border-0 shadow-2xl w-full max-w-5xl relative overflow-hidden flex flex-col min-h-0 h-full max-h-full border border-slate-200 dark:border-slate-800 transition-all duration-300'
            : 'arborito-manual-modal-shell arborito-float-modal-card bg-slate-50 dark:bg-slate-900 rounded-[24px] shadow-2xl relative overflow-hidden flex flex-col min-h-0 border border-slate-200 dark:border-slate-800 transition-all duration-300';

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 ${mob ? 'p-0' : 'p-4'} animate-in fade-in arborito-modal-root">
            <div class="${shellOuter}" style="${shellHeight || undefined}">
                ${mobileChrome}
                <div class="flex flex-1 min-h-0 min-w-0 flex-col md:flex-row overflow-hidden">
                <!-- SIDEBAR (Desktop) -->
                <div class="${mob ? 'hidden' : 'hidden md:flex'} w-72 bg-slate-50/50 dark:bg-slate-950/50 border-r border-slate-200 dark:border-slate-800 flex-col p-4 shrink-0 min-h-0 overflow-hidden">
                    <div class="mb-6 px-2 pt-2">
                        <h2 class="font-black text-xl text-slate-800 dark:text-white tracking-tight uppercase">${titleText}</h2>
                        <p class="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">${ui.manualTagline || ''}</p>
                    </div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1 min-h-0">
                        ${sidebarHtml}
                    </div>
                </div>

                <!-- CONTENT -->
                <div id="manual-content" class="flex-1 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar ${mob ? 'p-4' : 'p-6 md:p-12'} scroll-smooth min-h-0 min-w-0 overscroll-contain">
                    ${contentHtml}
                </div>
                </div>
            </div>
        </div>`;

        // Update UI state for initial load
        this.updateSidebarUI();

        const backdrop = this.querySelector('#modal-backdrop');
        if (backdrop) {
            backdrop.onclick = (e) => {
                if (isModalBackdropEmptyTap(backdrop, e)) this.close();
            };
        }

        this.querySelectorAll('.btn-close').forEach((b) => (b.onclick = () => this.close()));

        this.querySelectorAll('.sidebar-btn').forEach(btn => {
            btn.onclick = () => this.scrollToSection(btn.dataset.section);
        });

        this.querySelectorAll('.js-manual-start-tour').forEach((b) => {
            b.onclick = () => {
                if (!this.hasAttribute('embed')) store.dismissModal();
                window.dispatchEvent(
                    new CustomEvent('arborito-start-tour', {
                        detail: {
                            force: true,
                            mode: store.value.constructionMode ? 'construction' : 'default'
                        }
                    })
                );
            };
        });
    }
}
customElements.define('arborito-modal-manual', ArboritoModalManual);
