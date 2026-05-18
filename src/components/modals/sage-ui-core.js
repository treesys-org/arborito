import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { escHtml } from '../graph/graph-mobile.js';
import {
    getSageNodeFields,
    getSageSupportResponse,
    getSageQuizContent,
    formatSageQuizStatus,
    getSageAiMode,
    setSageAiMode
} from '../../utils/sage-contextual.js';
import { buildTreeBreadcrumb } from '../../services/ai-context.js';
import { aiService } from '../../services/ai.js';
import { buildSageGuideDrillHtml, defaultSageGuideNav } from '../../utils/sage-guide-drill.js';

export const SAGE_OPEN = 'arborito-sage--open';
/** Above lesson reader (z-150); below full-screen modals that need top stack. */
export const SAGE_Z_INDEX = 160;

export function sageHideDismissButton() {
    return false;
}

function sageFormatPlain(text) {
    return escHtml(String(text || '')).replace(/\n/g, '<br>');
}

export class ArboritoSageUICore extends HTMLElement {
    render() {
        if (!this.isVisible) {
            if (this.innerHTML !== '') {
                this.innerHTML = '';
                this.className = '';
                this.lastRenderKey = null;
            }
            return;
        }

        const modal = store.value.modal;
        const lessonNode =
            this._sageLessonContext && store.value.selectedNode
                ? store.value.selectedNode
                : null;
        const constructionNode = store.value.constructionMode ? store.value.selectedNode : null;
        const ctxDisplay = this._contextDisplay || null;
        const sageAiMode = getSageAiMode();
        const { ai } = store.value;
        const guideNav = this._sageGuideNav || defaultSageGuideNav();

        const stateKey = JSON.stringify({
            visible: this.isVisible,
            mode: this.mode,
            sageAiMode,
            sageLessonContext: this._sageLessonContext,
            dockUi: !!(modal && modal.dockUi),
            lessonNodeId: lessonNode?.id || null,
            constructionNodeId: constructionNode?.id || null,
            constructionMode: !!store.value.constructionMode,
            ctxDisplay,
            aboutOpen: !!this._sageAboutOpen,
            guideNav: this._sageAboutOpen
                ? ''
                : `${guideNav.level}:${guideNav.groupId || ''}:${guideNav.sectionId || ''}`,
            aiStatus: ai.status,
            msgCount: ai.messages.length
        });

        if (stateKey === this.lastRenderKey) return;
        this.lastRenderKey = stateKey;

        if (this.mode === 'settings') {
            this._contextDisplay = null;
            this.renderSettings();
            return;
        }

        if (sageAiMode === 'dynamic') {
            const hasConsent = localStorage.getItem('arborito-ai-consent') === 'true';
            if (!hasConsent) {
                this.renderDynamicConsent();
                return;
            }
            if (ai.status === 'loading') {
                this.renderLoadingScreen(ai.progress);
                return;
            }
            this.renderChat();
            return;
        }

        this.renderContext();
    }

    _sageModeToggleHtml(ui) {
        const mode = getSageAiMode();
        const isGuide = mode === 'guide';
        const guideLbl = ui.sageModeGuide || 'Guide';
        const expLbl = ui.sageModeExperimentalShort || 'Experimental';
        const guideTitle = escHtml(ui.sageModeGuideTooltip || ui.sageModeToggleAria || 'Guide');
        const aiTitle = escHtml(ui.sageModeAiTooltip || '');
        return `<div class="flex gap-0.5 p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shrink-0 shadow-sm" role="group" aria-label="${escHtml(ui.sageModeToggleAria || 'Sage mode')}">
            <button type="button" id="btn-sage-mode-guide" title="${guideTitle}" class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all ${isGuide ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}">${escHtml(guideLbl)}</button>
            <button type="button" id="btn-sage-mode-dynamic" title="${aiTitle}" class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all ${!isGuide ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-500/50' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}">${escHtml(expLbl)}</button>
        </div>`;
    }

