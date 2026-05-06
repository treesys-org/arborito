

import { store } from '../store.js';
import { shouldShowMobileUI, useDockModalChrome } from '../utils/breakpoints.js';
import { escAttr } from '../utils/html-escape.js';

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
                this._scheduleRender();
            }
        };
        document.addEventListener('click', this._docClickHandler);
        document.addEventListener('toggle-progress-widget', this.toggleHandler);
    }

    disconnectedCallback() {
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
     * Compact body: progress, seeds, and trophies (mobile); desktop may omit garden block and actions.
     * @param {{ omitGardenBlock?: boolean, omitActions?: boolean }} [layout]
     */
    buildCompactBodyHtml(ctx, layout = {}) {
        const progressHeading = (ctx.progressHeading != null ? ctx.progressHeading : (ctx.ui.progressTitle || 'Progress'));
        const { omitGardenBlock = false, omitActions = false } = layout;
        const {
            ui, g, stats, dailyProgress, dailyGoalVal, collectedItems, certsAll, seedsWord, trophyLabel, seedsLabel
        } = ctx;

        const earnedCerts = certsAll.filter(c => c.isComplete);
        const trophyTotal = certsAll.length;
        const trophyEarned = earnedCerts.length;
        const seedPreview = collectedItems.slice(-10).reverse();
        const trophyPreview = earnedCerts.slice(-8).reverse();

        const seedsRow = seedPreview.length
            ? seedPreview.map(s => `
                <span class="arborito-mochila-ico" title="${escAttr(s.id)}">${s.icon || '🌱'}</span>
            `).join('')
            : `<span class="arborito-mochila-empty">${ui.gardenEmpty || '—'}</span>`;

        const trophiesRow = trophyPreview.length
            ? trophyPreview.map(c => `
                <button type="button" class="arborito-mochila-trophy js-mochila-open-cert arborito-desktop-hit" data-id="${encodeURIComponent(c.id)}" title="${escAttr(c.name)}">
                    <span class="arborito-mochila-trophy__ic">${c.icon || '🏆'}</span>
                </button>
            `).join('')
            : `<span class="arborito-mochila-empty">${trophyEarned === 0 && trophyTotal > 0 ? (ui.lockedCert || '🔒') : '—'}</span>`;

        return `
            <div class="arborito-mochila-stats">
                <div class="arborito-mochila-stat arborito-mochila-stat--blue">
                    <span class="arborito-mochila-stat__ic" aria-hidden="true">💧</span>
                    <span class="arborito-mochila-stat__val">${g.streak}</span>
                    <span class="arborito-mochila-stat__lb">${ui.streak}</span>
                </div>
                <div class="arborito-mochila-stat arborito-mochila-stat--amber">
                    <span class="arborito-mochila-stat__ic" aria-hidden="true">☀️</span>
                    <span class="arborito-mochila-stat__val">${g.dailyXP}</span>
                    <span class="arborito-mochila-stat__lb">${ui.todayGoal}</span>
                    <div class="arborito-mochila-stat__fill" style="height:${dailyProgress}%"></div>
                </div>
            </div>

            <div class="arborito-mochila-course">
                <div class="arborito-mochila-course__head">
                    <span class="arborito-mochila-course__title">${progressHeading}</span>
                    <span class="arborito-mochila-course__pct">${stats.percentage}%</span>
                </div>
                <div class="arborito-mochila-course__bar" role="progressbar" aria-valuenow="${stats.percentage}" aria-valuemin="0" aria-valuemax="100">
                    <span style="width:${stats.percentage}%"></span>
                </div>
                <p class="arborito-mochila-course__meta">
                    <span>${stats.completedLeaves} ${ui.progressLessons}</span>
                    <span class="arborito-mochila-dot" aria-hidden="true">·</span>
                    <span>${stats.completedModules} ${ui.progressModules}</span>
                </p>
            </div>

            ${omitGardenBlock ? '' : `
            <section class="arborito-mochila-block" aria-label="${escAttr(seedsLabel)}">
                <div class="arborito-mochila-block__head">
                    <span class="arborito-mochila-block__title">🌱 ${seedsLabel}</span>
                    <span class="arborito-mochila-block__badge">${collectedItems.length}</span>
                </div>
                <div class="arborito-mochila-strip arborito-mochila-strip--seeds">${seedsRow}</div>
            </section>
            `}

            <section class="arborito-mochila-block arborito-mochila-block--trophies" aria-label="${escAttr(trophyLabel)}">
                <div class="arborito-mochila-block__head">
                    <span class="arborito-mochila-block__title">🏆 ${trophyLabel}</span>
                    <span class="arborito-mochila-block__badge arborito-mochila-block__badge--gold">${trophyEarned}/${trophyTotal || '0'}</span>
                </div>
                <div class="arborito-mochila-strip arborito-mochila-strip--trophies">${trophiesRow}</div>
            </section>

            ${omitActions ? '' : `
            <div class="arborito-mochila-actions">
                <button type="button" class="arborito-mochila-btn arborito-mochila-btn--primary js-mochila-certs">${ui.progressViewCerts}</button>
                <button type="button" class="arborito-mochila-btn js-mochila-backup">${ui.navProfile || 'Profile'} · ${ui.backpackTitle || 'Backup'}</button>
                <button type="button" class="arborito-mochila-btn js-mochila-arcade ${ctx.dueCount > 0 ? 'arborito-mochila-btn--due' : ''}">${ui.navArcade || 'Arcade'}${ctx.dueCount > 0 ? ` (${ctx.dueCount})` : ''}</button>
            </div>
            `}
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
                    this._scheduleRender();
                }
            };
        });

        const closeIfMobile = () => {
            if (mob) {
                this.isOpen = false;
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

        this.querySelectorAll('.js-mochila-backup').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                store.setModal({ type: 'profile', focus: 'backpack' });
                closeIfMobile();
            };
        });

        this.querySelectorAll('.js-mochila-arcade').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                store.setModal({ type: 'arcade', dockUi: useDockModalChrome() });
                closeIfMobile();
            };
        });
    }

    render() {
        if (store.value.constructionMode || !store.state.data) {
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
        const dueCount = store.userStore.getDueNodes().length;

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
            dailyXP: g.dailyXP,
            itemCount: collectedItems.length,
            theme: store.value.theme,
            mob,
            trophyEarned: certsAll.filter(c => c.isComplete).length,
            trophyTotal: certsAll.length,
            dueCount,
            seedsSig: collectedItems.map(s => s.id).slice(-12).join(',')
        });
        if (currentKey === this.renderKey) return;
        this.renderKey = currentKey;

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
            progressHeading
        };
        const desktopMochilaTrim = !mob;
        const compactHtml = this.buildCompactBodyHtml(compactCtx, desktopMochilaTrim ? { omitGardenBlock: true, omitActions: true } : {});

        this.innerHTML = `
        <div class="relative">
            ${!mob ? `
            <div class="arborito-desktop-mochila-host">
                <aside class="arborito-mochila-card" aria-label="${escAttr(progressHeading)} — ${escAttr(seedsWord)} & ${escAttr(trophyLabel)}">
                    <div class="arborito-mochila-card__head">
                        <span class="arborito-mochila-card__mark" aria-hidden="true">🎒</span>
                        <div class="arborito-mochila-card__titles">
                            <h2 class="arborito-mochila-card__title">${progressHeading}</h2>
                            <p class="arborito-mochila-card__sub">${stats.percentage}%</p>
                        </div>
                    </div>
                    <div class="arborito-mochila-card__body custom-scrollbar">
                        ${compactHtml}
                    </div>
                </aside>
            </div>
            ` : ''}

            ${this.isOpen && mob ? `
                <div id="mobile-widget-overlay" class="fixed inset-0 z-[120] bg-slate-950 flex flex-col items-stretch justify-start p-0 pb-[max(0.75rem,var(--arborito-mob-dock-clearance,4.25rem))] animate-in fade-in">
                    <div class="arborito-modal-dock-panel w-full flex flex-col flex-1 min-h-0 max-h-full overflow-hidden cursor-auto">
                        <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                            <button type="button" id="btn-close-mobile" class="arborito-mmenu-back shrink-0" aria-label="${ui.navBack || ui.close || 'Back'}">←</button>
                            <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">🎒 ${progressHeading}</h2>
                            <span class="w-10 shrink-0" aria-hidden="true"></span>
                        </div>
                        <div class="px-4 py-4 flex-1 overflow-y-auto custom-scrollbar min-h-0 arborito-mochila-mobile-scroll">
                            <div class="arborito-mochila-card arborito-mochila-card--mobile">
                                ${compactHtml}
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
        `;

        if (!mob) {
            this.bindMochilaActions(false);
        } else {
            const btnCloseMobile = this.querySelector('#btn-close-mobile');
            if (btnCloseMobile) {
                btnCloseMobile.onclick = (e) => {
                    e.stopPropagation();
                    this.isOpen = false;
                    this._scheduleRender();
                };
            }
            const overlay = this.querySelector('#mobile-widget-overlay');
            if (overlay) {
                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        this.isOpen = false;
                        this._scheduleRender();
                    }
                };
            }
            if (this.isOpen) this.bindMochilaActions(true);
        }
    }
}

customElements.define('arborito-progress-widget', ArboritoProgressWidget);
