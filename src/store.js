import { github } from './services/github.js';
import { UserStore } from './stores/user-store.js';
import { SourceManager } from './stores/source-manager.js';
import { TreeUtils } from './utils/tree-utils.js';
import { storageManager } from './stores/storage-manager.js';
import { DataProcessor } from './utils/data-processor.js';
import { GraphLogic } from './stores/graph-logic.js';
import { AILogic } from './stores/ai-logic.js';
import { UIStore } from './ui-store.js';

class Store extends UIStore {
    constructor() {
        super();
        
        // 1. Sub-Stores & Managers
        this.userStore = new UserStore(
            () => this.ui,
            null 
        );

        this.sourceManager = new SourceManager(
            (updates) => this.update(updates),
            () => this.ui
        );
        
        // Graph Logic Delegator
        this.graphLogic = new GraphLogic(this);
        
        // AI Logic Delegator
        this.aiLogic = new AILogic(this);
        
        // 2. Initialization
        this.initialize().then(async () => {
             const streakMsg = this.userStore.settings.checkStreak();
             if (streakMsg) this.notify(streakMsg);
             
             const source = await this.sourceManager.init();
             if (source) {
                 this.loadData(source);
             } else {
                 if (!this.state.modal) {
                     this.update({ loading: false });
                 }
             }
        });

        const ghToken = localStorage.getItem('arborito-gh-token') || sessionStorage.getItem('arborito-gh-token');
        if (ghToken) {
            github.initialize(ghToken).then(user => {
                 if (user) this.update({ githubUser: user });
            });
        }

        document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
    }

    async initialize() {
        await this.loadLanguage(this.state.lang);
        
        const welcomeSeen = localStorage.getItem('arborito-welcome-seen');
        if (!welcomeSeen && !this.state.modal) {
            setTimeout(() => this.setModal('welcome'), 50); 
        }
    }

    get value() { 
        return { 
            ...this.state,
            completedNodes: this.userStore.state.completedNodes,
            bookmarks: this.userStore.state.bookmarks,
            gamification: this.userStore.state.gamification
        }; 
    }
    
    get dailyXpGoal() { return this.userStore.dailyXpGoal; }
    get storage() { return storageManager; }

    // --- SOURCE & DATA DELEGATION ---

    async loadData(source, forceRefresh = true) {
        try {
            const prevSourceUrl = this.state.activeSource?.url;
            const nextSourceUrl = source?.url;
            if (nextSourceUrl && nextSourceUrl !== prevSourceUrl) {
                this.update({ searchCache: {} });
            }

            const { json, finalSource } = await this.sourceManager.loadData(source, this.state.lang, forceRefresh, this.state.rawGraphData);
            if (json) {
                DataProcessor.process(this, json, finalSource);
            }
        } catch(e) {
            this.update({ loading: false, error: e.message });
        }
    }
    
    proceedWithUntrustedLoad() {
        const source = this.state.pendingUntrustedSource;
        if (source) {
            this.update({ modal: null, pendingUntrustedSource: null });
            this.loadData(source);
        }
    }

    async cancelUntrustedLoad() {
        this.update({ modal: null, pendingUntrustedSource: null });
        const defaultSource = await this.sourceManager.getDefaultSource();
        this.loadData(defaultSource);
    }

    processLoadedData(json) {
        DataProcessor.process(this, json, this.state.activeSource);
    }

    requestAddCommunitySource(url) {
        if (this.sourceManager.isUrlTrusted(url)) {
            this.sourceManager.addCommunitySource(url);
        } else {
            this.update({ modal: { type: 'security-warning', url: url } });
        }
    }

    addCommunitySource(url) { this.sourceManager.addCommunitySource(url); }
    removeCommunitySource(id) { this.sourceManager.removeCommunitySource(id); }
    
    loadAndSmartMerge(sourceId) {
        let source = this.state.availableReleases.find(s => s.id === sourceId) ||
                     this.state.communitySources.find(s => s.id === sourceId);
        if (!source) return;
        this.loadData(source, true);
    }

    // --- GRAPH & NAVIGATION DELEGATION ---

