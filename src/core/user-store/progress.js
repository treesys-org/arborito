import { ensureWeeklyLumensReset } from '../../features/tree-graph/api/tree-ranking.js';
import { normalizeGamification } from './_helpers.js';
import {
    loadBranches,
    loadTrees,
    persistBranchEntry,
    persistTreeEntry,
} from '../../shared/lib/arborito-catalog-store.js';
import { normalizeComposedTreeBranchRefs } from '../../shared/lib/branch-id.js';

export const progressMixin = {
    markBranchDirty(branchId) {
        if (!branchId) return;
        if (!this._branchesDirty) this._branchesDirty = new Set();
        this._branchesDirty.add(branchId);
    },

    markTreeDirty(treeId) {
        if (!treeId) return;
        if (!this._treesDirty) this._treesDirty = new Set();
        this._treesDirty.add(treeId);
    },

    _flushDirtyBranches() {
        if (!this._branchesDirty?.size) return;
        const ids = [...this._branchesDirty];
        this._branchesDirty.clear();
        for (const id of ids) {
            const entry = (this.state.branches || []).find((t) => t.id === id);
            if (entry) void persistBranchEntry(entry);
        }
    },

    _flushDirtyTrees() {
        if (!this._treesDirty?.size) return;
        const ids = [...this._treesDirty];
        this._treesDirty.clear();
        for (const id of ids) {
            const entry = (this.state.trees || []).find((t) => t.id === id);
            if (entry) void persistTreeEntry(entry);
        }
    },

    loadProgress() {
        try {
            const saved = localStorage.getItem('arborito-progress');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object' && Array.isArray(parsed.progress)) {
                    this.state.completedNodes = new Set(parsed.progress);
                    if (typeof parsed.cloudProgressSync === 'boolean') {
                        this.state.cloudProgressSync = parsed.cloudProgressSync;
                    }
                    if (parsed.gamification) {
                        this.state.gamification = normalizeGamification({
                            ...this.state.gamification,
                            ...parsed.gamification
                        });
                        const weekReset = ensureWeeklyLumensReset(this.state.gamification);
                        if (weekReset) {
                            this.state.gamification = { ...this.state.gamification, ...weekReset };
                        }
                    }
                    if (parsed.installedGames) this.state.installedGames = parsed.installedGames;
                    if (parsed.gameRepos) this.state.gameRepos = parsed.gameRepos;
                    if (parsed.offlineGames && typeof parsed.offlineGames === 'object') {
                        this.state.offlineGames = parsed.offlineGames;
                    }
                    if (parsed.frozenTrees && typeof parsed.frozenTrees === 'object') {
                        this.state.frozenTrees = parsed.frozenTrees;
                    }
                    if (parsed.gameData) this.state.gameData = parsed.gameData;
                    if (parsed.memory) this.state.memory = parsed.memory;
                }
            }

            if (this.ensureDefaultArcadeGameCatalog()) {
                this.persist();
            }
            this._catalogHydratePromise = this._hydrateCatalog();
        } catch (e) {
            /* ignore parse errors */
        }
    },

    ensureBranchesHydrated() {
        if (!this._catalogHydratePromise) {
            this._catalogHydratePromise = this._hydrateCatalog();
        }
        return this._catalogHydratePromise;
    },

    async _hydrateCatalog() {
        try {
            const [branches, trees] = await Promise.all([loadBranches(), loadTrees()]);
            const memoryBranches = Array.isArray(this.state.branches) ? this.state.branches : [];
            const byId = new Map((branches || []).map((b) => [b.id, b]));
            for (const mem of memoryBranches) {
                if (!mem?.id) continue;
                const stored = byId.get(mem.id);
                if (!stored || (Number(mem.updated) || 0) >= (Number(stored.updated) || 0)) {
                    byId.set(mem.id, mem);
                }
            }
            this.state.branches = [...byId.values()];
            this.state.trees = (trees || []).map((t) => ({
                ...t,
                branchRefs: normalizeComposedTreeBranchRefs(t.branchRefs),
            }));
        } catch (e) {
            console.warn('[Arborito] catalog load failed', e);
            this.state.branches = this.state.branches || [];
            this.state.trees = this.state.trees || [];
        }
    },

    getPersistenceData() {
        return {
            progress: Array.from(this.state.completedNodes),
            gamification: this.state.gamification,
            bookmarks: this.state.bookmarks,
            installedGames: this.state.installedGames,
            gameRepos: this.state.gameRepos,
            offlineGames: this.state.offlineGames,
            frozenTrees: this.state.frozenTrees,
            gameData: this.state.gameData,
            cloudProgressSync: !!this.state.cloudProgressSync,
            memory: this.state.memory,
            timestamp: Date.now()
        };
    },

    persist() {
        try {
            this._flushDirtyBranches();
            this._flushDirtyTrees();
            const payload = this.getPersistenceData();
            localStorage.setItem('arborito-progress', JSON.stringify(payload));
            if (this.onPersist) this.onPersist(payload);
        } catch (e) { console.warn("Storage Error", e); }
    },

    getExportJson() {
        const data = {
            v: 5,
            ts: Date.now(),
            progress: Array.from(this.state.completedNodes),
            gamification: this.state.gamification,
            bookmarks: this.state.bookmarks,
            installedGames: this.state.installedGames,
            gameRepos: this.state.gameRepos,
            gameData: this.state.gameData,
            branches: this.state.branches,
            trees: this.state.trees,
            memory: this.state.memory,
            nostrPair: (() => {
                try {
                    const raw = localStorage.getItem('arborito-nostr-user-pair');
                    return raw ? JSON.parse(raw) : null;
                } catch {
                    return null;
                }
            })()
        };
        return JSON.stringify(data, null, 2);
    },

    markComplete(nodeId, forceState = null, options = {}) {
        const awardXP = options.awardXP !== false;
        let isComplete = this.state.completedNodes.has(nodeId);
        let shouldAdd = forceState !== null ? forceState : !isComplete;
        let xpResult = null;
        if (shouldAdd) {
             if (!isComplete) {
                 this.state.completedNodes.add(nodeId);
                 if (awardXP) xpResult = this.addXP(10);
             }
        } else {
             this.state.completedNodes.delete(nodeId);
        }
        this.persist();
        return xpResult;
    },

    isCompleted(id) { return this.state.completedNodes.has(id); },

    computeHash(str) {
        if (!str) return "0";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(16);
    },

    hashJson(obj) {
        try {
            return this.computeHash(JSON.stringify(obj || null));
        } catch {
            return this.computeHash(String(Date.now()));
        }
    }
};
