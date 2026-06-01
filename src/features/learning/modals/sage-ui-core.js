import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { calloutHtml } from '../../../shared/ui/callout.js';
import { bindCloseTaps, bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { escHtml } from '../../tree-graph/graph/graph-mobile-shared.js';
import { buildTreeBreadcrumb } from '../ai-context.js';
import { aiService } from '../ai.js';
import { getSageAiMode, setSageAiMode } from '../sage-contextual.js';
import {
    buildSageGuideDrillHtml,
    defaultSageGuideNav,
    detectSageGuideContext,
    resolveTipText
} from '../sage-guide-drill.js';

export const SAGE_OPEN = 'arborito-sage--open';

export function sageHideDismissButton() {
    return false;
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
            guideNav: `${guideNav.screen || 'hub'}:${guideNav.topicId || ''}:${guideNav.tipText ? '1' : '0'}`,
            aiStatus: ai.status,
            msgCount: ai.messages.length
        });

        if (stateKey === this.lastRenderKey) return;
        this.lastRenderKey = stateKey;

        if (this.mode === 'settings') {
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

    /**
     * Canonical Sage header — same `modalHeroHtml` row as search / profile / arcade.
     * @param {object} ui
     * @param {{
     *   mob?: boolean,
     *   title?: string,
     *   subtitle?: string,
     *   subtitleClass?: string,
     *   leadingIcon?: string,
     *   trailingHtml?: string,
     *   showBack?: boolean,
     *   showClose?: boolean,
     *   closeShowOnMobile?: boolean,
     *   backTagClass?: string,
     *   wrapperId?: string,
     * }} [opts]
     */
    _sageHeroHtml(ui, opts = {}) {
        const mob = opts.mob == null ? shouldShowMobileUI() : !!opts.mob;
        const hideDismiss = sageHideDismissButton();
        const title = opts.title != null ? opts.title : escHtml(ui.sageTitle || 'Sage');
        return modalHeroHtml(ui, {
            mobile: mob,
            title,
            titleClass: 'arborito-mmenu-subtitle m-0 leading-tight',
            subtitle: opts.subtitle,
            subtitleClass:
                opts.subtitleClass ||
                'text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 truncate',
            leadingIcon:
                opts.leadingIcon ||
                '<span class="text-2xl shrink-0 leading-none" aria-hidden="true">🦉</span>',
            trailingHtml: opts.trailingHtml || '',
            showBack: opts.showBack != null ? opts.showBack : !hideDismiss,
            showClose: opts.showClose != null ? opts.showClose : !hideDismiss,
            closeShowOnMobile: !!opts.closeShowOnMobile,
            backTagClass: opts.backTagClass || 'btn-sage-back',
            closeTagClass: 'btn-close',
            wrapperId: opts.wrapperId,
        });
    }

    /** Mobile dock-panel shell shared by chat, settings, loading, consent, menu. */
    _sageMobDockPanelHtml(innerHtml, anim = '', outerExtraClass = '') {
        return `<div class="pointer-events-auto flex flex-col h-full min-h-0 w-full overflow-hidden${outerExtraClass}${anim}">
            <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full max-h-full overflow-hidden">
                ${innerHtml}
            </div>
        </div>`;
    }

    _sageMobHostClass(construction = false) {
        const lessonOverlay = this._sageLessonContext;
        if (construction) {
            return `${SAGE_OPEN} fixed z-[160] arborito-sage-mob-frame flex flex-col items-stretch pointer-events-none`;
        }
        const frameCls = lessonOverlay ? 'arborito-sage-mob-frame arborito-sage-mob-frame--lesson' : 'arborito-sage-mob-frame';
        return `${SAGE_OPEN} fixed z-[160] ${frameCls} flex flex-col items-stretch pointer-events-none bg-slate-100 dark:bg-slate-950`;
    }

    renderDynamicConsent() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdrop = mob ? '' : 'arborito-sage-desk-scrim';
        this.className = mob
            ? this._sageMobHostClass()
            : `${SAGE_OPEN} fixed inset-0 z-[160] flex pointer-events-none items-center justify-center p-4 ${deskBackdrop}`;
        const disclaimer = escHtml(ui.sageExperimentalDisclaimer || '');
        const warnBugs = escHtml(ui.sageExperimentalBuggyWarn || '');
        const title = escHtml(ui.sageExperimentalTitle || 'Optional AI helper (preview)');
        const dynAnim = this._sageEnterAnimClass();
        /* Closing must revert to guide mode or the dynamic consent screen reappears on next open. */
        const closeAndRevertToGuide = () => {
            setSageAiMode('guide');
            this.close();
        };
        const hero = this._sageHeroHtml(ui, {
            mob,
            title,
            subtitle: escHtml(ui.sageExperimentalBadge || ''),
            showBack: !hideDismiss,
            showClose: !hideDismiss,
            backTagClass: 'btn-close',
        });
        const optionalBannerHtml = ui.sageAiOptionalBanner
            || 'AI in Arborito is fully <strong>optional</strong>. You can keep using every other feature without it.';
        const bodyInner = `
            <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
            ${calloutHtml({ tone: 'blue', layout: 'stack', extraClass: 'mb-4', htmlBody: `<p class="text-xs text-blue-900 dark:text-blue-100 leading-relaxed m-0">${optionalBannerHtml}</p>` })}
            ${calloutHtml({ tone: 'amber', layout: 'stack', extraClass: 'mb-4', htmlBody: `<p class="text-xs text-amber-900 dark:text-amber-100 leading-relaxed m-0 font-medium">${warnBugs}</p>` })}
            ${calloutHtml({ tone: 'amber', layout: 'stack', extraClass: 'mb-4', htmlBody: `<p class="text-xs text-amber-900 dark:text-amber-100 leading-relaxed m-0">${disclaimer}</p>` })}
            ${calloutHtml({ tone: 'blue', layout: 'stack', extraClass: 'mb-4', htmlBody: `<p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed m-0">${escHtml(ui.sageGdprText || '')}</p>` })}
            <p class="text-[10px] text-slate-500 dark:text-slate-400 mb-4">${escHtml(ui.sageGdprConnectsNote || '')}</p>
            <button type="button" id="btn-accept-dynamic-consent" class="arborito-cta-purple w-full py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-transform">${escHtml(ui.sageExperimentalOptIn || ui.sageGdprAccept || 'Enable AI (optional)')}</button>
            <button type="button" id="btn-sage-decline-dynamic" class="w-full mt-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">${escHtml(ui.sageExperimentalStayGuide || 'No thanks — stay in Guide mode')}</button>
            </div>`;
        this.innerHTML = mob
            ? this._sageMobDockPanelHtml(`${hero}${bodyInner}`, dynAnim)
            : `<div class="pointer-events-auto arborito-float-modal-card arborito-float-modal-card--auto-h max-w-md w-full overflow-hidden flex flex-col${dynAnim}">${hero}${bodyInner}</div>`;
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
        bindCloseTaps(this, closeAndRevertToGuide);
    }

    renderContext() {
        this._renderGuideContext(store.ui);
    }

    _sageBodyScrollClass({ guideOpen = false } = {}) {
        const mob = shouldShowMobileUI();
        if (guideOpen) {
            return 'arborito-sage-body arborito-sage-body--guide flex-1 min-h-0 flex flex-col overflow-hidden p-3 pt-0 pb-3';
        }
        const sizing = mob ? 'flex-1 min-h-0' : 'flex-1 min-h-0';
        return `arborito-sage-body ${sizing} overflow-y-auto p-3 custom-scrollbar`;
    }

    _sageEnterAnimClass() {
        return this._sageEnterAnim ? ' arborito-dock-modal-enter' : '';
    }

    _sageMountShell(mob, panelClean, { construction = false } = {}) {
        const anim = this._sageEnterAnimClass();
        if (mob) {
            /* Same dock shell as search/chat: full-bleed panel with standard edge-to-edge header. */
            this.className = this._sageMobHostClass(construction);
            this.innerHTML = `<div class="pointer-events-auto flex flex-col h-full min-h-0 w-full overflow-hidden arborito-sage-guide-full-mob${anim}">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full max-h-full overflow-hidden">
                    ${panelClean}
                </div>
            </div>`;
            return;
        }
        this.className = `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[160] flex flex-col items-end md:bottom-6 md:right-6 md:w-auto pointer-events-none`;
        this.innerHTML = `<div class="pointer-events-auto arborito-sage-guide-shell flex flex-col overflow-hidden${anim}">${panelClean}</div>`;
    }

    _lessonGuideSubtitle(node, ui) {
        if (!node) return ui.sageContextSubtitle || '';
        const name = String(node.name || '').trim();
        const crumb = buildTreeBreadcrumb(store, node, { maxChars: 72 });
        if (name && crumb) return `${name} · ${crumb}`;
        return name || crumb || ui.sageContextSubtitle || '';
    }

    _sageGuideSubtitle(ui) {
        const lessonNode = this._sageLessonContext ? store.value.selectedNode : null;
        if (lessonNode && (lessonNode.type === 'leaf' || lessonNode.type === 'exam')) {
            return this._lessonGuideSubtitle(lessonNode, ui);
        }
        if (store.value.constructionMode) {
            return ui.sageConstructGuideSubtitle || ui.navConstruct || '';
        }
        return ui.sageTreeGuideSubtitle || '';
    }

    _sagePopGuideNav() {
        const nav = this._sageGuideNav || defaultSageGuideNav();
        if (nav.screen === 'tip') {
            if (nav.returnTopicId) {
                this._sageGuideNav = {
                    screen: 'topic',
                    topicId: nav.returnTopicId,
                    parentTopic: nav.parentTopic || ''
                };
            } else {
                this._sageGuideNav = defaultSageGuideNav();
            }
            return true;
        }
        if (nav.screen === 'topic') {
            if (nav.parentTopic && nav.topicId !== nav.parentTopic) {
                this._sageGuideNav = { screen: 'topic', topicId: nav.parentTopic };
                return true;
            }
            this._sageGuideNav = defaultSageGuideNav();
            return true;
        }
        return false;
    }

    _renderGuideContext(ui) {
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const title = ui.sageTitle || 'Sage';
        const subtitle = this._sageGuideSubtitle(ui);
        if (!this._sageGuideNav) this._sageGuideNav = defaultSageGuideNav();

        const lessonNode = this._sageLessonContext ? store.value.selectedNode : null;
        const ctxOpts = { lessonNode };
        const innerFinal = buildSageGuideDrillHtml(ui, this._sageGuideNav, store, ctxOpts);

        const nav = this._sageGuideNav;
        const showBack = nav.screen !== 'hub';
        const showBackBtn = showBack || mob;
        /* Breadcrumbs now live INSIDE the guide body for non-hub screens, so the
         * header subtitle would just echo the current crumb. Drop it on non-hub
         * to avoid the duplicated "Guía › X" + "X" stutter the user complained
         * about. On the hub keep the standard Sage subtitle ("Tu guía…"). */
        const guideSubtitle = showBack ? '' : escHtml(subtitle);
        const headerHtml = this._sageHeroHtml(ui, {
            mob,
            title: escHtml(title),
            subtitle: guideSubtitle || undefined,
            subtitleClass: showBack
                ? 'text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 truncate'
                : 'text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 truncate',
            trailingHtml: this._sageModeToggleHtml(ui),
            showBack: showBackBtn,
            showClose: !hideDismiss,
        });

        const construction = !!store.value.constructionMode;
        const bodyHtml = `<div class="${this._sageBodyScrollClass({ guideOpen: true })} px-2">${innerFinal}</div>`;
        /* Hero and body are direct children of the dock panel — no extra wrapper. */
        const panelClean = mob
            ? `${headerHtml}${bodyHtml}`
            : `<div class="flex flex-col min-h-0 flex-1 h-full overflow-hidden">${headerHtml}${bodyHtml}</div>`;

        this._sageMountShell(mob, panelClean, { construction });
        this._wireSageGuideActions(ui, ctxOpts);
    }

    _wireSageGuideActions(ui, ctxOpts) {
        /* Desktop X always closes Sage; mobile back pops the guide stack before closing. */
        bindCloseTaps(this, () => this.close(), '.arborito-modal-window-x');
        const backArrow = this.querySelector('.arborito-mmenu-back');
        if (backArrow) {
            bindMobileTap(backArrow, () => {
                const nav = this._sageGuideNav;
                if (nav && nav.screen && nav.screen !== 'hub') {
                    if (this._sagePopGuideNav()) {
                        this.lastRenderKey = null;
                        this.render();
                        return;
                    }
                }
                this.close();
            });
        }

        const dockUi = !!store.value.modal?.dockUi;
        const ctx = detectSageGuideContext(store, ctxOpts);
        const node = ctx.node;

        const openOtherModal = (payload) => {
            store.setModal(payload);
        };

        const runSageAction = (btn) => {
            const action = btn.getAttribute('data-sage-action');
            if (action === 'pop-nav') {
                if (this._sagePopGuideNav()) {
                    this.lastRenderKey = null;
                    this.render();
                }
                return;
            }
            /* Breadcrumb jump: lets the user skip directly to any ancestor in
             * the guide nav stack (hub or a specific topic) instead of tapping
             * back repeatedly. `data-sage-nav="hub"` resets to root;
             * `data-sage-nav="topic" data-sage-topic="discover"` lands on a
             * specific intermediate topic. See `sageBreadcrumbs` in
             * `utils/sage-guide-content.js`. */
            if (action === 'goto-nav') {
                const dest = btn.getAttribute('data-sage-nav') || '';
                if (dest === 'hub') {
                    this._sageGuideNav = defaultSageGuideNav();
                } else if (dest === 'topic') {
                    const topicId = btn.getAttribute('data-sage-topic') || '';
                    if (!topicId) return;
                    this._sageGuideNav = { screen: 'topic', topicId };
                } else {
                    return;
                }
                this.lastRenderKey = null;
                this.render();
                return;
            }
            if (action === 'open-topic') {
                const topicId = btn.getAttribute('data-sage-topic');
                if (!topicId) return;
                const parentTopic = btn.getAttribute('data-sage-parent-topic') || '';
                this._sageGuideNav = {
                    screen: 'topic',
                    topicId,
                    ...(parentTopic ? { parentTopic } : {})
                };
                this.lastRenderKey = null;
                this.render();
                return;
            }
            if (action === 'show-tip') {
                const topicId = btn.getAttribute('data-sage-topic');
                if (!topicId) return;
                const tipText =
                    resolveTipText(topicId, ui, store, ctx) ||
                    ui.sageGuideTipEmpty ||
                    'No hay información extra para mostrar aquí.';
                const curNav = this._sageGuideNav || defaultSageGuideNav();
                this._sageGuideNav = {
                    screen: 'tip',
                    tipText,
                    tipTitle: btn.querySelector('.sage-card__title')?.textContent || '',
                    returnTopicId: curNav.screen === 'topic' ? curNav.topicId : '',
                    parentTopic: curNav.parentTopic || ''
                };
                this.lastRenderKey = null;
                this.render();
                return;
            }
            if (action === 'close-sage') {
                this.close();
                return;
            }
            if (action === 'open-search') {
                openOtherModal({ type: 'search', dockUi });
                return;
            }
            if (action === 'open-arcade') {
                openOtherModal({ type: 'arcade', dockUi });
                return;
            }
            if (action === 'open-arcade-lesson') {
                const id = node?.id;
                if (id) openOtherModal({ type: 'arcade', preSelectedNodeId: id, dockUi });
                return;
            }
            if (action === 'open-sources') {
                openOtherModal({ type: 'sources', dockUi });
                return;
            }
            if (action === 'open-garden') {
                openOtherModal({ type: 'arcade', initialTab: 'garden', dockUi });
                return;
            }
            if (action === 'go-map') {
                this.close();
                store.requestGoHome();
                return;
            }
            if (action === 'start-con-tour') {
                this.close();
                queueMicrotask(() => {
                    window.dispatchEvent(
                        new CustomEvent('arborito-start-tour', { detail: { mode: 'construction', force: true } })
                    );
                });
                return;
            }
            if (action === 'exit-construction') {
                this.close();
                store.toggleConstructionMode();
            }
        };

        this.querySelectorAll('.btn-sage-back').forEach((b) => {
            bindMobileTap(b, () => {
                if (this._sagePopGuideNav()) {
                    this.lastRenderKey = null;
                    this.render();
                    return;
                }
                this.close();
            });
        });

        this.querySelectorAll('[data-sage-action]').forEach((btn) => {
            bindMobileTap(btn, () => runSageAction(btn));
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

        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        this.className = mob
            ? this._sageMobHostClass()
            : `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[160] flex flex-col items-end pointer-events-none md:bottom-6 md:right-6 md:w-auto`;
        const cancelLabel = ui.cancel || 'Cancel';
        const shellMob = mob
            ? ''
            : 'arborito-float-modal-card arborito-float-modal-card--auto-h rounded-2xl w-[min(420px,calc(100vw-2rem))] max-h-[calc(100vh-2.5rem)] rounded-t-2xl md:rounded-2xl border border-slate-200 dark:border-slate-800';
        const loadingHead = hideDismiss
            ? ''
            : this._sageHeroHtml(ui, {
                mob,
                showBack: !hideDismiss,
                showClose: !hideDismiss,
                backTagClass: 'btn-close',
            });
        const loadAnim = this._sageEnterAnimClass();
        const loadingBody = `
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
                </div>`;
        this.innerHTML = mob
            ? this._sageMobDockPanelHtml(`${loadingHead}${loadingBody}`, loadAnim)
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
        
        bindCloseTaps(this, () => this.close());
        const cancelBtn = this.querySelector('#btn-sage-loading-cancel');
        if (cancelBtn) cancelBtn.onclick = () => {
            this.close();
        };
    }
    
    renderConsent() {
        const ui = store.ui;
        const gdprTitle = ui.sageGdprTitle || '';
        const gdprBody = ui.sageGdprText || '';
        const gdprNote = ui.sageGdprConnectsNote || '';
        const gdprAccept = ui.sageGdprAccept || '';
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdrop = mob ? '' : 'arborito-sage-desk-scrim';
        this.className = mob
            ? this._sageMobHostClass()
            : `${SAGE_OPEN} fixed inset-0 z-[160] flex pointer-events-none items-center justify-center p-4 ${deskBackdrop}`;
        const consentAnim = this._sageEnterAnimClass();
        const consentHero = this._sageHeroHtml(ui, {
            mob,
            title: escHtml(gdprTitle),
            leadingIcon: '<span class="text-2xl shrink-0" aria-hidden="true">📡</span>',
            showBack: !hideDismiss,
            showClose: !hideDismiss,
            backTagClass: 'btn-close',
        });
        const consentBody = `
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
                    ${calloutHtml({ tone: 'blue', layout: 'stack', extraClass: 'mb-6', htmlBody: `<p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium m-0">${gdprBody}</p>` })}
                    ${calloutHtml({ tone: 'yellow', layout: 'stack', size: 'sm', extraClass: 'mb-6', htmlBody: `<p class="text-xs text-yellow-700 dark:text-yellow-400 leading-tight font-bold m-0">${gdprNote}</p>` })}
                    <button type="button" id="btn-accept-consent" class="arborito-cta-blue w-full py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-transform">
                        ${gdprAccept}
                    </button>
                </div>`;
        this.innerHTML = mob
            ? this._sageMobDockPanelHtml(`${consentHero}${consentBody}`, consentAnim)
            : `
            <div class="pointer-events-auto arborito-float-modal-card arborito-float-modal-card--auto-h arborito-sage-external-download-card relative overflow-hidden flex flex-col animate-in zoom-in duration-200">
                ${consentHero}
                ${consentBody}
            </div>
        `;
        bindCloseTaps(this, () => this.close());
        this.querySelector('#btn-accept-consent').onclick = () => this.acceptConsent();
    }

    renderMenu() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdropMenu = mob ? '' : 'arborito-sage-desk-scrim';
        this.className = mob
            ? this._sageMobHostClass()
            : `${SAGE_OPEN} fixed inset-0 z-[160] flex pointer-events-none items-center justify-center p-4 ${deskBackdropMenu}`;
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
        const menuAnim = this._sageEnterAnimClass();
        const menuHero = this._sageHeroHtml(ui, {
            mob,
            title: escHtml(ui.sageMenuTitle || ui.sageTitle || 'Sage'),
            showBack: !hideDismiss,
            showClose: !hideDismiss,
            backTagClass: 'btn-close',
        });
        this.innerHTML = mob
            ? this._sageMobDockPanelHtml(`${menuHero}<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${body}</div>`, menuAnim)
            : `
            <div class="pointer-events-auto arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--narrow relative overflow-hidden flex flex-col animate-in zoom-in duration-200">
                ${menuHero}
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${body}</div>
            </div>
        `;
        bindCloseTaps(this, () => this.close());
        this.querySelector('#btn-menu-chat').onclick = () => { this.mode = 'chat'; this.render(); };
        this.querySelector('#btn-menu-settings').onclick = () => { this.mode = 'settings'; this.render(); };
    }

}