    findNode(id) { return this.graphLogic.findNode(id); }
    async navigateTo(nodeId, nodeData = null) { return this.graphLogic.navigateTo(nodeId, nodeData); }
    async navigateToNextLeaf() { return this.graphLogic.navigateToNextLeaf(); }
    async toggleNode(nodeId) { return this.graphLogic.toggleNode(nodeId); }
    async loadNodeChildren(node, opts) { return this.graphLogic.loadNodeChildren(node, opts); }
    async loadNodeContent(node) { return this.graphLogic.loadNodeContent(node); }
    async moveNode(node, newParentId) { return this.graphLogic.moveNode(node, newParentId); }

    enterLesson() {
        const node = this.state.previewNode;
        if (node) {
             if (!node.content && node.contentPath) this.loadNodeContent(node).then(() => {
                 this.update({ selectedNode: node, previewNode: null });
             });
             else this.update({ selectedNode: node, previewNode: null });
        }
    }

    goHome() {
        this.update({
            viewMode: 'explore',
            selectedNode: null,
            previewNode: null,
            modal: null,
            certificatesFromMobileMore: false
        });
        this.dispatchEvent(new CustomEvent('reset-zoom'));
    }
    closePreview() { this.update({ previewNode: null }); }
    closeContent() { this.update({ selectedNode: null }); }
    openEditor(node) { if (node) this.update({ modal: { type: 'editor', node: node } }); }
    
    async search(query) {
        if (!this.state.activeSource?.url) return [];
        return TreeUtils.search(query, this.state.activeSource, this.state.lang, this.state.searchCache);
    }

    async searchBroad(char) {
        if (!this.state.activeSource?.url) return [];
        return TreeUtils.searchBroad(char, this.state.activeSource, this.state.lang, this.state.searchCache);
    }

    // --- INTEGRATIONS (AI, Cloud, User) ---

    async initSage() { return this.aiLogic.initSage(); }
    abortSage() { return this.aiLogic.abortSage(); }
    clearSageChat() { return this.aiLogic.clearSageChat(); }
    async chatWithSage(userText) { return this.aiLogic.chatWithSage(userText); }

    // --- USER STORE PROXIES ---

    computeHash(str) { return this.userStore.settings.computeHash(str); }
    loadBookmarks() { this.userStore.settings.loadBookmarks(); }
    saveBookmark(nodeId, contentRaw, index, visitedSet) { this.userStore.settings.saveBookmark(nodeId, contentRaw, index, visitedSet); }
    removeBookmark(nodeId) { this.userStore.settings.removeBookmark(nodeId); this.update({}); }
    getBookmark(nodeId, contentRaw) { return this.userStore.settings.getBookmark(nodeId, contentRaw); }
    loadProgress() { this.userStore.loadProgress(); }
    
    checkStreak() { 
        const msg = this.userStore.settings.checkStreak(); 
        if(msg) this.notify(msg);
        this.update({});
    }

    addXP(amount, silent = false) {
        const msg = this.userStore.settings.addXP(amount);
        if (!silent && msg) this.notify(msg);
        this.update({});
    }

    harvestSeed(moduleId) {
        const msg = this.userStore.settings.harvestSeed(moduleId);
        if(msg) this.notify(msg);
        this.update({});
    }

    updateGamification(updates) {
        this.userStore.settings.updateGamification(updates);
        this.update({});
    }

    updateUserProfile(username, avatar) {
        this.userStore.settings.updateGamification({ username, avatar });
        this.notify(this.ui.profileUpdated);
        this.update({});
    }

    markComplete(nodeId, forceState = null) {
        const xpMsg = this.userStore.markComplete(nodeId, forceState);
        if(xpMsg) this.notify(xpMsg);
        this.update({}); 
        this.checkForModuleCompletion(nodeId);
    }

