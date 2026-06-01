

import { store } from '../../core/store.js';
import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';
import { escAttr } from '../../shared/lib/html-escape.js';
import { countCareDue, openArcadeCare } from './care-reminders.js';
import { computeCareStats } from './study-stats.js';
import { modalHeroHtml } from '../../shared/ui/modal-hero.js';
import { modalShellHtml } from '../../shared/ui/modal-shell.js';
import { renderVitalityBannerHtml, renderGardenPlotHtml } from './garden-ui.js';
import { getVitalityPct, getVitalityLabel } from './garden-stage.js';
import { getAvailableLumens } from './lumen-shop.js';

const PROGRESS_MODAL_CLASS = 'arborito-progress-modal-open';

function syncProgressModalChrome(isOpen) {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle(PROGRESS_MODAL_CLASS, !!isOpen);
}

class ArboritoProgressWidget extends HTMLElement {
    constructor() {
        super();
        this.isOpen = false;
        this.renderKey = null;
        this._prAf = null;
        this.toggleHandler = () => this.toggle();
    }

    _scheduleRender() {
        if (this._prAf != null) return;
        this._prAf = requestAnimationFrame(() => {
            this._prAf = null;
            this.render();
        });
    }

    connectedCallback() {
        this.render();
        this._storeListener = () => this._scheduleRender();
        store.addEventListener('state-change', this._storeListener);
        store.addEventListener('graph-update', this._storeListener);
        this._onArboritoViewport = () => {
            this.renderKey = null;
            this._scheduleRender();
        };
        window.addEventListener('arborito-viewport', this._onArboritoViewport);

        this._docClickHandler = (e) => {
            if (this.isOpen && !this.contains(e.target) && !e.target.closest('.js-btn-progress-mobile')) {
                this.isOpen = false;
                syncProgressModalChrome(false);
                this._scheduleRender();
            }
        };
        document.addEventListener('click', this._docClickHandler);
        document.addEventListener('toggle-progress-widget', this.toggleHandler);
    }

