import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { addScrollSafeClickDelegation, bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { DOCK_SHEET_BODY_WRAP } from '../../../shared/ui/dock-sheet-chrome.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { calloutHtml } from '../../../shared/ui/callout.js';
import { getModuleStaticGameReadiness } from '../../learning/quiz-v2-status.js';
import { escHtml, escAttr } from '../../tree-graph/graph/graph-mobile-shared.js';
import {
    renderVitalityBannerHtml,
    renderGardenPlotHtml,
    renderGardenShopHtml,
    renderRankingHtml
} from '../../garden-progress/garden-ui.js';
import { hasNetworkSocialConsent } from '../../privacy-gdpr/network-social-consent.js';

const ArcadeUI = {

    renderSkeleton() {
        const ui = store.ui;
        const isMobile = shouldShowMobileUI();
        /* Panel chrome comes from modalShellHtml({ layout: 'dock' }) via .arborito-float-modal-card.
           Do not re-add shadow-2xl / border-slate-200 here — duplicates fight the canonical CSS. */

        const contentClass = isMobile
            ? `${DOCK_SHEET_BODY_WRAP} overflow-y-auto custom-scrollbar`
            : 'flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 pt-3 flex flex-col min-h-0';

        const mainHeader = modalHeroHtml(ui, {
            mobile: isMobile,
            wrapperId: 'main-header',
            tagClass: 'btn-close',
            title: escHtml(ui.arcadeTitle),
            subtitle: escHtml(ui.arcadeDesc),
            titleClass: isMobile ? 'arborito-mmenu-subtitle m-0' : 'arborito-mmenu-subtitle m-0 leading-tight',
            subtitleClass: `text-xs text-slate-600 dark:text-slate-400 mt-1 ${isMobile ? 'font-medium' : 'font-semibold'}`,
            leadingIcon: `<span class="${isMobile ? 'text-2xl' : 'text-3xl'} shrink-0" aria-hidden="true">🎮</span>`,
        });

        const inner = `
                    <!-- Header (Setup Mode Only) -->
                    <div id="setup-header" class="hidden shrink-0"></div>

                    <!-- Header (Main Mode) — mobile: same header as search / More -->
                    ${mainHeader}

                    <!-- Tabs (Main Mode Only) -->
                    <div id="main-tabs" class="flex border-t border-b border-slate-200/90 dark:border-slate-800 bg-white/55 dark:bg-slate-950/90 shrink-0">
                        <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors border-transparent text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100" id="tab-games">
                            🎮 ${escHtml(ui.arcadeFeatured)}
                        </button>
                        <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors border-transparent text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100" id="tab-garden">
                            🍂 ${escHtml(ui.arcadeTabCare)}
                        </button>
                        <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors border-transparent text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100" id="tab-storage">
                            💾 ${escHtml(ui.arcadeTabStorage)}
                        </button>
                    </div>

                    <!-- Content Area -->
                    <div id="modal-content" class="${contentClass}">
                        <!-- Dynamic -->
                    </div>`;

        const bodyHtml = isMobile
            ? inner
            : `<div class="arborito-float-modal-card__inner flex flex-col min-h-0 flex-1 relative">${inner}</div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml,
            mobile: isMobile,
            layout: 'dock',
        });

        const tg = this.querySelector('#tab-games');
        const tn = this.querySelector('#tab-garden');
        const ts = this.querySelector('#tab-storage');
        if (tg) bindMobileTap(tg, () => { this.activeTab = 'games'; this.updateContent(); });
        if (tn) bindMobileTap(tn, () => { this.activeTab = 'garden'; this.updateContent(); });
        if (ts) bindMobileTap(ts, () => { this.activeTab = 'storage'; this.updateContent(); });

        if (typeof this._arcadeScrollSafeCleanup === 'function') {
            this._arcadeScrollSafeCleanup();
        }
        this._arcadeScrollSafeCleanup = addScrollSafeClickDelegation(this, (e) => this.handleDelegatedClick(e));
        this.addEventListener('input', (e) => {
            if(e.target.id === 'inp-filter-context') {
                this.filterText = e.target.value;
                this.updateContent();
            }
        });
    },


    renderGamesList(container, ui) {
        if (this.isLoading) {
            container.innerHTML = `<div class="p-12 text-center text-slate-400">${escHtml(ui.loading)}</div>`;
            return;
        }
        
        let html = '';
        
        if (this.wateringTargetId) {
            const targetNode = store.findNode(this.wateringTargetId);
            const targetName = escHtml(targetNode ? targetNode.name : ui.arcadeUnknownLesson);
            html += `
            <div class="bg-blue-600 text-white p-4 rounded-xl shadow-lg mb-4 flex items-center justify-center md:justify-between animate-in slide-in-from-top-2 flex-wrap gap-2">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-xl">💧</div>
                    <div>
                        <p class="text-[10px] uppercase font-bold opacity-80">${escHtml(ui.arcadeWateringMission)}</p>
                        <p class="font-bold text-sm">${escHtml(ui.arcadeReviewTarget)} <span class="underline">${targetName}</span></p>
                    </div>
                </div>
                <button data-action="cancel-watering" class="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">${escHtml(ui.cancel)}</button>
            </div>`;
        }

        const manualGames = store.userStore.state.installedGames.map(g => ({
            ...g, repoName: ui.arcadeManualInstall, isManual: true, path: g.url 
        }));
        const allGames = [...this.discoveredGames, ...manualGames];

        if (allGames.length === 0) {
            html += `<div class="arborito-empty p-8">${escHtml(ui.noResults)}</div>`;
        } else {
            html += allGames.map((g, idx) => {
                const gIcon = escHtml(g.icon || '🕹️');
                const gName = escHtml(g.name);
                const gSub = escHtml(g.description || g.path || '');
                const gRepo = escHtml(g.repoName || '');
                const rmAria = escAttr(ui.arcadeRemoveGameAria || '');
                const gId = String(g.id != null ? g.id : '');
                const gIdAttr = escAttr(gId);
                const offlineOn = store.userStore.isGameOffline(gId);
                const cacheReady = !!this.offlineCacheReady?.[gId];
                const downloading = !!this.offlineDownloading?.[gId];
                const offlineTitle = escAttr(
                    downloading
                        ? (ui.arcadeOfflineDownloadingHint || 'Downloading offline copy…')
                        : offlineOn
                            ? (ui.arcadeOfflineOnHint || 'Offline: uses saved copy, no updates')
                            : cacheReady
                                ? (ui.arcadeOfflineOffHint || 'Online: downloads latest version when you play')
                                : (ui.arcadeOfflineTapHint || 'Tap to download and enable offline')
                );
                const offlineSwitchLabel = downloading
                    ? (ui.arcadeOfflineDownloading || '…')
                    : (ui.arcadeOfflineToggle || 'Offline');
                /* Stack on mobile (info row, then actions row aligned to the right) so the
                 * "Jugar" button + offline switch never overlap the title/badge/description.
                 * On md+ the layout collapses back to a single horizontal row. */
                return `
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-white dark:bg-slate-800 border ${this.wateringTargetId ? 'border-blue-200 dark:border-blue-900/30' : 'border-slate-200 dark:border-slate-700'} rounded-2xl hover:shadow-md transition-shadow group mb-3">
                    <div class="flex items-start gap-4 min-w-0">
                        <div class="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-2xl flex items-center justify-center border border-orange-200 dark:border-orange-800 shrink-0">
                            ${gIcon}
                        </div>
                        <div class="min-w-0 flex-1">
                            <h4 class="font-bold text-slate-800 dark:text-white flex flex-wrap items-center gap-2 leading-tight">
                                <span class="break-words">${gName}</span>
                                ${g.isOfficial ? `<span class="arborito-pill arborito-pill--xs arborito-pill--blue shrink-0">${escHtml(ui.arcadeOfficialBadge)}</span>` : ''}
                            </h4>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">${gSub}</p>
                            <p class="arborito-eyebrow arborito-eyebrow--sm mt-0.5">${gRepo}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                        <label class="flex flex-col items-center gap-1 shrink-0 cursor-pointer">
                            <span class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide leading-none${downloading ? ' animate-pulse' : ''}">${escHtml(offlineSwitchLabel)}</span>
                            <button type="button" data-action="toggle-offline" data-id="${gIdAttr}" role="switch" aria-checked="${offlineOn ? 'true' : 'false'}" aria-label="${offlineTitle}" title="${offlineTitle}" ${downloading ? 'disabled aria-busy="true"' : ''}
                                class="arborito-switch${downloading ? ' opacity-50 pointer-events-none' : ''}"></button>
                        </label>
                        <button class="px-4 py-2 ${this.wateringTargetId ? 'arborito-cta-blue' : 'bg-slate-900 dark:bg-white hover:scale-105 text-white dark:text-slate-900'} text-xs font-bold rounded-xl shadow-lg transition-all active:scale-95" 
                                data-action="prepare" data-idx="${idx}" data-manual="${g.isManual}">
                            ${escHtml(this.wateringTargetId ? ui.arcadeWaterHere : ui.arcadePlay)}
                        </button>
                        ${g.isManual ? `
                        <button type="button" class="px-2 py-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors text-base" data-action="remove-game" data-id="${gIdAttr}" aria-label="${rmAria}">🗑️</button>
                        ` : ''}
                    </div>
                </div>
            `;
            }).join('');
        }
        
        html += `
        <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">${escHtml(ui.arcadeAdd)}</label>
            <div class="flex gap-2">
                <input id="inp-custom-game" type="text" placeholder="${escAttr(ui.arcadePlaceholder || '')}" class="arborito-input flex-1">
                <button data-action="add-custom" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl font-bold text-sm">
                    +
                </button>
            </div>
        </div>`;
        
        container.innerHTML = html;
    },




    renderGarden(container, ui) {
        const uiSafe = ui || store.ui || {};
        const memoryData = store.userStore.state.memory || {};
        const dueIds = [];
        const healthyIds = [];
        const now = Date.now();

        for (const [id, item] of Object.entries(memoryData)) {
            if (now >= item.dueDate) {
                dueIds.push(id);
            } else {
                healthyIds.push({ id, ...item });
            }
        }
        
        healthyIds.sort((a, b) => a.dueDate - b.dueDate);

        let html = renderVitalityBannerHtml(store, uiSafe, { compact: false });

        html += `
        <details class="garden-howto mb-4">
            <summary class="garden-howto__head">${escHtml(uiSafe.gardenHowtoTitle || '¿Cómo funciona el jardín?')}</summary>
            <ul class="garden-howto__list">
                <li>${escHtml(uiSafe.gardenHowtoXp || 'Cada lección o repaso suma lúmenes (☀️).')}</li>
                <li>${escHtml(uiSafe.gardenHowtoSeeds || 'Cada módulo que tocás se planta como una semilla en tu parcela.')}</li>
                <li>${escHtml(uiSafe.gardenHowtoCare || 'Si no repasás, la semilla se marchita 🍂. Repasar la sana de nuevo.')}</li>
                <li>${escHtml(uiSafe.gardenHowtoShop || 'Con lúmenes comprás decoraciones (mariposas, setas, faroles) que aparecen detrás del árbol.')}</li>
            </ul>
        </details>`;

        html += `
        <div class="mb-4">
            <h4 class="arborito-eyebrow arborito-eyebrow--md mb-2">${escHtml(uiSafe.gardenPlotTitle || uiSafe.gardenTitle || 'Mi parcela')}</h4>
            ${renderGardenPlotHtml(store, uiSafe)}
        </div>`;

        const g = store.userStore.state.gamification;
        const publicTree = !!(store.getActivePublicTreeRef?.());
        /* Tree neighbours sit above the cosmetic Shop: community surfaces first, the
         * decorative shop stays below. The section only renders when there is an
         * active public tree. */
        if (publicTree) {
            const consentOk = hasNetworkSocialConsent(store);
            const rankingOn = consentOk && !!g.rankingOptIn;
            const joinBtn = consentOk
                ? `<button type="button" class="garden-ranking__join js-garden-ranking-toggle${rankingOn ? ' garden-ranking__join--on' : ''}" aria-pressed="${rankingOn ? 'true' : 'false'}">
                        ${escHtml(rankingOn ? (uiSafe.gardenRankingLeave || 'Salir') : (uiSafe.gardenRankingJoin || 'Participar'))}
                    </button>`
                : '';
            html += `
            <section class="garden-ranking" id="garden-ranking-section" aria-labelledby="garden-ranking-heading">
                <div class="garden-ranking__head">
                    <h4 id="garden-ranking-heading" class="garden-ranking__title">${escHtml(uiSafe.gardenRankingTitle || 'Vecinos del árbol')}</h4>
                    ${joinBtn}
                </div>
                <p class="garden-ranking__note">${escHtml(
                    !consentOk
                        ? (uiSafe.gardenRankingNeedConsent || uiSafe.gardenRankingOptInHint || '')
                        : rankingOn
                          ? (uiSafe.gardenRankingNote || '')
                          : (uiSafe.gardenRankingOptOutHint || uiSafe.gardenRankingOptInHint || '')
                )}</p>
                <div id="garden-ranking-body">${escHtml(uiSafe.loading || '…')}</div>
            </section>`;
        }

        html += renderGardenShopHtml(store, uiSafe);

        if (dueIds.length === 0 && healthyIds.length === 0) {
            html += `
            <div class="arborito-empty arborito-empty--card mx-auto max-w-md p-12">
                <div class="arborito-empty__icon">🪴</div>
                <p class="arborito-empty__title text-lg">${escHtml(uiSafe.arcadeGardenEmptyTitle || 'Jardín vacío')}</p>
                <p class="arborito-empty__body max-w-xs">${escHtml(uiSafe.arcadeGardenEmptyDesc || '')}</p>
            </div>`;
        } else {
            if (dueIds.length > 0) {
                html += `
                <div class="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100 dark:border-red-900/30 mb-4 flex items-center gap-3">
                    <span class="text-2xl">🍂</span>
                    <p class="text-xs text-red-800 dark:text-red-300 font-medium">${escHtml(uiSafe.arcadeWitheredMsg || '')}</p>
                </div>
                <div class="space-y-2 mb-6">
                    ${dueIds.map(id => {
                        const node = store.findNode(id);
                        const mem = memoryData[id];
                        const daysOverdue = Math.ceil((now - mem.dueDate) / (1000 * 60 * 60 * 24));
                        const nameRaw = node
                            ? node.name
                            : (uiSafe.arcadeMemoryUnknownModule || 'Lección {shortId}').replace('{shortId}', `${id.substring(0, 8)}…`);
                        const name = escHtml(nameRaw);
                        const icon = escHtml(node ? (node.icon || '📄') : '📄');
                        const daysText = escHtml((uiSafe.arcadeWitheredDays || '{days} días').replace('{days}', String(daysOverdue)));
                        
                        return `
                        <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/30 rounded-xl group hover:border-red-400 transition-colors">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center text-xl">
                                    ${icon}
                                </div>
                                <div class="min-w-0">
                                    <h4 class="font-bold text-sm text-slate-800 dark:text-white truncate">${name}</h4>
                                    <p class="text-[10px] text-red-500 font-bold">${daysText}</p>
                                </div>
                            </div>
                            <button data-action="water-node" data-id="${escAttr(id)}" class="arborito-cta-blue px-4 py-2 text-xs font-bold rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                                <span>💧</span> ${escHtml(uiSafe.arcadeWaterBtn || 'Regar')}
                            </button>
                        </div>`;
                    }).join('')}
                </div>`;
            } else {
                html += `
                <div class="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-900/30 mb-6 flex items-center gap-3">
                    <span class="text-2xl">🌻</span>
                    <div>
                        <p class="text-sm font-black text-green-700 dark:text-green-300">${escHtml(uiSafe.arcadeHealthyTitle || '')}</p>
                        <p class="text-xs text-green-600 dark:text-green-400">${escHtml(uiSafe.arcadeHealthyMsg || '')}</p>
                    </div>
                </div>`;
            }

            if (healthyIds.length > 0) {
                html += `<h4 class="arborito-eyebrow arborito-eyebrow--md mb-3">${escHtml(uiSafe.arcadeThrivingTitle || '')} (${healthyIds.length})</h4>`;
                html += `<div class="space-y-2 opacity-80">
                    ${healthyIds.map(item => {
                        const node = store.findNode(item.id);
                        const daysLeft = Math.ceil((item.dueDate - now) / (1000 * 60 * 60 * 24));
                        const nameRaw = node
                            ? node.name
                            : (uiSafe.arcadeMemoryUnknownModule || 'Lección {shortId}').replace('{shortId}', `${item.id.substring(0, 8)}…`);
                        const name = escHtml(nameRaw);
                        const icon = escHtml(node ? (node.icon || '📄') : '📄');
                        const rainText = escHtml((uiSafe.arcadeNextRain || '{days} días').replace('{days}', String(daysLeft)));

                        // Strength indicator based on interval
                        let strength = uiSafe.arcadeStageSprout || '';
                        if (item.interval > 30) strength = uiSafe.arcadeStageTree || strength;
                        else if (item.interval > 14) strength = uiSafe.arcadeStageBush || strength;
                        else if (item.interval > 7) strength = uiSafe.arcadeStagePlant || strength;

                        return `
                        <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 flex items-center justify-center text-lg">
                                    ${icon}
                                </div>
                                <div class="min-w-0">
                                    <h4 class="font-bold text-sm text-slate-700 dark:text-slate-300 truncate">${name}</h4>
                                    <p class="text-[10px] text-slate-400">${rainText}</p>
                                </div>
                            </div>
                            <span class="text-[9px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 font-medium">${escHtml(strength)}</span>
                        </div>`;
                    }).join('')}
                </div>`;
            }
        }
        
        container.innerHTML = html;

        if (publicTree) {
            void this.loadGardenRanking?.();
        }
    },

    async loadGardenRanking() {
        const slot = this.querySelector('#garden-ranking-body');
        if (!slot) return;
        const ui = store.ui || {};
        try {
            const data = await store.loadTreeRanking();
            if (!data) {
                slot.innerHTML = `<p class="garden-ranking__empty">${escHtml(ui.gardenRankingNeedTree || '')}</p>`;
                return;
            }
            slot.innerHTML = renderRankingHtml(data.rows, ui, data.weekKey);
        } catch {
            slot.innerHTML = `<p class="garden-ranking__empty">${escHtml(ui.gardenRankingError || '')}</p>`;
        }
    },



    renderStorage(container, ui) {
        const stats = store.storage.getStats();
        const usagePercent = stats.arcade.percent;
        const barColor = usagePercent > 90 ? 'bg-red-500' : (usagePercent > 70 ? 'bg-orange-500' : 'bg-purple-500');
        /* `usedFmt` is produced as KiB (bytes / 1024) by storage-manager.js.
           The denominator used to be a hard-coded literal "3.5 MB" (decimal) which
           (a) lied silently if MAX_GLOBAL_SIZE ever changed and (b) mixed bases
           with the numerator. Render the total in the same base so used/total
           are visually comparable and the percent bar matches the text. */
        const maxFmt = `${(stats.arcade.maxBytes / 1024).toFixed(1)} KB`;

        container.innerHTML = `
        <div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6">
            <div class="flex justify-between items-center mb-2">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">${escHtml(ui.arcadeStorageTotal)}</span>
                <span class="text-xs font-mono text-slate-500">${escHtml(stats.arcade.usedFmt)} / ${escHtml(maxFmt)}</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden mb-1">
                <div class="${barColor} h-2 rounded-full transition-all duration-500" style="width: ${usagePercent}%"></div>
            </div>
            ${usagePercent > 90 ? `<p class="text-[10px] text-red-500 font-bold mt-1 text-center">⚠️ ${escHtml(ui.arcadeStorageFull)}</p>` : ''}
        </div>
        
        <div class="flex justify-between items-center mb-3">
            <h3 class="arborito-eyebrow arborito-eyebrow--md">${escHtml(ui.arcadeSavedGames)}</h3>
            ${stats.arcade.games.length > 0 ? `<button data-action="delete-all-saves" class="text-[10px] text-red-500 hover:text-red-700 font-bold border border-red-200 dark:border-red-900/30 px-2 py-1 rounded bg-red-50 dark:bg-red-900/10">${escHtml(ui.arcadeDeleteAll)}</button>` : ''}
        </div>

        <div class="space-y-2">
            ${stats.arcade.games.length === 0 ? `<div class="arborito-empty p-8">${escHtml(ui.arcadeNoSavedGameData)}</div>` : 
              stats.arcade.games.map(g => `
                <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl group hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                    <div class="min-w-0 pr-4">
                        <h4 class="font-bold text-sm text-slate-800 dark:text-white truncate">${escHtml(g.id)}</h4>
                        <p class="text-[10px] text-slate-400 font-mono">${escHtml(g.sizeFmt)} • ${escHtml(ui.arcadeGameDataUpdated)} ${escHtml(new Date(g.updated).toLocaleDateString())}</p>
                    </div>
                    <button data-action="delete-save" data-id="${escAttr(String(g.id))}" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
                        ${escHtml(ui.graphDelete)}
                    </button>
                </div>
            `).join('')}
        </div>`;
    },



    renderSetupContent(container, ui) {
        if (this.isPreparingContext) {
             container.innerHTML = `
                <div class="flex-1 flex items-center justify-center">
                    <div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                </div>
             `;
             return;
        }

        const nodeList = this.getFlatNodes();
        const filteredNodes = nodeList.slice(0, 500);

        const filterVal = escAttr(this.filterText || '');
        const searchPh = escAttr(ui.searchPlaceholder || '');

        const selectedNode = this.selectedNodeId ? store.findNode(this.selectedNodeId) : null;
        const moduleReadiness = selectedNode ? getModuleStaticGameReadiness(selectedNode) : null;
        const isStatic = this.aiMode === 'static';
        const isDynamic = this.aiMode === 'dynamic';
        const staticBlocked =
            isStatic && moduleReadiness && moduleReadiness.totalLeaves > 0 && !moduleReadiness.staticReady;
        const staticReadyHint =
            isStatic && moduleReadiness && moduleReadiness.staticReady
                ? (ui.arcadeModuleStaticReady || '{n} lesson(s) with questionnaire ready for static play.').replace(
                      '{n}',
                      String(moduleReadiness.withCompleteQuiz)
                  )
                : '';
        const staticWarnHint = staticBlocked
            ? ui.arcadeModuleNoQuizWarn ||
              'No complete Quiz V2 in this module yet. Add questionnaires to lessons or use dynamic mode.'
            : '';

        container.innerHTML = `
        <div class="flex-1 flex flex-col min-h-0">
            <!-- AI Mode Selector -->
            <div class="mb-4">
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">${escHtml(ui.arcadeAiModeLabel || 'Game Mode')}</label>
                <div class="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <button data-action="set-ai-mode" data-mode="static"
                        class="flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${isStatic ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}">
                        <span class="mr-1">⚡</span>${escHtml(ui.arcadeAiModeStatic || 'Static')}
                    </button>
                    <button data-action="set-ai-mode" data-mode="dynamic"
                        class="flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${isDynamic ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}">
                        <span class="mr-1">🧠</span>${escHtml(ui.arcadeAiModeDynamic || 'Dynamic AI')}
                    </button>
                </div>
                <p class="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    ${isStatic
                        ? (ui.arcadeAiModeStaticDesc || 'Fast & private. Uses lesson questionnaires only — no AI required.')
                        : (ui.arcadeAiModeDynamicDesc || 'Optional on-device AI enhances content. Requires consent & download.')
                    }
                </p>
                ${staticReadyHint ? `<p class="text-[10px] text-emerald-700/90 dark:text-emerald-300/90 mt-2 p-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800/40 bg-emerald-50/70 dark:bg-emerald-950/25 leading-relaxed m-0">${escHtml(staticReadyHint)}</p>` : ''}
                ${staticWarnHint ? calloutHtml({ tone: 'rose', size: 'sm', inline: true, extraClass: 'mt-2 m-0', body: escHtml(staticWarnHint) }) : ''}
                ${isDynamic ? calloutHtml({ tone: 'amber', size: 'sm', inline: true, extraClass: 'mt-2 m-0', body: escHtml(ui.arcadeAiExperimentalDisclaimer || ui.sageExperimentalDisclaimer || '') }) : ''}
            </div>

            <label class="arborito-eyebrow block mb-2">${escHtml(ui.arcadeSelectModule)}</label>
            
            <div class="arborito-field-wrap mb-2">
                <span class="arborito-search-icon">🔍</span>
                <input id="inp-filter-context" type="text" placeholder="${searchPh}" 
                    class="arborito-input arborito-input--search font-bold"
                    value="${filterVal}" autocomplete="off">
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800 p-2 space-y-1">
                ${filteredNodes.map(n => {
                    const isSelected = this.selectedNodeId === n.id;
                    const isLeaf = n.type === 'leaf';
                    const isExam = n.type === 'exam';
                    
                    let icon = n.icon;
                    if (!icon) icon = isLeaf ? '📄' : (isExam ? '⚔️' : '📁');
                    const iconS = escHtml(icon);
                    
                    let typeBadge = `<span class="arborito-pill arborito-pill--xs arborito-pill--slate">${escHtml(ui.tagModule)}</span>`;
                    if (isLeaf) typeBadge = `<span class="arborito-pill arborito-pill--xs arborito-pill--purple">${escHtml(ui.tagLesson)}</span>`;
                    if (isExam) typeBadge = `<span class="arborito-pill arborito-pill--xs arborito-pill--red">${escHtml(ui.tagExam)}</span>`;

                    const nodeReadiness =
                        !isExam && (n.type === 'branch' || n.type === 'root' || n.type === 'leaf')
                            ? getModuleStaticGameReadiness(n)
                            : null;
                    const gameBadge =
                        isStatic && nodeReadiness && nodeReadiness.staticReady
                            ? `<span class="arborito-pill arborito-pill--xs arborito-pill--emerald shrink-0" title="${escAttr(ui.arcadeNodeGameReadyTooltip || 'Questionnaire ready for static games')}">🎮</span>`
                            : '';
                    
                    const indentClass = `pl-${Math.min(n.depth * 4, 12) + 3}`;
                    const isDisabled = isExam;
                    const actionClass = isDisabled 
                        ? 'opacity-40 cursor-not-allowed grayscale bg-slate-50 dark:bg-slate-900' 
                        : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer';
                    const activeClass = isSelected 
                        ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 ring-1 ring-orange-500' 
                        : '';
                    const nid = escAttr(String(n.id));

                    return `
                    <button class="w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors text-sm ${indentClass} ${actionClass} ${activeClass}"
                        ${!isDisabled ? `data-action="select-node" data-id="${nid}"` : 'disabled'}>
                        <span class="text-lg opacity-70">${iconS}</span>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <p class="font-bold truncate leading-tight">${escHtml(n.name)}</p>
                                ${typeBadge}
                                ${gameBadge}
                            </div>
                        </div>
                        ${isSelected ? '<span class="ml-auto text-orange-500 font-bold">✔</span>' : ''}
                    </button>`;
                }).join('')}
                
                ${filteredNodes.length === 0 ? `<div class="p-4 text-center text-xs text-slate-400">${escHtml(ui.arcadeNoMatchingContent)}</div>` : ''}
            </div>
        </div>

        <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button data-action="start-game" class="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black text-lg rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2" ${!this.selectedNodeId || staticBlocked ? 'disabled style="opacity:0.5"' : ''}>
                <span>🚀</span> ${escHtml(ui.arcadeStart)}
            </button>
            ${isDynamic ? `<p class="text-[10px] text-center text-slate-400 mt-2">${escHtml(ui.arcadeDisclaimer)}</p>` : ''}
        </div>`;
    }
};

/** Named exports for `arcade.js` — methods use component instance as `this`. */
export function renderSkeleton(ctx) {
    ArcadeUI.renderSkeleton.call(ctx);
}

export function renderGamesList(ctx, content, ui) {
    ArcadeUI.renderGamesList.call(ctx, content, ui);
}

export function renderGarden(ctx, content, ui) {
    ArcadeUI.renderGarden.call(ctx, content, ui);
}

export function renderStorage(content, ui) {
    ArcadeUI.renderStorage(content, ui);
}

export function renderSetupContent(ctx, content, ui) {
    ArcadeUI.renderSetupContent.call(ctx, content, ui);
}

export function loadGardenRanking(ctx) {
    return ArcadeUI.loadGardenRanking.call(ctx);
}
