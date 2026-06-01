import { ensureWeeklyLumensReset } from '../../features/tree-graph/tree-ranking.js';
import { normalizeGamification } from './_helpers.js';

export const progressMixin = {
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
                    if (parsed.gameData) this.state.gameData = parsed.gameData;
                    if (parsed.localTrees) this.state.localTrees = parsed.localTrees;
                    if (parsed.memory) this.state.memory = parsed.memory;
                }
            }

            if (this.ensureDefaultArcadeGameCatalog()) {
                this.persist();
            }
        } catch (e) {
            /* ignore parse errors */
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
            gameData: this.state.gameData,
            localTrees: this.state.localTrees,
            cloudProgressSync: !!this.state.cloudProgressSync,
            memory: this.state.memory, // Memory Core Persist
            timestamp: Date.now()
        };
    },

    persist() {
        try {
            const payload = this.getPersistenceData();
            localStorage.setItem('arborito-progress', JSON.stringify(payload));
            if (this.onPersist) this.onPersist(payload);
        } catch (e) { console.warn("Storage Error", e); }
    },

    getExportJson() {
        const data = {
            v: 3,
            ts: Date.now(),
            progress: Array.from(this.state.completedNodes),
            gamification: this.state.gamification,
            bookmarks: this.state.bookmarks,
            installedGames: this.state.installedGames,
            gameRepos: this.state.gameRepos,
            gameData: this.state.gameData,
            localTrees: this.state.localTrees,
            memory: this.state.memory,
            // Optional: writer keypair for encrypted Nostr progress sync (export/import together).
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