    disconnectedCallback() {
        syncProgressModalChrome(false);
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
            store.removeEventListener('graph-update', this._storeListener);
        }
        if (this._docClickHandler) {
            document.removeEventListener('click', this._docClickHandler);
        }
        if (this._prAf != null) {
            cancelAnimationFrame(this._prAf);
            this._prAf = null;
        }
        document.removeEventListener('toggle-progress-widget', this.toggleHandler);
        if (this._onArboritoViewport) {
            window.removeEventListener('arborito-viewport', this._onArboritoViewport);
        }
    }

    toggle() {
        this.isOpen = !this.isOpen;
        syncProgressModalChrome(this.isOpen);
        if (this.isOpen) this._progressJustOpened = true;
        this._scheduleRender();
    }

    getStats() {
        const modules = store.getModulesStatus();
        const totalLeaves = modules.reduce((acc, m) => acc + m.totalLeaves, 0);
        const completedLeaves = modules.reduce((acc, m) => acc + m.completedLeaves, 0);
        const completedModules = modules.filter(m => m.isComplete).length;

        const percentage = totalLeaves === 0 ? 0 : Math.round((completedLeaves / totalLeaves) * 100);

        return {
            completedLeaves,
            completedModules,
            percentage,
            totalLeaves
        };
    }

    /**
     * @param {{ omitGardenBlock?: boolean, omitActions?: boolean, mobile?: boolean }} [layout]
     */
    buildCompactBodyHtml(ctx, layout = {}) {
        const { omitGardenBlock = false, omitActions = false, mobile = false, modalFull = false } = layout;
        const {
            ui, g, stats, collectedItems, certsAll, trophyLabel, seedsLabel
        } = ctx;

        const earnedCerts = certsAll.filter(c => c.isComplete);
        const trophyTotal = certsAll.length;
        const trophyEarned = earnedCerts.length;
        const seedPreview = collectedItems.slice(-12).reverse();
        const trophyPreview = earnedCerts.slice(-10).reverse();

        const lessonsLine = `${stats.completedLeaves} ${ui.progressLessons || 'lessons'} · ${stats.completedModules} ${ui.progressModules || 'modules'}`;

        const careLine = [
            `${ctx.careStats.reviewedToday} ${ui.careReviewedToday || 'today'}`,
            `${ctx.careStats.inInterval} ${ui.careInInterval || 'interval'}`,
            `${ctx.careStats.avgHealth}% ${ui.careHealth || 'health'}`
        ].join(' · ');

        const seedsInner = seedPreview.length
            ? `<div class="mochila-v2__collection">${seedPreview.map(s => `
                <span class="mochila-v2__chip" title="${escAttr(s.id)}">${s.icon || '🌱'}</span>
            `).join('')}</div>`
            : `<p class="mochila-v2__hint">${escAttr(ui.gardenEmpty || '—')}</p>`;

        const trophiesInner = trophyPreview.length
            ? `<div class="mochila-v2__collection">${trophyPreview.map(c => `
                <button type="button" class="mochila-v2__trophy js-mochila-open-cert arborito-desktop-hit" data-id="${encodeURIComponent(c.id)}" title="${escAttr(c.name)}">${c.icon || '🏆'}</button>
            `).join('')}</div>`
            : `<p class="mochila-v2__hint">${trophyEarned === 0 && trophyTotal > 0 ? escAttr(ui.lockedCert || '🔒') : '—'}</p>`;

        const careCountClass = ctx.dueCount > 0 ? ' mochila-v2__card-count--due' : '';
        const vitalityPct = getVitalityPct(g.dailyXP, ctx.dailyGoalVal || 50);
        const vitalityLabel = getVitalityLabel(vitalityPct, ui);
        const lumensBalance = getAvailableLumens(g);
        const shieldCount = g.streakShields || 0;
        const dailyGoalLine = mobile
            ? `<p class="mochila-v2__daily-goal">${escAttr(String(g.dailyXP || 0))}/${ctx.dailyGoalVal} ☀️ ${escAttr(ui.todayGoal || 'Fotosíntesis')} · ${escAttr(vitalityLabel)}</p>`
            : '';

        return `
            <div class="mochila-v2${mobile ? ' mochila-v2--mobile' : ''}${mobile && modalFull ? ' mochila-v2--modal' : ''}">
                ${mobile ? dailyGoalLine : renderVitalityBannerHtml(store, ui, { compact: true })}
                <div class="mochila-v2__splash">
                    <div class="mochila-v2__ring mochila-v2__ring--vitality" style="--pct:${stats.percentage};--vitality:${vitalityPct}" role="img" aria-label="${escAttr((ui.progressTitle || 'Progress') + ' ' + stats.percentage + '%')}">
                        <div class="mochila-v2__ring-inner">
                            <span class="mochila-v2__ring-pct">${stats.percentage}<small>%</small></span>
                            <span class="mochila-v2__ring-emoji" aria-hidden="true">${stats.percentage >= 100 ? '🌳' : stats.percentage > 0 ? '🌿' : '🌱'}</span>
                        </div>
                    </div>
                    <p class="mochila-v2__subtitle">${escAttr(lessonsLine)}</p>
                </div>

                <div class="mochila-v2__badges">
                    <div class="mochila-v2__badge mochila-v2__badge--streak">
                        <span class="mochila-v2__badge-ic" aria-hidden="true">💧</span>
                        <span class="mochila-v2__badge-val">${g.streak}</span>
                        <span class="mochila-v2__badge-lb">${escAttr(ui.streak || 'Streak')}</span>
                    </div>
                    ${shieldCount > 0 ? `
                    <div class="mochila-v2__badge mochila-v2__badge--shield" title="${escAttr(ui.streakShieldHint || '')}">
                        <span class="mochila-v2__badge-ic" aria-hidden="true">🍃</span>
                        <span class="mochila-v2__badge-val">${shieldCount}</span>
                        <span class="mochila-v2__badge-lb">${escAttr(ui.streakShieldLabel || 'Paraguas')}</span>
                    </div>` : ''}
                    <div class="mochila-v2__badge mochila-v2__badge--sun" title="${escAttr(ui.lumensBadgeHint || 'Lúmenes acumulados: gastalos en el jardín del Arcade.')}">
                        <span class="mochila-v2__badge-ic" aria-hidden="true">☀️</span>
                        <span class="mochila-v2__badge-val">${lumensBalance}</span>
                        <span class="mochila-v2__badge-lb">${escAttr(ui.lumensBadgeLabel || ui.xpUnit || 'Lúmenes')}</span>
                    </div>
                </div>

                ${collectedItems.length ? `
                <article class="mochila-v2__card" aria-label="${escAttr(seedsLabel)}">
                    <div class="mochila-v2__card-head">
                        <span class="mochila-v2__card-title"><span aria-hidden="true">🪴</span> ${escAttr(ui.gardenPlotTitle || seedsLabel)}</span>
                    </div>
                    ${renderGardenPlotHtml(store, ui)}
                </article>
                ` : ''}

                <div class="mochila-v2__cards">
                    <article class="mochila-v2__card mochila-v2__card--care" aria-label="${escAttr(ui.arcadeTabCare || 'Care')}">
                        <div class="mochila-v2__card-head">
                            <span class="mochila-v2__card-title"><span aria-hidden="true">🍂</span> ${escAttr(ui.arcadeTabCare || 'Care')}</span>
                            <span class="mochila-v2__card-count${careCountClass}">${ctx.dueCount > 0 ? ctx.dueCount : ''}</span>
                        </div>
                        <p class="mochila-v2__hint">${escAttr(careLine)}</p>
                        ${ctx.dueCount > 0 ? `<button type="button" class="mochila-v2__btn mochila-v2__btn--primary js-mochila-care" style="margin-top:0.55rem">${escAttr(ui.arcadeWaterBtn || 'Water')} (${ctx.dueCount})</button>` : ''}
                    </article>

                    ${omitGardenBlock ? '' : `
                    <article class="mochila-v2__card" aria-label="${escAttr(seedsLabel)}">
                        <div class="mochila-v2__card-head">
                            <span class="mochila-v2__card-title"><span aria-hidden="true">🌱</span> ${escAttr(seedsLabel)}</span>
                            <span class="mochila-v2__card-count">${collectedItems.length}</span>
                        </div>
                        ${seedsInner}
                    </article>
                    `}

                    <article class="mochila-v2__card" aria-label="${escAttr(trophyLabel)}">
                        <div class="mochila-v2__card-head">
                            <span class="mochila-v2__card-title"><span aria-hidden="true">🏆</span> ${escAttr(trophyLabel)}</span>
                            <span class="mochila-v2__card-count">${trophyEarned}/${trophyTotal || '0'}</span>
                        </div>
                        ${trophiesInner}
                    </article>
                </div>

                ${omitActions ? '' : `
                <div class="mochila-v2__actions">
                    <button type="button" class="mochila-v2__btn mochila-v2__btn--primary js-mochila-certs">${escAttr(ui.progressViewCerts || 'Certificates')}</button>
                </div>
                `}
            </div>
        `;
    }

    bindMochilaActions(mob) {
        this.querySelectorAll('.js-mochila-open-cert').forEach(b => {
            b.onclick = (e) => {
                e.stopPropagation();
                const raw = b.getAttribute('data-id');
                if (!raw) return;
                let id;
                try {
                    id = decodeURIComponent(raw);
                } catch {
                    id = raw;
                }
                store.setModal({ type: 'certificate', moduleId: id });
                if (mob) {
                    this.isOpen = false;
                    syncProgressModalChrome(false);
                    this._scheduleRender();
                }
            };
        });

        const closeIfMobile = () => {
            if (mob) {
                this.isOpen = false;
                syncProgressModalChrome(false);
                this._scheduleRender();
            }
        };

        this.querySelectorAll('.js-mochila-certs').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                store.setViewMode('certificates');
                closeIfMobile();
            };
        });

        this.querySelectorAll('.js-mochila-care').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                openArcadeCare(store);
                closeIfMobile();
            };
        });
    }

    render() {
        if (store.value.constructionMode || !store.state.data) {
            syncProgressModalChrome(false);
            this.style.display = 'none';
            return;
        }
        this.style.display = 'block';

        const stats = this.getStats();
        const ui = store.ui;
        const g = store.value.gamification;
        const dailyGoalVal = store.dailyXpGoal || 0;
        const dailyProgress = dailyGoalVal <= 0 ? 0 : Math.min(100, Math.round((g.dailyXP / dailyGoalVal) * 100));

        const collectedItems = g.seeds || g.fruits || [];
        const seedsWord = ui.seedsTitle || 'seeds';
        const certsAll = store.getAvailableCertificates();
        const dueCount = countCareDue(store);
        const careStats = computeCareStats(store);

        const mob = shouldShowMobileUI();
        const trophyLabel = ui.navCertificates || 'Certificates';
        const seedsLabel = ui.gardenTitle || ui.seedsTitle || 'Seeds';
        const progressHeading = ui.progressTitle || 'Progress';

        const currentKey = JSON.stringify({
            isOpen: this.isOpen,
            percentage: stats.percentage,
            completedLeaves: stats.completedLeaves,
            completedModules: stats.completedModules,
            streak: g.streak,
            streakShields: g.streakShields || 0,
            lumensBalance: getAvailableLumens(g),
            dailyXP: g.dailyXP,
            itemCount: collectedItems.length,
            theme: store.value.theme,
            mob,
            trophyEarned: certsAll.filter(c => c.isComplete).length,
            trophyTotal: certsAll.length,
            dueCount,
            careSig: `${careStats.due}-${careStats.reviewedToday}-${careStats.avgHealth}`,
            seedsSig: collectedItems.map(s => s.id).slice(-12).join(',')
        });
        if (currentKey === this.renderKey) return;
        this.renderKey = currentKey;

        syncProgressModalChrome(this.isOpen && mob);

        const compactCtx = {
            ui,
            g,
            stats,
            dailyProgress,
            dailyGoalVal,
            collectedItems,
            certsAll,
            seedsWord,
            trophyLabel,
            seedsLabel,
            dueCount,
            careStats,
            progressHeading
        };
        const desktopHtml = this.buildCompactBodyHtml(compactCtx, { omitActions: true });
        const mobileHtml = this.buildCompactBodyHtml(compactCtx, { mobile: true, omitGardenBlock: true, modalFull: true });

        this.innerHTML = `
        <div class="relative">
            ${!mob ? `
            <div class="arborito-desktop-mochila-host">
                <aside class="arborito-mochila-card arborito-mochila-card--v2" aria-label="${escAttr(progressHeading)}">
                    ${desktopHtml}
                </aside>
            </div>
            ` : ''}

            ${this.isOpen && mob ? modalShellHtml({
                bodyHtml: `<div class="mochila-modal-body flex flex-col flex-1 min-h-0 h-full overflow-hidden">${modalHeroHtml(ui, {
                    mobile: true,
                    title: progressHeading,
                    leadingIcon: '<span class="text-2xl shrink-0 leading-none" aria-hidden="true">🎒</span>',
                    tagClass: 'btn-close-mobile-mochila',
                    trailingSpacer: true,
                })}
                <div class="mochila-modal-scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    ${mobileHtml}
                </div></div>`,
                layout: 'dock',
                mobile: true,
                z: 220,
                scrim: 'translucent',
                instantOpen: !!this._progressJustOpened,
                backdropId: 'mobile-widget-overlay',
            }) : ''}
        </div>
        `;

        if (!mob) {
            this.bindMochilaActions(false);
        } else {
            this._progressJustOpened = false;
            const btnCloseMobile = this.querySelector('.btn-close-mobile-mochila');
            if (btnCloseMobile) {
                btnCloseMobile.onclick = (e) => {
                    e.stopPropagation();
                    this.isOpen = false;
                    syncProgressModalChrome(false);
                    this._scheduleRender();
                };
            }
            const overlay = this.querySelector('#mobile-widget-overlay');
            if (overlay) {
                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        this.isOpen = false;
                        syncProgressModalChrome(false);
                        this._scheduleRender();
                    }
                };
            }
            if (this.isOpen) this.bindMochilaActions(true);
        }
    }
}

customElements.define('arborito-progress-widget', ArboritoProgressWidget);