    renderDynamicConsent() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const deskBackdrop = mob ? 'bg-slate-100 dark:bg-slate-950' : 'arborito-sage-desk-scrim';
        this.className = `${SAGE_OPEN} fixed ${mob ? 'z-[160] arborito-sage-mob-frame' : 'inset-0 z-[160]'} flex pointer-events-none ${mob ? 'flex-col items-stretch p-0' : 'items-center justify-center p-4'} ${deskBackdrop}`;
        const disclaimer = escHtml(ui.sageExperimentalDisclaimer || '');
        const title = escHtml(ui.sageExperimentalTitle || 'Experimental AI');
        const bodyInner = `
            <div class="bg-amber-50 dark:bg-amber-900/15 p-4 rounded-xl border border-amber-200 dark:border-amber-800/40 mb-4">
                <p class="text-xs text-amber-900 dark:text-amber-100 leading-relaxed m-0 font-medium">${disclaimer}</p>
            </div>
            <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-4">
                <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed m-0">${escHtml(ui.sageGdprText || '')}</p>
            </div>
            <p class="text-[10px] text-slate-500 dark:text-slate-400 mb-4">${escHtml(ui.sageGdprConnectsNote || '')}</p>
            <button type="button" id="btn-accept-dynamic-consent" class="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">${escHtml(ui.sageGdprAccept || ui.sageExperimentalOptIn || 'I understand — enable')}</button>
            <button type="button" id="btn-sage-decline-dynamic" class="w-full mt-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">${escHtml(ui.sageExperimentalStayGuide || 'Stay in guide mode')}</button>`;
        this.innerHTML = mob
            ? `<div class="pointer-events-auto flex flex-col h-full min-h-0 w-full overflow-hidden animate-in fade-in">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 p-6 overflow-y-auto custom-scrollbar">
                    <h2 class="text-lg font-black mb-2 dark:text-white">${title}</h2>${bodyInner}
                </div>
            </div>`
            : `<div class="pointer-events-auto arborito-float-modal-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 animate-in zoom-in">
                <h2 class="text-lg font-black mb-2 dark:text-white">${title}</h2>${bodyInner}
            </div>`;
        const accept = this.querySelector('#btn-accept-dynamic-consent');
        if (accept) {
            accept.onclick = () => {
                localStorage.setItem('arborito-ai-consent', 'true');
                setSageAiMode('dynamic');
                store.update({ ai: { ...store.value.ai, contextMode: 'sage-tree' } });
                store.initSage();
                this.lastRenderKey = null;
                this.render();
            };
        }
        const decline = this.querySelector('#btn-sage-decline-dynamic');
        if (decline) {
            decline.onclick = () => {
                setSageAiMode('guide');
                this.lastRenderKey = null;
                this.render();
            };
        }
    }

    renderContext() {
        const ui = store.ui;
        const lessonNode = this._sageLessonContext ? store.value.selectedNode : null;
        if (lessonNode && (lessonNode.type === 'leaf' || lessonNode.type === 'exam')) {
            this._renderLessonGuideContext(lessonNode, ui);
            return;
        }
        const node = store.value.selectedNode;
        if (store.value.constructionMode) {
            this._renderConstructionGuideContext(ui, node);
            return;
        }
        this._renderTreeGuideContext(ui);
    }

    _sageTreeGuideMetaLine(ui) {
        const raw = store.value.rawGraphData;
        const name = raw && raw.meta && (raw.meta.title || raw.meta.name);
        if (!name) return '';
        const tpl = ui.sageTreeMetaLine || '';
        return tpl ? tpl.replace(/\{tree\}/g, String(name)) : '';
    }

    _sageBodyScrollClass({ guideOpen = false } = {}) {
        if (guideOpen) {
            return 'arborito-sage-body arborito-sage-body--guide flex-1 flex flex-col min-h-0 overflow-hidden p-2 md:p-3';
        }
        return 'arborito-sage-body flex-1 min-h-[14rem] h-[min(50vh,22rem)] max-h-[min(50vh,22rem)] overflow-y-auto p-4 custom-scrollbar';
    }

    _sageEnterAnimClass() {
        return this._sageEnterAnim ? ' animate-in slide-in-from-bottom-10 fade-in duration-200' : '';
    }

    _sageMountShell(mob, panelClean) {
        this.className = mob
            ? `${SAGE_OPEN} fixed z-[160] arborito-sage-mob-frame flex flex-col items-stretch pointer-events-none bg-slate-100 dark:bg-slate-950`
            : `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[160] flex flex-col items-end md:bottom-6 md:right-6 md:w-auto pointer-events-none`;
        const anim = this._sageEnterAnimClass();
        this.innerHTML = mob
            ? `<div class="pointer-events-auto flex flex-col h-full min-h-0 w-full overflow-hidden${anim}">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full">${panelClean}</div>
               </div>`
            : `<div class="pointer-events-auto flex flex-col rounded-2xl w-[min(448px,calc(100vw-2rem))] max-h-[calc(100vh-2.5rem)] shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden${anim}">${panelClean}</div>`;
    }

    _lessonGuideSubtitle(node, ui) {
        if (!node) return ui.sageContextSubtitle || '';
        const name = String(node.name || '').trim();
        const crumb = buildTreeBreadcrumb(store, node, { maxChars: 72 });
        if (name && crumb) return `${name} · ${crumb}`;
        return name || crumb || ui.sageContextSubtitle || '';
    }

    /** Drill-down tile guide inside Sage “What is Arborito?” (hub → group → section). */
    _sageAboutNavigatorHtml(ui) {
        if (!this._sageGuideNav) this._sageGuideNav = defaultSageGuideNav();
        return `<div id="sage-guide-drill-mount" class="sage-guide-drill-mount flex flex-col flex-1 min-h-0 h-full overflow-hidden">
            ${buildSageGuideDrillHtml(ui, this._sageGuideNav)}
        </div>`;
    }

    _patchSageGuideDrill() {
        const mount = this.querySelector('#sage-guide-drill-mount');
        const ui = store.ui;
        if (!mount || !this._sageAboutOpen) {
            this.lastRenderKey = null;
            this.render();
            return;
        }
        mount.innerHTML = buildSageGuideDrillHtml(ui, this._sageGuideNav || defaultSageGuideNav());
        this._wireSageGuideDrill();
    }

    _wireSageGuideDrill() {
        this.querySelectorAll('.sage-guide-group-tile').forEach((btn) => {
            btn.onclick = () => {
                const groupId = btn.dataset.group;
                if (!groupId) return;
                this._sageGuideNav = { level: 'group', groupId };
                this._patchSageGuideDrill();
            };
        });
        this.querySelectorAll('.sage-guide-section-tile').forEach((btn) => {
            btn.onclick = () => {
                const sectionId = btn.dataset.section;
                if (!sectionId) return;
                this._sageGuideNav = {
                    level: 'section',
                    groupId: this._sageGuideNav?.groupId,
                    sectionId
                };
                this._patchSageGuideDrill();
            };
        });
        this.querySelectorAll('.sage-guide-crumb[data-guide-nav]').forEach((btn) => {
            btn.onclick = () => {
                const nav = btn.dataset.guideNav;
                if (nav === 'hub') {
                    this._sageGuideNav = defaultSageGuideNav();
                } else if (nav === 'group') {
                    const groupId = btn.dataset.group || this._sageGuideNav?.groupId;
                    if (groupId) this._sageGuideNav = { level: 'group', groupId };
                }
                this._patchSageGuideDrill();
            };
        });
    }

    _sagePopAboutGuideLevel() {
        const nav = this._sageGuideNav || defaultSageGuideNav();
        if (nav.level === 'section' && nav.groupId) {
            this._sageGuideNav = { level: 'group', groupId: nav.groupId };
            return true;
        }
        if (nav.level === 'group') {
            this._sageGuideNav = defaultSageGuideNav();
            return true;
        }
        if (this._sageAboutOpen) {
            this._sageAboutOpen = false;
            this._sageGuideNav = defaultSageGuideNav();
            return true;
        }
        return false;
    }

    /** Guide mode from map / sidebar: course-level shortcuts only. */
    _renderTreeGuideContext(ui) {
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const title = ui.sageTitle || 'Sage';
        const subtitle = ui.sageTreeGuideSubtitle || '';
        const intro = (ui.sageTreeGuideIntro || '').trim();
        const meta = this._sageTreeGuideMetaLine(ui).trim();

        const innerFinal = this._sageAboutOpen
            ? this._sageAboutNavigatorHtml(ui)
            : this._contextDisplay
              ? `<div class="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">${sageFormatPlain(this._contextDisplay)}</div>`
              : `<div class="m-0 space-y-2">
                ${intro ? `<p class="text-sm text-slate-600 dark:text-slate-300 leading-snug m-0">${sageFormatPlain(intro)}</p>` : ''}
                ${meta ? `<p class="text-xs text-slate-500 dark:text-slate-400 m-0">${sageFormatPlain(meta)}</p>` : ''}
            </div>`;

        const explore = this._sageGuideSection(
            ui.sageSectionTreeExplore || 'Explore',
            '',
            [
                this._sageGuideActionRow(
                    ui,
                    'tree-about',
                    '🌳',
                    ui.sageBtnTreeAbout || ui.sageTreeAboutTitle || 'What is Arborito?',
                    ui.sageActionTreeAbout || '',
                    '',
                    'amber'
                ),
                this._sageGuideActionRow(
                    ui,
                    'tree-arcade',
                    '🎮',
                    ui.sageBtnTreeArcade || 'Arcade',
                    ui.sageActionTreeArcade || '',
                    '',
                    'teal'
                ),
                this._sageGuideActionRow(
                    ui,
                    'tree-search',
                    '🔍',
                    ui.sageBtnTreeSearch || 'Search',
                    ui.sageActionTreeSearch || '',
                    '',
                    'sky'
                )
            ].join('')
        );
        const footerFinal =
            this._contextDisplay
                ? `<button type="button" id="btn-sage-ctx-back" class="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold uppercase text-slate-600 dark:text-slate-300">${escHtml(ui.navBack || 'Back')}</button>`
                : this._sageAboutOpen
                  ? ''
                  : `<div class="flex flex-col gap-3">${explore}</div>`;

        const headerHtml = `
            <div class="shrink-0 border-b border-slate-200/80 dark:border-slate-700/80 px-4 pt-4 pb-2 flex items-center gap-2">
                ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0 btn-sage-guide-pop', { tagClass: 'btn-sage-guide-pop' })}
                <span class="text-2xl shrink-0" aria-hidden="true">🦉</span>
                <div class="min-w-0 flex-1">
                    <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${escHtml(title)}</h2>
                    ${subtitle ? `<p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 truncate">${escHtml(subtitle)}</p>` : ''}
                </div>
                ${this._sageModeToggleHtml(ui)}
                ${hideDismiss ? '' : modalWindowCloseXHtml(ui, 'btn-close')}
            </div>`;

        const panelClean = `
            ${headerHtml}
            <div class="${this._sageBodyScrollClass({ guideOpen: !!this._sageAboutOpen })}">${innerFinal}</div>
            ${footerFinal ? `<div class="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0 ${mob ? 'pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))]' : ''}">${footerFinal}</div>` : ''}`;

        this._sageMountShell(mob, panelClean);

        this._wireSageContextHandlers(null, ui, { treeGuide: true });
    }

    /** Guide mode while editing the curriculum map (construction). */
    _renderConstructionGuideContext(ui, node) {
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const title = ui.sageTitle || 'Sage';
        const subtitle = ui.sageConstructGuideSubtitle || ui.navConstruct || '';
        const intro = (ui.sageConstructGuideIntro || ui.sageTreeGuideIntro || '').trim();
        const meta = this._sageTreeGuideMetaLine(ui).trim();
        const nodeHint =
            node && node.name
                ? (ui.sageConstructNodeHint || 'Selected: {name}').replace(/\{name\}/g, String(node.name))
                : '';

        const innerFinal = this._sageAboutOpen
            ? this._sageAboutNavigatorHtml(ui)
            : this._contextDisplay
              ? `<div class="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">${sageFormatPlain(this._contextDisplay)}</div>`
              : `<div class="m-0 space-y-2">
                ${intro ? `<p class="text-sm text-slate-600 dark:text-slate-300 leading-snug m-0">${sageFormatPlain(intro)}</p>` : ''}
                ${meta ? `<p class="text-xs text-slate-500 dark:text-slate-400 m-0">${sageFormatPlain(meta)}</p>` : ''}
                ${nodeHint ? `<p class="text-xs text-amber-800/90 dark:text-amber-200/90 m-0">${sageFormatPlain(nodeHint)}</p>` : ''}
            </div>`;

        const explore = this._sageGuideSection(
            ui.sageSectionTreeExplore || 'Explore',
            '',
            [
                this._sageGuideActionRow(
                    ui,
                    'tree-about',
                    '🌳',
                    ui.sageBtnTreeAbout || ui.sageTreeAboutTitle || 'What is Arborito?',
                    ui.sageActionTreeAbout || '',
                    '',
                    'amber'
                ),
                this._sageGuideActionRow(
                    ui,
                    'tree-arcade',
                    '🎮',
                    ui.sageBtnTreeArcade || 'Arcade',
                    ui.sageActionTreeArcade || '',
                    '',
                    'teal'
                ),
                this._sageGuideActionRow(
                    ui,
                    'tree-search',
                    '🔍',
                    ui.sageBtnTreeSearch || 'Search',
                    ui.sageActionTreeSearch || '',
                    '',
                    'sky'
                )
            ].join('')
        );
        const footerFinal =
            this._contextDisplay
                ? `<button type="button" id="btn-sage-ctx-back" class="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold uppercase text-slate-600 dark:text-slate-300">${escHtml(ui.navBack || 'Back')}</button>`
                : this._sageAboutOpen
                  ? ''
                  : `<div class="flex flex-col gap-3">${explore}</div>`;

        const headerHtml = `
            <div class="shrink-0 border-b border-slate-200/80 dark:border-slate-700/80 px-4 pt-4 pb-2 flex items-center gap-2">
                ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0 btn-sage-guide-pop', { tagClass: 'btn-sage-guide-pop' })}
                <span class="text-2xl shrink-0" aria-hidden="true">🦉</span>
                <div class="min-w-0 flex-1">
                    <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${escHtml(title)}</h2>
                    ${subtitle ? `<p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 truncate">${escHtml(subtitle)}</p>` : ''}
                </div>
                ${this._sageModeToggleHtml(ui)}
                ${hideDismiss ? '' : modalWindowCloseXHtml(ui, 'btn-close')}
            </div>`;

        const panelClean = `
            ${headerHtml}
            <div class="${this._sageBodyScrollClass({ guideOpen: !!this._sageAboutOpen })}">${innerFinal}</div>
            ${footerFinal ? `<div class="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0 ${mob ? 'pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))]' : ''}">${footerFinal}</div>` : ''}`;

        this._sageMountShell(mob, panelClean);

        this._wireSageContextHandlers(null, ui, { treeGuide: true });
    }

    _renderLessonGuideContext(node, ui) {
        const fields = getSageNodeFields(node);
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const title = ui.navSage || ui.sageTitle || 'Sage';
        const subtitle = this._lessonGuideSubtitle(node, ui);

        const actionButtons = this._contextDisplay ? '' : this._buildSageActionButtons(fields, ui, node);

        const innerFinal = this._contextDisplay
            ? `<div class="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">${sageFormatPlain(this._contextDisplay)}</div>`
            : `<div class="m-0">
                ${(ui.sageContextIntro || '').trim() ? `<p class="text-sm text-slate-600 dark:text-slate-300 leading-snug m-0">${sageFormatPlain(ui.sageContextIntro)}</p>` : ''}
            </div>`;

        const footerFinal = this._contextDisplay
            ? `<button type="button" id="btn-sage-ctx-back" class="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold uppercase text-slate-600 dark:text-slate-300">${escHtml(ui.navBack || 'Back')}</button>`
            : `<div class="flex flex-col gap-3">${actionButtons}</div>`;

        const headerHtml = `
            <div class="shrink-0 border-b border-slate-200/80 dark:border-slate-700/80 px-4 pt-4 pb-2 flex items-center gap-2">
                ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0 btn-sage-guide-pop', { tagClass: 'btn-sage-guide-pop' })}
                <span class="text-2xl shrink-0" aria-hidden="true">🦉</span>
                <div class="min-w-0 flex-1">
                    <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${escHtml(title)}</h2>
                    ${subtitle ? `<p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 truncate">${escHtml(subtitle)}</p>` : ''}
                </div>
                ${this._sageModeToggleHtml(ui)}
                ${hideDismiss ? '' : modalWindowCloseXHtml(ui, 'btn-close')}
            </div>`;


        const panelClean = `
            ${headerHtml}
            <div class="${this._sageBodyScrollClass()}">${innerFinal}</div>
            <div class="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0 ${mob ? 'pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))]' : ''}">${footerFinal}</div>`;

        this._sageMountShell(mob, panelClean);

        this._wireSageContextHandlers(node, ui);
    }

    /**
     * Premium “guide mode” action row: icon, title, description, optional badge.
     */
    _sageGuideActionRow(_ui, ctxKey, icon, title, description, badge, theme) {
        void _ui;
        const themes = {
            violet: {
                border: 'border-violet-200/80 dark:border-violet-800/60',
                hover: 'hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/90 dark:hover:bg-violet-950/35',
                icon: 'bg-violet-100 dark:bg-violet-900/45 text-violet-700 dark:text-violet-200'
            },
            emerald: {
                border: 'border-emerald-200/80 dark:border-emerald-900/50',
                hover: 'hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50/90 dark:hover:bg-emerald-950/30',
                icon: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'
            },
            sky: {
                border: 'border-sky-200/80 dark:border-sky-900/45',
                hover: 'hover:border-sky-400 dark:hover:border-sky-500 hover:bg-sky-50/90 dark:hover:bg-sky-950/25',
                icon: 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200'
            },
            amber: {
                border: 'border-amber-200/75 dark:border-amber-900/45',
                hover: 'hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/90 dark:hover:bg-amber-950/25',
                icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200'
            },
            teal: {
                border: 'border-teal-200/80 dark:border-teal-900/45',
                hover: 'hover:border-teal-400 dark:hover:border-teal-500 hover:bg-teal-50/90 dark:hover:bg-teal-950/25',
                icon: 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200'
            }
        };
        const t = themes[theme] || themes.violet;
        const badgeHtml = (badge || "").trim()
            ? `<span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-slate-200/90 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300">${escHtml(badge)}</span>`
            : '';
        return `<button type="button" class="btn-sage-ctx group w-full text-left flex gap-3 items-start p-3 rounded-2xl border ${t.border} bg-white/50 dark:bg-slate-800/35 ${t.hover} transition-all shadow-sm hover:shadow-md active:scale-[0.99]" data-ctx="${escHtml(ctxKey)}">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon} text-lg leading-none shadow-inner" aria-hidden="true">${icon}</span>
            <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-sm text-slate-800 dark:text-white leading-snug">${escHtml(title)}</span>
                    ${badgeHtml}
                </span>
                ${(description || '').trim() ? `<span class="block text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-1">${escHtml(description)}</span>` : ''}
            </span>
        </button>`;
    }

    _sageGuideSection(title, hint, bodyHtml) {
        const hintBlock = hint
            ? `<p class="text-[11px] text-slate-500 dark:text-slate-400 leading-snug m-0 max-w-[22rem]">${hint}</p>`
            : '';
        return `<section class="space-y-1.5" aria-label="${escHtml(title)}">
            <div class="px-0.5 space-y-0.5">
                <h3 class="text-[11px] font-bold tracking-wide text-slate-600 dark:text-slate-300 m-0">${escHtml(title)}</h3>
                ${hintBlock}
            </div>
            <div class="flex flex-col gap-1.5">${bodyHtml}</div>
        </section>`;
    }

    _sageGuideEmptyPanel(message) {
        return `<div class="rounded-xl border border-slate-200/90 dark:border-slate-600/60 bg-slate-50/80 dark:bg-slate-800/40 px-3 py-3">
            <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed m-0">${escHtml(message)}</p>
        </div>`;
    }

    _buildSageActionButtons(fields, ui, node) {
        const quiz = getSageQuizContent(node);
        const navRows = [
            this._sageGuideActionRow(
                ui,
                'where',
                '📍',
                ui.sageBtnWhereAmI || 'Where am I?',
                ui.sageActionWhereDesc || '',
                '',
                'amber'
            ),
            this._sageGuideActionRow(
                ui,
                'continue',
                '➡️',
                ui.sageBtnHowContinue || 'How do I continue?',
                ui.sageActionContinueDesc || '',
                '',
                'amber'
            ),
            this._sageGuideActionRow(
                ui,
                'lesson-help',
                '📖',
                ui.sageBtnLessonHelp || 'How lessons work',
                ui.sageActionLessonHelpDesc || '',
                '',
                'sky'
            ),
            this._sageGuideActionRow(
                ui,
                'map',
                '🗺️',
                ui.sageBtnBackMap || 'Back to the map',
                ui.sageActionBackMapDesc || '',
                '',
                'emerald'
            )
        ];

        const contentRows = [];
        if (fields.hasDescription) {
            contentRows.push(
                this._sageGuideActionRow(
                    ui,
                    'summary',
                    '📄',
                    ui.sageBtnSummary || 'Summary',
                    ui.sageActionSummaryDesc || '',
                    '',
                    'emerald'
                )
            );
        }
        if (fields.hasNotes) {
            contentRows.push(
                this._sageGuideActionRow(
                    ui,
                    'notes',
                    '💬',
                    ui.sageBtnExtraInfo || 'Extra info',
                    ui.sageActionNotesDesc || '',
                    '',
                    'sky'
                )
            );
        }

        const quizRows = [];
        if (quiz.hasQuiz) {
            quizRows.push(
                this._sageGuideActionRow(
                    ui,
                    'quiz-status',
                    '✅',
                    ui.sageBtnQuizStatus || 'Review questionnaire',
                    ui.sageActionQuizStatusDesc || '',
                    '',
                    'violet'
                )
            );
        }

        let playRowsHtml = '';
        if (node && node.id) {
            playRowsHtml = this._sageGuideActionRow(
                ui,
                'open-arcade',
                '🎮',
                ui.sageBtnOpenArcade || 'Arcade',
                ui.sageActionArcadeDesc || '',
                '',
                'teal'
            );
        }

        const navHint = (ui.sageSectionNavigateHint || '').trim();
        const navSection = this._sageGuideSection(
            ui.sageSectionNavigate || 'Navigate',
            navHint ? escHtml(navHint) : '',
            navRows.join('')
        );

        let contentSection = '';
        if (contentRows.length) {
            const lessonHint = (ui.sageSectionLessonHint || '').trim();
            contentSection = this._sageGuideSection(
                ui.sageSectionLesson || 'Lesson',
                lessonHint ? escHtml(lessonHint) : '',
                contentRows.join('')
            );
        }

        let quizSection = '';
        if (quizRows.length) {
            const quizHint = quiz.complete
                ? escHtml((ui.sageSectionQuizHint || '').trim())
                : escHtml((ui.sageSectionQuizIncomplete || ui.sageQuizStatusIncomplete || '').trim());
            quizSection = this._sageGuideSection(
                ui.sageSectionQuiz || 'Review',
                quizHint,
                quizRows.join('')
            );
        } else if ((ui.sageSectionQuizEmpty || '').trim()) {
            quizSection = this._sageGuideSection(
                ui.sageSectionQuiz || 'Review',
                escHtml((ui.sageSectionQuizHintEmpty || '').trim()),
                this._sageGuideEmptyPanel(ui.sageSectionQuizEmpty)
            );
        }

        let playSection = '';
        if (playRowsHtml) {
            const playHint = (ui.sageSectionPlayHint || '').trim();
            playSection = this._sageGuideSection(
                ui.sageSectionPlay || 'Practice',
                playHint ? escHtml(playHint) : '',
                playRowsHtml
            );
        }

        return [navSection, contentSection, quizSection, playSection].filter(Boolean).join('');
    }

    _wireSageContextHandlers(node, ui, opts = {}) {
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });

        this.querySelectorAll('.btn-sage-guide-pop').forEach((b) => {
            b.onclick = () => {
                if (opts.treeGuide && this._sagePopAboutGuideLevel()) {
                    this.lastRenderKey = null;
                    this.render();
                    return;
                }
                this.close();
            };
        });

        const back = this.querySelector('#btn-sage-ctx-back');
        if (back) {
            back.onclick = () => {
                this._contextDisplay = null;
                this.lastRenderKey = null;
                this.render();
            };
        }

        if (opts.treeGuide) {
            const dockUi = !!store.value.modal?.dockUi;
            this.querySelectorAll('.btn-sage-ctx').forEach((btn) => {
                btn.onclick = () => {
                    const key = btn.dataset.ctx;
                    if (key === 'tree-arcade') {
                        store.setModal({ type: 'arcade', dockUi });
                        return;
                    }
                    if (key === 'tree-search') {
                        store.setModal({ type: 'search', dockUi });
                        return;
                    }
                    if (key === 'tree-about') {
                        this._sageAboutOpen = true;
                        this._sageGuideNav = defaultSageGuideNav();
                        this._contextDisplay = null;
                        this.lastRenderKey = null;
                        this.render();
                        return;
                    }
                };
            });
            if (this._sageAboutOpen) this._wireSageGuideDrill();
            this._wireSageModeToggle();
            return;
        }

        if (this._contextDisplay) return;

        const fieldData = getSageNodeFields(node);
        const dockUi = !!store.value.modal?.dockUi;
        this.querySelectorAll('.btn-sage-ctx').forEach((btn) => {
            btn.onclick = () => {
                const key = btn.dataset.ctx;
                let text = '';
                if (key === 'summary') text = fieldData.description;
                else if (key === 'notes') text = fieldData.notes;
                else if (key === 'map') {
                    this.close();
                    store.requestGoHome();
                    return;
                } else if (key === 'continue' || key === 'where' || key === 'lesson-help' || key === 'quiz-status') {
                    text = getSageSupportResponse(key, ui, {
                        selectedNode: node,
                        previewNode: store.value.previewNode,
                        store
                    });
                } else if (key === 'open-arcade') {
                    const id = node?.id;
                    if (!id) text = '';
                    else {
                        store.setModal({ type: 'arcade', preSelectedNodeId: id, dockUi });
                        return;
                    }
                }
                this._contextDisplay = text;
                this.lastRenderKey = null;
                this.render();
            };
        });
        this._wireSageModeToggle();
    }

    _wireSageModeToggle() {
        const guideBtn = this.querySelector('#btn-sage-mode-guide');
        const dynamicBtn = this.querySelector('#btn-sage-mode-dynamic');
        if (guideBtn) {
            guideBtn.onclick = () => {
                setSageAiMode('guide');
                this.lastRenderKey = null;
                this.render();
            };
        }
        if (dynamicBtn) {
            dynamicBtn.onclick = () => {
                setSageAiMode('dynamic');
                this.lastRenderKey = null;
                this.render();
            };
        }
    }
    
    renderLoadingScreen(progressText) {
        const ui = store.ui;
        const starting = ui.sageLoadingProgressStarting || '…';
        // Match the displayed "(NN%)" from the worker (per-file progress). Do not use a
        // monotonic max across files — that kept the bar at 100% while the label moved to the next shard.
        let parsed = null;
        if (progressText) {
            const match = progressText.match(/(\d+)%/);
            if (match) parsed = Math.min(100, parseInt(match[1], 10));
        }

        const existingBar = this.querySelector('.js-progress-bar');
        const existingText = this.querySelector('.js-progress-text');
        const container = this.querySelector('#loading-container');

        if (existingBar && existingText && container) {
            if (parsed !== null) existingBar.style.width = `${parsed}%`;
            existingText.textContent = progressText || starting;
            return;
        }

        const percent = parsed !== null ? parsed : 0;

        // Full Render (Initial)
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        this.className = mob
            ? `${SAGE_OPEN} fixed z-[160] arborito-sage-mob-frame flex flex-col pointer-events-none items-stretch bg-slate-100 dark:bg-slate-950`
            : `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[160] flex flex-col items-end pointer-events-none md:bottom-6 md:right-6 md:w-auto`;
        const cancelLabel = ui.cancel || 'Cancel';
        const shellMob = mob
            ? 'h-full max-h-full min-h-0 w-full max-w-[100vw] rounded-none border-0 shadow-none'
            : 'rounded-2xl w-[min(420px,calc(100vw-2rem))] h-auto max-h-[calc(100vh-2.5rem)] rounded-t-2xl md:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800';
        const loadingHeadMob = hideDismiss
            ? ''
            : `<div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-sage-loading-back btn-close' })}
                <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageTitle || 'Sage'}</h2>
                ${modalWindowCloseXHtml(ui, 'btn-close')}
            </div>`;
        this.innerHTML = mob
            ? `
            <div class="pointer-events-auto flex flex-col h-full min-h-0 w-full overflow-hidden animate-in slide-in-from-bottom-10 fade-in">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full overflow-hidden">
                ${loadingHeadMob}
                <div id="loading-container" class="flex flex-col flex-1 min-h-0 justify-center p-8 text-center ${shellMob}">
                <div class="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full mx-auto flex items-center justify-center text-3xl mb-4" aria-hidden="true">
                    🧠
                </div>
                <h3 class="text-lg font-black text-slate-800 dark:text-slate-100 mb-2">${ui.sageLoadingBrainTitle || ''}</h3>
                <p class="text-xs text-slate-600 dark:text-slate-400 mb-6">${ui.sageLoadingBrainDesc || ''}</p>
                
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 mb-2 overflow-hidden border border-slate-200 dark:border-slate-700">
                    <div class="js-progress-bar bg-green-500 h-full min-w-0 transition-[width] duration-300 ease-out" style="width: ${percent}%"></div>
                </div>
                <p class="js-progress-text text-xs font-mono font-bold text-green-600 dark:text-green-400">${progressText || starting}</p>
                
                ${hideDismiss ? '' : `<button type="button" id="btn-sage-loading-cancel" class="mt-6 px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100 transition-colors active:scale-95">${cancelLabel}</button>`}
                </div>
                </div>
            </div>
        `
            : `
            <div id="loading-container" class="pointer-events-auto transition-all duration-300 origin-bottom-right ${shellMob} bg-white dark:bg-slate-900 flex flex-col animate-in slide-in-from-bottom-10 fade-in p-8 text-center">
                <div class="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full mx-auto flex items-center justify-center text-3xl mb-4" aria-hidden="true">
                    🧠
                </div>
                <h3 class="text-lg font-black text-slate-800 dark:text-white mb-2">${ui.sageLoadingBrainTitle || ''}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-6">${ui.sageLoadingBrainDesc || ''}</p>
                
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 mb-2 overflow-hidden border border-slate-200 dark:border-slate-700">
                    <div class="js-progress-bar bg-green-500 h-full min-w-0 transition-[width] duration-300 ease-out" style="width: ${percent}%"></div>
                </div>
                <p class="js-progress-text text-xs font-mono font-bold text-green-600 dark:text-green-400">${progressText || starting}</p>
                
                ${hideDismiss ? '' : `<button type="button" id="btn-sage-loading-cancel" class="mt-6 px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors active:scale-95">${cancelLabel}</button>`}
            </div>
        `;
        
        const cancelBtn = this.querySelector('#btn-sage-loading-cancel');
        if (cancelBtn) cancelBtn.onclick = () => {
            // store.abortSage(); // Optional: Implement abort logic in store
            this.close();
        };
        const loadBack = this.querySelector('.btn-sage-loading-back');
        if (loadBack) loadBack.onclick = () => this.close();
        const loadX = this.querySelector('.arborito-modal-dock-panel .arborito-modal-window-x');
        if (loadX) loadX.onclick = () => this.close();
    }
    
    renderConsent() {
        const ui = store.ui;
        const gdprTitle = ui.sageGdprTitle || '';
        const gdprBody = ui.sageGdprText || '';
        const gdprNote = ui.sageGdprConnectsNote || '';
        const gdprAccept = ui.sageGdprAccept || '';
        const gdprAltProvider = ui.sageGdprUseOllamaInstead || ui.sageGdprUseCloudStableHordeInstead || '';
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdrop = mob ? 'bg-slate-100 dark:bg-slate-950' : 'arborito-sage-desk-scrim';
        this.className = `${SAGE_OPEN} fixed ${mob ? 'z-[160] arborito-sage-mob-frame' : 'inset-0 z-[160]'} flex pointer-events-none ${mob ? 'flex-col items-stretch p-0' : 'items-center justify-center p-4'} ${deskBackdrop}`;
        this.innerHTML = mob ? `
            <div class="pointer-events-auto flex flex-col h-full max-h-full min-h-0 w-full max-w-[100vw] overflow-hidden animate-in fade-in duration-200">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full max-h-full overflow-hidden">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back w-11 h-11 shrink-0', { tagClass: 'btn-close' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">📡</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${gdprTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6">
                        <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium m-0">
                            ${gdprBody}
                        </p>
                    </div>
                    <div class="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-xl">
                        <p class="text-xs text-yellow-700 dark:text-yellow-400 leading-tight font-bold m-0">
                            ${gdprNote}
                        </p>
                    </div>
                    <button type="button" id="btn-accept-consent" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">
                        ${gdprAccept}
                    </button>
                    <div class="mt-4 text-center">
                        <button type="button" id="btn-config-local" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline">
                            ${gdprAltProvider}
                        </button>
                    </div>
                </div>
                </div>
            </div>
        `             : `
            <div class="pointer-events-auto arborito-float-modal-card arborito-float-modal-card--auto-h arborito-sage-external-download-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                    <span class="text-2xl shrink-0" aria-hidden="true">📡</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${gdprTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="p-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6">
                        <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium m-0">
                            ${gdprBody}
                        </p>
                    </div>
                    <div class="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-xl">
                        <p class="text-xs text-yellow-700 dark:text-yellow-400 leading-tight font-bold m-0">
                            ${gdprNote}
                        </p>
                    </div>
                    <button type="button" id="btn-accept-consent" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">
                        ${gdprAccept}
                    </button>
                    <div class="mt-4 text-center">
                        <button type="button" id="btn-config-local" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline">
                            ${gdprAltProvider}
                        </button>
                    </div>
                </div>
            </div>
        `;
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        this.querySelector('#btn-accept-consent').onclick = () => this.acceptConsent();
        this.querySelector('#btn-config-local').onclick = () => {
            this.mode = 'settings';
            this.render();
        };
    }

    renderMenu() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdropMenu = mob ? 'bg-slate-100 dark:bg-slate-950' : 'arborito-sage-desk-scrim';
        this.className = `${SAGE_OPEN} fixed ${mob ? 'z-[160] arborito-sage-mob-frame' : 'inset-0 z-[160]'} flex pointer-events-none ${mob ? 'flex-col items-stretch p-0' : 'items-center justify-center p-4'} ${deskBackdropMenu}`;
        const body = `
                <div class="p-6 space-y-4">
                    <button type="button" id="btn-menu-chat" class="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all group">
                         <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center text-xl">💬</div>
                            <div>
                                <h4 class="font-bold text-slate-800 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">${ui.sageMenuChatTitle || 'Chat'}</h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400">${ui.sageMenuChatDesc || ''}</p>
                            </div>
                         </div>
                    </button>
                    <button type="button" id="btn-menu-settings" class="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group">
                         <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center text-xl">⚙️</div>
                            <div>
                                <h4 class="font-bold text-slate-800 dark:text-white group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">${ui.sageSettings}</h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400">${ui.sageConfigDesc}</p>
                            </div>
                         </div>
                    </button>
                </div>`;
        this.innerHTML = mob ? `
            <div class="pointer-events-auto flex flex-col h-full max-h-full min-h-0 w-full max-w-[100vw] overflow-hidden animate-in fade-in duration-200">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full overflow-hidden">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back w-11 h-11 shrink-0', { tagClass: 'btn-close' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">🦉</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageMenuTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${body}
                </div>
                </div>
            </div>
        ` : `
            <div class="pointer-events-auto arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--narrow bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                    <span class="text-2xl shrink-0" aria-hidden="true">🦉</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageMenuTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${body}</div>
            </div>
        `;
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        this.querySelector('#btn-menu-chat').onclick = () => { this.mode = 'chat'; this.render(); };
        this.querySelector('#btn-menu-settings').onclick = () => { this.mode = 'settings'; this.render(); };
    }

}
