
import { store } from '../../store.js';
import { handleSwitch, plantNewTree, importTreeFromFile, loadLocalTree, exportLocalTree, shareActiveTree } from './sources-logic.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalSources extends HTMLElement {
    constructor() {
        super();
        this.activeTab = 'global'; // 'global' | 'local'
        this.selectedVersionUrl = null;
        this.overlay = null; // 'plant' | 'delete' | 'import'
        this.targetId = null; // ID for delete
        this.isInitialized = false;
    }

    connectedCallback() {
        // Initial Render of the Skeleton
        if (!this.isInitialized) {
            this.renderSkeleton();
            this.isInitialized = true;
        }
        
        // Initial Content Load
        this.updateContent();
        
        // Bind to store
        this.storeListener = () => this.updateContent();
        store.addEventListener('state-change', this.storeListener);
    }
    
    disconnectedCallback() {
        store.removeEventListener('state-change', this.storeListener);
    }

    /** @param {{ returnToMore?: boolean }} [opts] — false tras cargar árbol / plantar / importar (no volver al sheet Más). */
    close(opts = {}) {
        if (this.hasAttribute('embed')) {
            if (opts.returnToMore === false) {
                document.querySelector('arborito-sidebar')?.closeMobileMenuIfOpen?.();
            }
            return;
        }
        store.dismissModal({ returnToMore: opts.returnToMore !== false });
    }

    // --- RENDER SKELETON (Run Once) ---
    renderSkeleton() {
        const ui = store.ui;
        const embedded = this.hasAttribute('embed');

        const icTabGlobal = `<span class="text-lg leading-none shrink-0" aria-hidden="true">🌍</span>`;
        const icTabLocal = `<span class="text-lg leading-none shrink-0" aria-hidden="true">🌱</span>`;

        const mobSources = shouldShowMobileUI();
        const heroRow = embedded
            ? ''
            : mobSources
              ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <div class="min-w-0 flex-1">
                        <h2 class="arborito-mmenu-subtitle m-0">${ui.sourceManagerTitle}</h2>
                        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">${ui.sourceManagerDesc}</p>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`
              : `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <div class="min-w-0 flex-1">
                        <h2 class="arborito-mmenu-subtitle m-0">${ui.sourceManagerTitle}</h2>
                        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">${ui.sourceManagerDesc}</p>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`;

        const tabRow = `
                <div class="px-4 pt-3 pb-2 border-t border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
                    <div class="flex rounded-xl overflow-hidden p-1 gap-1">
                        <button type="button" class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2" id="tab-global">
                            ${icTabGlobal}
                            <span>${ui.tabGlobal || 'Global Forest'}</span>
                        </button>
                        <button type="button" class="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2" id="tab-local">
                            ${icTabLocal}
                            <span>${ui.tabGarden || 'My Garden'}</span>
                        </button>
                    </div>
                </div>`;

        const shellStyle = embedded ? 'height:100%;max-height:100%;min-height:0;' : '';
        const shellClass = embedded
            ? 'arborito-sources-modal-shell arborito-sources-modal-shell--embed bg-white dark:bg-slate-900 w-full relative flex flex-col min-h-0 flex-1 border-0 shadow-none cursor-auto isolation isolate overflow-hidden'
            : mobSources
              ? 'arborito-sources-modal-shell bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-5xl w-full relative flex flex-col min-h-0 border border-slate-200 dark:border-slate-800 cursor-auto isolation isolate'
              : 'arborito-sources-modal-shell arborito-float-modal-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto isolation isolate';

        const inner = `
            <div class="${shellClass}" style="${shellStyle || undefined}">
                ${heroRow}
                ${tabRow}

                <div id="tab-content" class="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 pt-3 min-h-0 pr-1 relative z-0">
                </div>
                <div id="overlay-container" class="absolute inset-0 z-[200] hidden pointer-events-none"></div>
            </div>`;

        this.innerHTML = embedded
            ? `<div class="arborito-sources-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden">${inner}</div>`
            : `<div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in arborito-modal-root">${inner}</div>`;

        // Static Event Binding (Delegation)
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        
        this.querySelector('#tab-global').onclick = () => { this.activeTab = 'global'; this.updateContent(); };
        this.querySelector('#tab-local').onclick = () => { this.activeTab = 'local'; this.updateContent(); };
        
        // Delegate Clicks for dynamic content
        this.addEventListener('click', (e) => this.handleDelegatedClick(e));
        this.addEventListener('change', (e) => this.handleDelegatedChange(e));
    }

    // --- DYNAMIC CONTENT UPDATE ---
    updateContent() {
        if (!this.isInitialized) return;

        const ui = store.ui;
        const state = store.value;
        const activeSource = state.activeSource || { name: 'Unknown', url: '' };
        
        // 1. Update Tabs Visuals
        const tabGlobal = this.querySelector('#tab-global');
        const tabLocal = this.querySelector('#tab-local');
        
        const tabBase = 'flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2';
        if (this.activeTab === 'global') {
            tabGlobal.className = `${tabBase} bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm`;
            tabLocal.className = `${tabBase} text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50`;
        } else {
            tabGlobal.className = `${tabBase} text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50`;
            tabLocal.className = `${tabBase} bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm`;
        }

        // 2. Render Overlay (if any)
        this.renderOverlay(ui);

        // 3. Render Tab Content
        const container = this.querySelector('#tab-content');
        if (this.activeTab === 'global') {
            container.innerHTML = this.getGlobalContent(ui, state, activeSource);
        } else {
            container.innerHTML = this.getLocalContent(ui, state, activeSource);
        }
    }

    renderOverlay(ui) {
        const container = this.querySelector('#overlay-container');
        if (!this.overlay) {
            container.className = 'absolute inset-0 z-[200] hidden pointer-events-none';
            container.innerHTML = '';
            return;
        }
        
        container.classList.remove('hidden');
        container.className = "absolute inset-0 bg-white/95 dark:bg-slate-900/95 flex items-center justify-center z-[200] animate-in fade-in rounded-3xl pointer-events-auto";
        
        if (this.overlay === 'plant') {
            container.innerHTML = `
                <div class="w-full max-w-xs text-center">
                    <h3 class="text-xl font-black mb-4 dark:text-white">${ui.plantTree}</h3>
                    <input id="inp-new-tree-name" type="text" placeholder="${ui.treeNamePlaceholder || "Name your tree..."}" class="w-full bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-4 text-base font-bold mb-4 focus:ring-2 focus:ring-green-500 outline-none dark:text-white" autofocus>
                    <div class="flex gap-3">
                        <button data-action="cancel-overlay" class="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase">${ui.cancel}</button>
                        <button data-action="confirm-plant" class="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg hover:scale-105 transition-transform">${ui.sourceAdd}</button>
                    </div>
                </div>`;
            // Autofocus
            setTimeout(() => {
                const inp = container.querySelector('input');
                if(inp) inp.focus();
            }, 50);
        } else if (this.overlay === 'delete') {
            container.innerHTML = `
                <div class="w-full max-w-xs text-center">
                    <div class="text-4xl mb-4">⚠️</div>
                    <h3 class="text-xl font-black mb-2 dark:text-white">${ui.deleteTreeConfirm}</h3>
                    <div class="flex gap-3">
                        <button data-action="cancel-overlay" class="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase">${ui.cancel}</button>
                        <button data-action="confirm-delete" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg hover:scale-105 transition-transform">${ui.sourceRemove}</button>
                    </div>
                </div>`;
        }
    }

    getGlobalContent(ui, state, activeSource) {
        const isLocalActive = activeSource.type === 'local' || (activeSource.url && activeSource.url.startsWith('local://'));
        const releases = state.availableReleases || [];
        const normalize = (u) => { try { return new URL(u, window.location.href).href; } catch(e) { return u; } };
        const activeUrl = normalize(activeSource.url);
        
        const effectiveReleases = releases.length > 0 ? releases : [{
            id: 'current-unknown',
            name: 'Current Version',
            url: activeSource.url,
            type: 'manual'
        }];
        const selectedUrl = this.selectedVersionUrl || activeSource.url;
        const isDifferent = normalize(selectedUrl) !== activeUrl;
        const otherSources = (state.communitySources || []).filter(s => s.id !== activeSource.id);

        return `
            <div class="pt-2">
                <!-- ACTIVE TREE CARD - Enforce Bottom Margin to prevent Overlap -->
                ${!isLocalActive ? `
                <div class="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border-2 border-purple-500/30 relative shadow-sm mb-8 block">
                    <div class="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-widest shadow-sm">
                        ${ui.sourceActive}
                    </div>
                    <h3 class="font-black text-xl text-slate-800 dark:text-white mb-1 flex items-center gap-2">
                        <span>🌳</span> ${activeSource.name}
                    </h3>
                    <p class="text-xs text-slate-400 font-mono truncate mb-6 opacity-70 border-b border-slate-200 dark:border-slate-800 pb-4">${activeSource.url}</p>
                    
                    <div class="flex gap-3 items-end">
                        <div class="flex-1 min-w-0 arborito-sources-version-wrap relative z-[120]">
                            <label class="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">${ui.releasesSnapshot || "Version"}</label>
                            <div class="relative z-10">
                                <select id="version-select" 
                                    class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 appearance-none transition-shadow hover:shadow-sm cursor-pointer pr-10"
                                    style="-webkit-appearance: none; -moz-appearance: none; appearance: none;">
                                    ${effectiveReleases.map(r => `
                                        <option value="${r.url}" ${normalize(r.url) === normalize(selectedUrl) ? 'selected' : ''}>
                                            ${r.type === 'rolling' ? '🌊 ' : (r.type === 'archive' ? '🏛️ ' : '📄 ')} 
                                            ${r.name || r.year || 'Unknown Version'}
                                        </option>
                                    `).join('')}
                                </select>
                                <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400 text-sm leading-none" aria-hidden="true">▼</div>
                            </div>
                        </div>
                        ${isDifferent ? `
                        <button data-action="switch-version" class="bg-purple-600 hover:bg-purple-500 text-white px-5 py-3.5 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-all animate-in fade-in slide-in-from-right-2">
                            ${ui.releasesSwitch || 'Switch'}
                        </button>
                        ` : `
                        <button data-action="share-tree" class="bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 px-4 py-3.5 rounded-xl font-bold text-lg border border-slate-200 dark:border-slate-700 transition-colors shadow-sm" title="Copy Share Link">
                           🔗
                        </button>
                        `}
                    </div>
                </div>
                ` : `
                <div class="p-6 bg-purple-50 dark:bg-purple-900/10 rounded-2xl border border-purple-100 dark:border-purple-800 text-center flex flex-col items-center gap-3 mb-8 block">
                    <span class="text-4xl">🌱</span>
                    <p class="text-sm text-purple-700 dark:text-purple-300 font-bold">You are currently tending your local garden.</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Select a tree below to return to the global forest.</p>
                </div>
                `}

                <!-- SAVED TREES LIST -->
                <div class="block">
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span>📡</span> Community Trees
                    </h3>
                    
                    ${isLocalActive ? `
                    <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl group hover:border-purple-300 dark:hover:border-purple-600 transition-colors mb-3 cursor-pointer shadow-sm" data-action="load-default">
                        <div class="flex items-center gap-4 overflow-hidden pointer-events-none">
                            <div class="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center text-xl">🌳</div>
                            <div class="min-w-0">
                                <h4 class="font-bold text-sm text-slate-700 dark:text-slate-200 truncate">Official Arborito Library</h4>
                                <p class="text-[10px] text-slate-400 truncate">Default Repository</p>
                            </div>
                        </div>
                        <button class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors pointer-events-none">${ui.sourceLoad}</button>
                    </div>
                    ` : ''}

                    ${otherSources.length === 0 
                        ? `<div class="p-8 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-center text-slate-400 text-sm">No other trees added.</div>`
                        : `<div class="space-y-3">
                            ${otherSources.map(s => `
                                <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl group hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm">
                                    <div class="flex items-center gap-4 overflow-hidden">
                                        <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl">🌐</div>
                                        <div class="min-w-0">
                                            <h4 class="font-bold text-sm text-slate-700 dark:text-slate-200 truncate">${s.name}</h4>
                                            <p class="text-[10px] text-slate-400 truncate font-mono">${s.url}</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-2">
                                        <button data-action="load-source" data-id="${s.id}" class="px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-green-50 dark:hover:bg-green-900/30 text-slate-600 dark:text-green-400 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors hover:border-green-300">${ui.sourceLoad}</button>
                                        <button type="button" data-action="remove-source" data-id="${s.id}" class="w-9 h-9 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded-xl transition-colors text-sm" aria-label="${ui.sourceRemove || 'Remove'}">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                           </div>`
                    }
                </div>

                <!-- ADD NEW -->
                <div class="pt-6 border-t border-slate-100 dark:border-slate-800 mt-4">
                    <label class="text-[10px] font-bold text-slate-400 uppercase mb-3 block">${ui.sourcesAddByUrlLabel}</label>
                    <div class="flex gap-3">
                        <input id="inp-source-url" type="text" placeholder="${ui.sourceUrlPlaceholder || 'https://.../data/data.json'}" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white font-mono">
                        <button data-action="add-source" class="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2 rounded-xl font-bold shadow-lg hover:opacity-90 active:scale-95 transition-transform text-lg">+</button>
                    </div>
                </div>
            </div>`;
    }

    getLocalContent(ui, state, activeSource) {
        const localTrees = store.userStore.state.localTrees || [];
        return `
            <div class="flex flex-col h-full pt-4">
                <!-- Action Buttons -->
                <div class="grid grid-cols-1 gap-4 mb-8">
                    <button data-action="show-plant" class="py-6 px-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 font-bold rounded-2xl active:scale-95 transition-all flex flex-col items-center gap-2 group shadow-sm hover:shadow-md">
                        <span class="text-4xl group-hover:-translate-y-1 transition-transform pointer-events-none">🌱</span> 
                        <span class="text-sm uppercase tracking-wide pointer-events-none font-black">${ui.plantTree || 'Plant New Tree'}</span>
                        <span class="text-[10px] opacity-70 pointer-events-none font-normal">${ui.plantTreeDesc || "Start fresh"}</span>
                    </button>
                </div>
                
                <button data-action="import-tree" class="w-full py-4 px-4 mb-8 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-3 group hover:border-sky-500 hover:text-sky-500 dark:hover:border-sky-400 dark:hover:text-sky-400">
                    <span class="text-2xl pointer-events-none group-hover:scale-110 transition-transform">📥</span> 
                    <span class="text-sm pointer-events-none uppercase tracking-wider">${ui.importBtn || 'Import Tree'} (.arborito / .json)</span>
                </button>

                <!-- Local Trees List -->
                <div class="flex-1 space-y-4 pb-4">
                    ${localTrees.length === 0 
                        ? `<div class="text-center p-12 text-slate-400 italic text-sm border-2 border-slate-100 dark:border-slate-800 rounded-2xl border-dashed">Your garden is empty. Plant your first tree!</div>` 
                        : localTrees.map(t => {
                            const isActive = activeSource.id === t.id;
                            return `
                            <div class="bg-white dark:bg-slate-900 border ${isActive ? 'border-green-500 ring-1 ring-green-500 shadow-md' : 'border-slate-200 dark:border-slate-700'} rounded-2xl p-5 flex items-center justify-between group hover:border-green-300 dark:hover:border-green-700 transition-all">
                                <div class="flex items-center gap-5 min-w-0">
                                    <div class="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-2xl shadow-sm">🌳</div>
                                    <div class="min-w-0">
                                        <h4 class="font-bold text-slate-800 dark:text-white truncate text-base">${t.name}</h4>
                                        <p class="text-xs text-slate-400 font-mono mt-0.5">Updated: ${new Date(t.updated).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div class="flex gap-2 shrink-0 items-center">
                                    <button data-action="export-local" data-id="${t.id}" data-name="${t.name}" class="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-600 dark:text-blue-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-2 hover:border-blue-300" title="${ui.sourceExport}">
                                        <span>📤</span>
                                    </button>
                                    
                                    ${isActive 
                                        ? `<span class="px-4 py-2 bg-green-100 text-green-700 text-xs font-black rounded-xl border border-green-200 cursor-default uppercase tracking-wider">${ui.sourceActive}</span>`
                                        : `<button data-action="load-local" data-id="${t.id}" data-name="${t.name}" class="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow hover:opacity-90 transition-opacity uppercase tracking-wider">${ui.sourceLoad}</button>`
                                    }
                                    
                                    <button type="button" data-action="show-delete" data-id="${t.id}" class="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors ml-1 text-sm" title="${ui.sourceRemove}" aria-label="${ui.sourceRemove}">🗑️</button>
                                </div>
                            </div>
                            `;
                        }).join('')
                    }
                </div>
            </div>`;
    }

    // --- EVENT HANDLERS ---
    handleDelegatedChange(e) {
        if (e.target.id === 'version-select') {
            this.selectedVersionUrl = e.target.value;
            this.updateContent();
        }
    }

    async handleDelegatedClick(e) {
        const btn = e.target.closest('button') || e.target.closest('.cursor-pointer');
        if (!btn) return;
        
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const name = btn.dataset.name;

        // Overlay Actions
        if (action === 'cancel-overlay') { this.overlay = null; this.targetId = null; this.updateContent(); }
        if (action === 'show-plant') { this.overlay = 'plant'; this.updateContent(); }
        if (action === 'show-delete') { this.overlay = 'delete'; this.targetId = id; this.updateContent(); }
        
        if (action === 'confirm-plant') {
            const inp = this.querySelector('#inp-new-tree-name');
            if (inp && inp.value.trim()) plantNewTree(this, inp.value.trim());
        }
        
        if (action === 'confirm-delete') {
            if (this.targetId) {
                store.userStore.deleteLocalTree(this.targetId);
                this.overlay = null;
                this.targetId = null;
                this.updateContent();
            }
        }

        // Global Actions
        if (action === 'switch-version') handleSwitch(this);
        if (action === 'share-tree') shareActiveTree();
        if (action === 'load-default') {
            store.sourceManager.getDefaultSource().then(s => {
                store.loadData(s);
                this.close({ returnToMore: false });
            });
        }
        if (action === 'load-source') {
            store.loadAndSmartMerge(id);
            this.close({ returnToMore: false });
        }
        if (action === 'remove-source') {
            const ui = store.ui;
            if (await store.confirm(ui.sourcesDeleteTreeLinkConfirm || 'Delete this tree link?')) {
                store.removeCommunitySource(id);
                this.updateContent();
            }
        }
        if (action === 'add-source') {
            const url = this.querySelector('#inp-source-url').value.trim();
            if (url) store.requestAddCommunitySource(url);
        }

        // Local Actions
        if (action === 'import-tree') importTreeFromFile(this);
        if (action === 'load-local') loadLocalTree(this, id, name);
        if (action === 'export-local') {
            const ui = store.ui;
            // Immediate feedback logic
            const originalContent = btn.innerHTML;
            btn.innerHTML = `<span class="animate-spin text-lg">⏳</span> ${ui.sourcesPacking || 'Packing…'}`;
            btn.disabled = true;
            btn.classList.add('opacity-75', 'cursor-not-allowed');
            
            // Defer execution to allow UI repaint
            setTimeout(() => {
                try {
                    exportLocalTree(id, name);
                } catch(err) {
                    console.error(err);
                    store.notify(ui.sourcesExportFailed || 'Export failed.', true);
                } finally {
                    btn.innerHTML = originalContent;
                    btn.disabled = false;
                    btn.classList.remove('opacity-75', 'cursor-not-allowed');
                }
            }, 50);
        }
    }
}
customElements.define('arborito-modal-sources', ArboritoModalSources);
