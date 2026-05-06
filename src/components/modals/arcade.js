import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { renderSkeleton, renderGamesList, renderGarden, renderStorage, renderSetupContent } from './arcade-ui.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { escHtml } from '../graph/graph-mobile.js';

class ArboritoModalArcade extends HTMLElement {
    constructor() {
        super();
        this.activeTab = 'games'; // 'games' | 'storage' | 'garden'
        this.discoveredGames = [];
        this.isLoading = false;
        this.isPreparingContext = false;
        
        // Setup State
        this.selectedGame = null;
        this.selectedNodeId = null;
        
        // New State for "Watering Mode"
        this.wateringTargetId = null; 
        
        this.filterText = '';
        this.isInitialized = false;
        /** Batch rapid `state-change` redraws (avoids list/tab flicker). */
        this._updateContentScheduled = false;
    }

    async connectedCallback() {
        if (!this.isInitialized) {
            renderSkeleton(this);
            this.isInitialized = true;
        }
        this.updateContent();
        
        this.storeListener = () => {
            if (this.selectedGame && this.isPreparingContext) return;
            this.scheduleUpdateContent();
        };
        store.addEventListener('state-change', this.storeListener);
        
        await this.loadAllGames();
    }
    
    disconnectedCallback() {
        store.removeEventListener('state-change', this.storeListener);
    }

    async loadAllGames() {
        this.isLoading = true;
        this.scheduleUpdateContent();
        
        this.discoveredGames = [];
        const repos = store.userStore.state.gameRepos || [];
        
        const promises = repos.map(async (repo) => {
            try {
                const res = await fetch(repo.url, { cache: 'no-cache' });
                if (res.ok) {
                    const games = await res.json();
                    
                    const repoBase = repo.url.substring(0, repo.url.lastIndexOf('/') + 1);
                    const normalize = (path) => {
                        if (!path) return '';
                        if (path.startsWith('http') || path.startsWith('//')) return path;
                        if (path.startsWith('./')) return repoBase + path.substring(2);
                        if (path.startsWith('/')) return repoBase + path.substring(1); 
                        return repoBase + path;
                    };

                    const tagged = games.map(g => ({ 
                        ...g, 
                        path: normalize(g.path || g.url), 
                        repoId: repo.id, 
                        repoName: repo.name,
                        isOfficial: repo.isOfficial
                    }));
                    
                    this.discoveredGames.push(...tagged);
                }
            } catch (e) {
                console.warn(`Failed to load repo ${repo.name}`, e);
            }
        });

        await Promise.all(promises);
        this.isLoading = false;
        this.scheduleUpdateContent();
    }

    close() {
        store.dismissModal();
    }


    scheduleUpdateContent() {
        if (!this.isInitialized) return;
        if (this._updateContentScheduled) return;
        this._updateContentScheduled = true;
        queueMicrotask(() => {
            this._updateContentScheduled = false;
            this.updateContent();
        });
    }