    /**
     * Al aprobar un examen: marca como completadas todas las hojas (lecciones) en ramas hermanas
     * del examen bajo el mismo padre, sin otorgar XP por cada una (solo persistencia + SRS suave).
     */
    markExamExemptSiblingLeaves(examNodeId) {
        const exam = this.findNode(examNodeId);
        if (!exam || exam.type !== 'exam' || !exam.parentId) return;
        const parent = this.findNode(exam.parentId);
        if (!parent?.children?.length) return;

        const leafIds = [];
        const collectLeaves = (n) => {
            if (!n) return;
            if (n.type === 'leaf') {
                leafIds.push(n.id);
                return;
            }
            if (n.type === 'exam') return;
            if (n.children) n.children.forEach(collectLeaves);
        };

        let changed = false;
        const markDone = (id) => {
            if (id == null) return;
            if (!this.userStore.state.completedNodes.has(id)) {
                this.userStore.state.completedNodes.add(id);
                changed = true;
            }
        };

        markDone(parent.id);
        for (const sibling of parent.children) {
            if (String(sibling.id) === String(examNodeId)) continue;
            markDone(sibling.id);
            collectLeaves(sibling);
        }

        for (const id of leafIds) {
            if (!this.userStore.state.completedNodes.has(id)) {
                this.userStore.state.completedNodes.add(id);
                changed = true;
                if (!this.userStore.state.memory[id]) {
                    try {
                        this.userStore.reportMemory(id, 4);
                    } catch (e) {
                        /* ignore */
                    }
                }
            }
        }
        if (changed) {
            this.userStore.persist();
            this.update({});
            this.dispatchEvent(new CustomEvent('graph-update'));
        }
        this.checkForModuleCompletion(examNodeId);
    }

    markBranchComplete(branchId) {
        if (!branchId) return;
        const branchNode = this.findNode(branchId);
        
        if (branchNode) {
            this.userStore.state.completedNodes.add(branchNode.id);
            
            if (branchNode.children) {
                branchNode.children.forEach(child => {
                    this.userStore.state.completedNodes.add(child.id);
                });
            }
            
            if (branchNode.leafIds && Array.isArray(branchNode.leafIds)) {
                branchNode.leafIds.forEach(id => this.userStore.state.completedNodes.add(id));
            }
            
            DataProcessor.hydrateCompletionState(this, branchNode);
        }
        
        this.userStore.persist();
        this.update({});
        this.dispatchEvent(new CustomEvent('graph-update'));
    }

    checkForModuleCompletion(relatedNodeId) {
        const modules = this.getModulesStatus();
        modules.forEach(m => {
            if (m.isComplete) {
                if (!this.userStore.state.completedNodes.has(m.id)) {
                     this.markBranchComplete(m.id);
                }
                this.harvestSeed(m.id);
            }
        });
    }

    getExportJson() { return this.userStore.getExportJson(); }

    downloadProgressFile() {
        const data = this.getExportJson();
        const blob = new Blob([data], {type: 'application/json;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `arborito-progress-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    importProgress(input) {
        try {
            let data;
            const cleaned = input.trim();
            if (cleaned.startsWith('{')) data = JSON.parse(cleaned);
            else data = JSON.parse(decodeURIComponent(escape(atob(cleaned))));

            let newProgress = [];
            if (Array.isArray(data)) newProgress = data;
            if (data.progress) newProgress = data.progress;
            if (data.p) newProgress = data.p;

            if (data.g || data.gamification) {
                this.userStore.state.gamification = { ...this.userStore.state.gamification, ...(data.g || data.gamification) };
                if (this.userStore.state.gamification.fruits && !this.userStore.state.gamification.seeds) {
                    this.userStore.state.gamification.seeds = this.userStore.state.gamification.fruits;
                }
            }
            
            if (data.b || data.bookmarks) {
                this.userStore.state.bookmarks = { ...this.userStore.state.bookmarks, ...(data.b || data.bookmarks) };
                localStorage.setItem('arborito-bookmarks', JSON.stringify(this.state.bookmarks));
            }
            
            if (data.d || data.gameData) {
                this.userStore.state.gameData = { ...this.userStore.state.gameData, ...(data.d || data.gameData) };
            }

            if (!Array.isArray(newProgress)) throw new Error("Invalid Format");

            const merged = new Set([...this.userStore.state.completedNodes, ...newProgress]);
            this.userStore.state.completedNodes = merged;
            this.userStore.persist();
            
            if (this.state.data) DataProcessor.hydrateCompletionState(this, this.state.data);
            
            this.update({});
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    isCompleted(id) { return this.userStore.isCompleted(id); }

    getAvailableCertificates() {
        if (this.state.data && this.state.data.certificates) {
            return this.state.data.certificates.map(c => {
                const isComplete = this.userStore.state.completedNodes.has(c.id);
                return { ...c, isComplete };
            });
        }
        return this.getModulesStatus().filter(m => m.isCertifiable);
    }

    getModulesStatus() {
        return TreeUtils.getModulesStatus(this.state.data, this.userStore.state.completedNodes);
    }
}

export const store = new Store();