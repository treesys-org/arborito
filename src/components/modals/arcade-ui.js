import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { DOCK_SHEET_BODY_WRAP, modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

export const ArcadeUI = {

    renderSkeleton() {
        const ui = store.ui;
        const isMobile = shouldShowMobileUI();
        const panelClass = isMobile
            ? 'arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full max-h-full rounded-none shadow-none w-full max-w-full relative overflow-hidden border-0 cursor-auto'
            : 'arborito-float-modal-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative border border-slate-200 dark:border-slate-800 cursor-auto';

        const mainHeaderClass = isMobile
            ? 'arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2'
            : 'arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 flex items-center gap-2';
        const contentClass = isMobile
            ? `${DOCK_SHEET_BODY_WRAP} overflow-y-auto custom-scrollbar`
            : 'flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 pt-3 flex flex-col min-h-0';

        const inner = `
                    <!-- Header (Setup Mode Only) -->
                    <div id="setup-header" class="hidden shrink-0"></div>

                    <!-- Header (Main Mode) — móvil: misma cabecera que búsqueda / Más -->
                    <div id="main-header" class="${mainHeaderClass}">
                        ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-close' })}
                        <span class="${isMobile ? 'text-2xl' : 'text-3xl'} shrink-0" aria-hidden="true">🎮</span>
                        <div class="flex-1 min-w-0">
                            <h2 class="arborito-mmenu-subtitle m-0 ${isMobile ? '' : 'leading-tight'}">${ui.arcadeTitle}</h2>
                            <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 ${isMobile ? 'font-medium' : 'font-semibold'}">${ui.arcadeDesc}</p>
                        </div>
                        ${modalWindowCloseXHtml(ui, 'btn-close')}
                    </div>

                    <!-- Tabs (Main Mode Only) -->
                    <div id="main-tabs" class="flex border-t border-b border-slate-200/90 dark:border-slate-800 bg-white/55 dark:bg-slate-950/90 shrink-0">
                        <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors border-transparent text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100" id="tab-games">
                            🎮 ${ui.arcadeFeatured}
                        </button>
                        <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors border-transparent text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100" id="tab-garden">
                            🍂 ${ui.arcadeTabCare}
                        </button>
                        <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors border-transparent text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100" id="tab-storage">
                            💾 ${ui.arcadeTabStorage}
                        </button>
                    </div>

                    <!-- Content Area -->
                    <div id="modal-content" class="${contentClass}">
                        <!-- Dynamic -->
                    </div>`;

        this.innerHTML = isMobile
            ? `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-stretch justify-start p-0 bg-slate-950 animate-in fade-in">
            <div id="modal-panel" class="${panelClass}">
                ${inner}
            </div>
        </div>`
            : `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950 animate-in arborito-modal-root">
            <div id="modal-panel" class="${panelClass}">
                <div class="arborito-float-modal-card__inner flex flex-col min-h-0 flex-1 relative">
                ${inner}
                </div>
            </div>
        </div>`;

        this.querySelector('#tab-games').onclick = () => { this.activeTab = 'games'; this.updateContent(); };
        this.querySelector('#tab-garden').onclick = () => { this.activeTab = 'garden'; this.updateContent(); };
        this.querySelector('#tab-storage').onclick = () => { this.activeTab = 'storage'; this.updateContent(); };
        
        // Delegate events
        this.addEventListener('click', (e) => this.handleDelegatedClick(e));
        this.addEventListener('input', (e) => {
            if(e.target.id === 'inp-filter-context') {
                this.filterText = e.target.value;
                this.updateContent();
            }
        });
    },


    renderGamesList(container, ui) {
        if (this.isLoading) {
            container.innerHTML = `<div class="p-12 text-center text-slate-400">${ui.loading}</div>`;
            return;
        }
        
        let html = '';
        
        // Watering Banner
        if (this.wateringTargetId) {
            const targetNode = store.findNode(this.wateringTargetId);
            const targetName = targetNode ? targetNode.name : ui.arcadeUnknownLesson;
            html += `
            <div class="bg-blue-600 text-white p-4 rounded-xl shadow-lg mb-4 flex items-center justify-center md:justify-between animate-in slide-in-from-top-2 flex-wrap gap-2">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-xl">💧</div>
                    <div>
                        <p class="text-[10px] uppercase font-bold opacity-80">${ui.arcadeWateringMission}</p>
                        <p class="font-bold text-sm">${ui.arcadeReviewTarget} <span class="underline">${targetName}</span></p>
                    </div>
                </div>
                <button data-action="cancel-watering" class="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">${ui.cancel}</button>
            </div>`;
        }

        const manualGames = store.userStore.state.installedGames.map(g => ({
            ...g, repoName: ui.arcadeManualInstall, isManual: true, path: g.url 
        }));
        const allGames = [...this.discoveredGames, ...manualGames];

        if (allGames.length === 0) {
            html += `<div class="p-8 text-center text-slate-400 italic">${ui.noResults}</div>`;
        } else {
            html += allGames.map((g, idx) => `
                <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border ${this.wateringTargetId ? 'border-blue-200 dark:border-blue-900/30' : 'border-slate-200 dark:border-slate-700'} rounded-2xl hover:shadow-md transition-shadow group mb-3">
                    <div class="flex items-center gap-4 min-w-0">
                        <div class="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-2xl flex items-center justify-center border border-orange-200 dark:border-orange-800">
                            ${g.icon || '🕹️'}
                        </div>
                        <div class="min-w-0">
                            <h4 class="font-bold text-slate-800 dark:text-white truncate flex items-center gap-2">
                                ${g.name}
                                ${g.isOfficial ? `<span class="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/45 dark:text-blue-300 px-1.5 py-0.5 rounded uppercase">${ui.arcadeOfficialBadge}</span>` : ''}
                            </h4>
                            <p class="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px] md:max-w-xs">${g.description || g.path}</p>
                            <p class="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wide">${g.repoName}</p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button class="px-4 py-2 ${this.wateringTargetId ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-900 dark:bg-white hover:scale-105 text-white dark:text-slate-900'} text-xs font-bold rounded-xl shadow-lg transition-all active:scale-95" 
                                data-action="prepare" data-idx="${idx}" data-manual="${g.isManual}">
                            ${this.wateringTargetId ? ui.arcadeWaterHere : ui.arcadePlay}
                        </button>
                        ${g.isManual ? `
                        <button type="button" class="px-2 py-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors text-base" data-action="remove-game" data-id="${g.id}" aria-label="${ui.arcadeRemoveGameAria}">🗑️</button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        }
        
        // Add Custom
        html += `
        <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">${ui.arcadeAdd}</label>
            <div class="flex gap-2">
                <input id="inp-custom-game" type="text" placeholder="${ui.arcadePlaceholder}" class="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-400">
                <button data-action="add-custom" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl font-bold text-sm">
                    +
                </button>
            </div>
        </div>`;
        
        container.innerHTML = html;
    },



    renderGarden(container, ui) {
        const memoryData = store.userStore.state.memory || {};
        const dueIds = [];
        const healthyIds = [];
        const now = Date.now();

        // Sort items into buckets
        for (const [id, item] of Object.entries(memoryData)) {
            if (now >= item.dueDate) {
                dueIds.push(id);
            } else {
                healthyIds.push({ id, ...item });
            }
        }
        
        // Sort healthy by next due date (soonest first)
        healthyIds.sort((a, b) => a.dueDate - b.dueDate);

        let html = '';

        if (dueIds.length === 0 && healthyIds.length === 0) {
            html += `
            <div class="p-12 text-center flex flex-col items-center">
                <div class="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-5xl mb-4">🪴</div>
                <h3 class="text-lg font-black text-slate-700 dark:text-white mb-2">${ui.arcadeGardenEmptyTitle}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 max-w-xs">${ui.arcadeGardenEmptyDesc}</p>
            </div>`;
        } else {
            // Withered Section
            if (dueIds.length > 0) {
                html += `
                <div class="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100 dark:border-red-900/30 mb-4 flex items-center gap-3">
                    <span class="text-2xl">🍂</span>
                    <p class="text-xs text-red-800 dark:text-red-300 font-medium">${ui.arcadeWitheredMsg}</p>
                </div>
                <div class="space-y-2 mb-6">
                    ${dueIds.map(id => {
                        const node = store.findNode(id);
                        const mem = memoryData[id];
                        const daysOverdue = Math.ceil((now - mem.dueDate) / (1000 * 60 * 60 * 24));
                        const name = node
                            ? node.name
                            : ui.arcadeMemoryUnknownModule.replace('{shortId}', `${id.substring(0, 8)}…`);
                        const icon = node ? (node.icon || '📄') : '📄';
                        const daysText = ui.arcadeWitheredDays.replace('{days}', daysOverdue);
                        
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
                            <button data-action="water-node" data-id="${id}" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                                <span>💧</span> ${ui.arcadeWaterBtn}
                            </button>
                        </div>`;
                    }).join('')}
                </div>`;
            } else {
                html += `
                <div class="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-900/30 mb-6 flex items-center gap-3">
                    <span class="text-2xl">🌻</span>
                    <div>
                        <p class="text-sm font-black text-green-700 dark:text-green-300">${ui.arcadeHealthyTitle}</p>
                        <p class="text-xs text-green-600 dark:text-green-400">${ui.arcadeHealthyMsg}</p>
                    </div>
                </div>`;
            }

            // Thriving Section
            if (healthyIds.length > 0) {
                html += `<h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">${ui.arcadeThrivingTitle} (${healthyIds.length})</h4>`;
                html += `<div class="space-y-2 opacity-80">
                    ${healthyIds.map(item => {
                        const node = store.findNode(item.id);
                        const daysLeft = Math.ceil((item.dueDate - now) / (1000 * 60 * 60 * 24));
                        const name = node
                            ? node.name
                            : ui.arcadeMemoryUnknownModule.replace('{shortId}', `${item.id.substring(0, 8)}…`);
                        const icon = node ? (node.icon || '📄') : '📄';
                        const rainText = ui.arcadeNextRain.replace('{days}', daysLeft);

                        // Strength indicator based on interval
                        let strength = ui.arcadeStageSprout;
                        if (item.interval > 30) strength = ui.arcadeStageTree;
                        else if (item.interval > 14) strength = ui.arcadeStageBush;
                        else if (item.interval > 7) strength = ui.arcadeStagePlant;

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
                            <span class="text-[9px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 font-medium">${strength}</span>
                        </div>`;
                    }).join('')}
                </div>`;
            }
        }
        
        container.innerHTML = html;
    },



    renderStorage(container, ui) {
        const stats = store.storage.getStats();
        const usagePercent = stats.arcade.percent;
        const barColor = usagePercent > 90 ? 'bg-red-500' : (usagePercent > 70 ? 'bg-orange-500' : 'bg-purple-500');
        
        container.innerHTML = `
        <div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6">
            <div class="flex justify-between items-center mb-2">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">${ui.arcadeStorageTotal}</span>
                <span class="text-xs font-mono text-slate-500">${stats.arcade.usedFmt} / 3.5 MB</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden mb-1">
                <div class="${barColor} h-2 rounded-full transition-all duration-500" style="width: ${usagePercent}%"></div>
            </div>
            ${usagePercent > 90 ? `<p class="text-[10px] text-red-500 font-bold mt-1 text-center">⚠️ ${ui.arcadeStorageFull}</p>` : ''}
        </div>
        
        <div class="flex justify-between items-center mb-3">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">${ui.arcadeSavedGames}</h3>
            ${stats.arcade.games.length > 0 ? `<button data-action="delete-all-saves" class="text-[10px] text-red-500 hover:text-red-700 font-bold border border-red-200 dark:border-red-900/30 px-2 py-1 rounded bg-red-50 dark:bg-red-900/10">${ui.arcadeDeleteAll}</button>` : ''}
        </div>

        <div class="space-y-2">
            ${stats.arcade.games.length === 0 ? `<div class="p-8 text-center text-slate-400 italic text-sm">${ui.arcadeNoSavedGameData}</div>` : 
              stats.arcade.games.map(g => `
                <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl group hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                    <div class="min-w-0 pr-4">
                        <h4 class="font-bold text-sm text-slate-800 dark:text-white truncate">${g.id}</h4>
                        <p class="text-[10px] text-slate-400 font-mono">${g.sizeFmt} • ${ui.arcadeGameDataUpdated} ${new Date(g.updated).toLocaleDateString()}</p>
                    </div>
                    <button data-action="delete-save" data-id="${g.id}" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
                        ${ui.graphDelete}
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

        container.innerHTML = `
        <div class="flex-1 flex flex-col min-h-0">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">${ui.arcadeSelectModule}</label>
            
            <div class="relative mb-2">
                <span class="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
                <input id="inp-filter-context" type="text" placeholder="${ui.searchPlaceholder}" 
                    class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl py-2 pl-9 pr-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-400"
                    value="${this.filterText}" autocomplete="off">
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800 p-2 space-y-1">
                ${filteredNodes.map(n => {
                    const isSelected = this.selectedNodeId === n.id;
                    const isLeaf = n.type === 'leaf';
                    const isExam = n.type === 'exam';
                    
                    let icon = n.icon;
                    if (!icon) icon = isLeaf ? '📄' : (isExam ? '⚔️' : '📁');
                    
                    let typeBadge = `<span class="text-[9px] bg-slate-200 text-slate-600 px-1.5 rounded uppercase font-bold tracking-wider">${ui.tagModule}</span>`;
                    if (isLeaf) typeBadge = `<span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 rounded uppercase font-bold tracking-wider">${ui.tagLesson}</span>`;
                    if (isExam) typeBadge = `<span class="text-[9px] bg-red-100 text-red-700 px-1.5 rounded uppercase font-bold tracking-wider">${ui.tagExam}</span>`;
                    
                    const indentClass = `pl-${Math.min(n.depth * 4, 12) + 3}`;
                    const isDisabled = isExam;
                    const actionClass = isDisabled 
                        ? 'opacity-40 cursor-not-allowed grayscale bg-slate-50 dark:bg-slate-900' 
                        : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer';
                    const activeClass = isSelected 
                        ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 ring-1 ring-orange-500' 
                        : '';

                    return `
                    <button class="w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors text-sm ${indentClass} ${actionClass} ${activeClass}"
                        ${!isDisabled ? `data-action="select-node" data-id="${n.id}"` : 'disabled'}>
                        <span class="text-lg opacity-70">${icon}</span>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <p class="font-bold truncate leading-tight">${n.name}</p>
                                ${typeBadge}
                            </div>
                        </div>
                        ${isSelected ? '<span class="ml-auto text-orange-500 font-bold">✔</span>' : ''}
                    </button>`;
                }).join('')}
                
                ${filteredNodes.length === 0 ? `<div class="p-4 text-center text-xs text-slate-400">${ui.arcadeNoMatchingContent}</div>` : ''}
            </div>
        </div>

        <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button data-action="start-game" class="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black text-lg rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2" ${!this.selectedNodeId ? 'disabled style="opacity:0.5"' : ''}>
                <span>🚀</span> ${ui.arcadeStart}
            </button>
            <p class="text-[10px] text-center text-slate-400 mt-2">${ui.arcadeDisclaimer}</p>
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