    updateContent() {
        if (!this.isInitialized) return;
        
        const modal = store.value.modal;
        const preSelectedNodeId =
            modal && typeof modal === 'object'
                ? (modal.preSelectedNodeId || modal.moduleId || modal.nodeId || null)
                : null;
        if (!this.selectedGame && preSelectedNodeId) {
            const want = String(preSelectedNodeId);
            if (this.wateringTargetId !== want) {
                this.wateringTargetId = want;
                this.activeTab = 'games';
            }
        }

        const ui = store.ui;
        const isMobile = shouldShowMobileUI();
        const mainHeader = this.querySelector('#main-header');
        const setupHeader = this.querySelector('#setup-header');
        const mainTabs = this.querySelector('#main-tabs');
        const content = this.querySelector('#modal-content');
        
        // SETUP MODE vs MAIN MODE
        if (this.selectedGame) {
            // SHOW SETUP
            mainHeader.classList.add('hidden');
            mainTabs.classList.add('hidden');
            setupHeader.classList.remove('hidden');

            const setupHeaderKey = `${this.selectedGame.path || ''}-${isMobile}`;
            if (this._arcadeSetupHeaderKey !== setupHeaderKey) {
                this._arcadeSetupHeaderKey = setupHeaderKey;
                const setupGameIcon = escHtml(this.selectedGame.icon || '🕹️');
                const setupGameName = escHtml(this.selectedGame.name);
                const setupSub = escHtml(ui.arcadeSetup || 'Game Setup');
                setupHeader.innerHTML = isMobile
                    ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-close' })}
                    <div class="w-14 h-14 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center text-2xl border-2 border-orange-200 dark:border-orange-800 shrink-0">
                        ${setupGameIcon}
                    </div>
                    <div class="min-w-0 flex-1 text-left">
                        <h2 class="arborito-mmenu-subtitle m-0">${setupGameName}</h2>
                        <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">${setupSub}</p>
                    </div>
                </div>`
                    : `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 gap-3 items-center">
                    <div class="min-w-0 flex-1 text-left">
                        <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${setupGameName}</h2>
                        <p class="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider mt-1">${setupSub}</p>
                    </div>
                    <div class="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center text-3xl border-2 border-orange-200 dark:border-orange-800 shrink-0">
                        ${setupGameIcon}
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
            `;
            }

            renderSetupContent(this, content, ui);
        } else {
            this._arcadeSetupHeaderKey = null;
            // SHOW MAIN
            mainHeader.classList.remove('hidden');
            mainTabs.classList.remove('hidden');
            setupHeader.classList.add('hidden');
            
            // Update Tab Styles
            const tGames = this.querySelector('#tab-games');
            const tGarden = this.querySelector('#tab-garden');
            const tStorage = this.querySelector('#tab-storage');
            
            const activeClass = "border-orange-500 text-orange-700 dark:text-orange-400";
            const inactiveClass = "border-transparent text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100";
            
            tGames.className = `flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'games' ? activeClass : inactiveClass}`;
            tGarden.className = `flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'garden' ? 'border-red-500 text-red-600 dark:text-red-400' : inactiveClass}`;
            tStorage.className = `flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'storage' ? 'border-purple-500 text-purple-600 dark:text-purple-400' : inactiveClass}`;
            
            // Render Content
            if (this.activeTab === 'games') renderGamesList(this, content, ui);
            if (this.activeTab === 'garden') renderGarden(this, content, ui);
            if (this.activeTab === 'storage') renderStorage(content, ui);
        }
    }





    async handleDelegatedClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (btn.classList.contains('btn-close')) {
            if (this.selectedGame) this.cancelLaunch();
            else this.close();
            return;
        }
        
        if (action === 'cancel-watering') this.cancelWatering();
        if (action === 'add-custom') this.addCustomGame();
        if (action === 'remove-game') {
            store.userStore.settings.removeGame(id);
            this.updateContent();
        }
        if (action === 'prepare') {
            const isManual = btn.dataset.manual === 'true';
            const idx = parseInt(btn.dataset.idx);
            const manualGames = store.userStore.state.installedGames.map(g => ({...g, isManual: true, path: g.url}));
            const allGames = [...this.discoveredGames, ...manualGames];
            this.prepareLaunch(allGames[idx], this.wateringTargetId);
            this.wateringTargetId = null;
        }
        if (action === 'water-node') this.launchWateringSession(id);
        if (action === 'delete-save') {
            const ui = store.ui;
            if (await store.confirm(ui.arcadeDeleteSaveConfirm || 'Delete save data for this game?')) {
                store.storage.clearGameData(id);
                this.updateContent();
            }
        }
        if (action === 'delete-all-saves') {
            const ui = store.ui;
            if (await store.confirm(ui.arcadeDeleteAllSavesConfirm || 'Delete ALL Arcade save data?')) {
                store.storage.clearAll();
                this.updateContent();
            }
        }
        if (action === 'select-node') {
            this.selectedNodeId = id;
            this.updateContent();
        }
        if (action === 'start-game') this.launchGame();
    }

    // --- LOGIC HELPER METHODS --- (Same as before)
    async ensureTreeLoaded(node, depth = 0) {
        if (depth > 4) return;
        if (node.type === 'branch' || node.type === 'root') {
            if (node.hasUnloadedChildren) await store.loadNodeChildren(node);
            if (node.children) await Promise.all(node.children.map(c => this.ensureTreeLoaded(c, depth + 1)));
        }
    }

    async prepareLaunch(game, preSelectedNodeId = null) {
        this.selectedGame = game;
        this.isPreparingContext = true;
        this.updateContent();

        const root = store.value.data;
        if (root) await this.ensureTreeLoaded(root);

        if (preSelectedNodeId) this.selectedNodeId = preSelectedNodeId;
        else {
            const current = store.value.previewNode || store.value.selectedNode || store.value.data;
            if (current) this.selectedNodeId = (current.type === 'exam') ? current.parentId : current.id;
            else this.selectedNodeId = root ? root.id : null;
        }
        
        this.isPreparingContext = false;
        this.updateContent();
    }
    
    launchWateringSession(nodeId) {
        this.wateringTargetId = nodeId;
        this.activeTab = 'games';
        this.updateContent();
    }
    
    cancelWatering() {
        this.wateringTargetId = null;
        this.updateContent();
    }

    cancelLaunch() {
        this.selectedGame = null;
        this.selectedNodeId = null;
        this.wateringTargetId = null;
        this.filterText = '';
        this.updateContent();
    }

    getFlatNodes() {
        const root = store.value.data;
        if (!root) return [];
        const nodes = [];
        const traverse = (n, depth) => {
            if (!this.filterText || n.name.toLowerCase().includes(this.filterText.toLowerCase())) nodes.push({ ...n, depth });
            if (n.children) n.children.forEach(c => traverse(c, depth + 1));
        };
        traverse(root, 0);
        return nodes;
    }

    launchGame() {
        if (!this.selectedGame || !this.selectedNodeId) return;
        const activeSource = store.value.activeSource;
        const targetNode = store.findNode(this.selectedNodeId);
        if (!activeSource || !targetNode) return;

        const treeUrl = encodeURIComponent(activeSource.url);
        const lang = store.value.lang || 'EN';
        const modulePath = targetNode.apiPath || targetNode.contentPath || ''; 
        const encodedPath = encodeURIComponent(modulePath);

        let finalUrl = this.selectedGame.path;
        const separator = finalUrl.includes('?') ? '&' : '?';
        finalUrl += `${separator}source=${treeUrl}&lang=${lang}`;
        if (encodedPath) finalUrl += `&module=${encodedPath}`;
        finalUrl += `&moduleId=${this.selectedNodeId}`;

        store.setModal({ 
            type: 'game-player', 
            url: finalUrl,
            title: this.selectedGame.name,
            moduleId: this.selectedNodeId 
        });
    }

    addCustomGame() {
        const url = this.querySelector('#inp-custom-game').value.trim();
        if (!url) return;
        let name = "Custom Game";
        try { name = new URL(url).hostname; } catch(e){}
        store.userStore.settings.addGame(name, url);
        this.updateContent();
    }
}
customElements.define('arborito-modal-arcade', ArboritoModalArcade);
