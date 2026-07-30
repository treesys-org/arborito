import { ensureWeeklyLumensReset } from '../../features/tree-graph/api/tree-ranking.js';
import { normalizeGamification } from './_helpers.js';
import {
    loadBranches,
    loadTrees,
    persistBranchEntry,
    persistTreeEntry,
} from '../../shared/lib/arborito-catalog-store.js';
import { normalizeComposedTreeBranchRefs } from '../../shared/lib/branch-id.js';
import { maybeSeedArboritoDemo } from '../demo/seed-arborito-demo.js';
import { areArboritoStorageWritesDisabled } from '../../shared/lib/arborito-storage-gate.js';
import { invalidateComposedGraphCache } from '../../features/forest/api/composed-graph-cache.js';
import { getArboritoStore } from '../store-singleton.js';

/** Composed ids (`ref::node`) and bare ids share completion for the same lesson. */
function completionIdAliases(nodeId) {
    const id = String(nodeId || '');
    if (!id) return [];
    const out = [id];
    const sep = id.indexOf('::');
    if (sep >= 0) {
        const bare = id.slice(sep + 2);
        if (bare && !out.includes(bare)) out.push(bare);
    }
    return out;
}

export const progressMixin = {
    markBranchDirty(branchId, opts = null) {
        if (!branchId) return;
        if (!this._branchesDirty) this._branchesDirty = new Set();
        this._branchesDirty.add(branchId);
        /* Content edits bust composed-graph cache; recency-only touches must not. */
        if (!(opts && opts.recencyOnly)) {
            try {
                const trees = this.treesReferencingBranch?.(branchId) || [];
                for (const t of trees) {
                    if (t?.id) invalidateComposedGraphCache(t.id);
                }
                const store = getArboritoStore();
                const activeTreeId = String(store?.state?.activeSource?.treeId || '');
                if (
                    store &&
                    activeTreeId &&
                    trees.some((t) => String(t?.id) === activeTreeId)
                ) {
                    store._composedMountFingerprint = '';
                }
            } catch {
                /* ignore */
            }
        }
        const skipAccountSync = !!(opts && opts.skipAccountSync);
        if (skipAccountSync) return;
        const entry = (this.state.branches || []).find((t) => t && t.id === branchId);
        if (entry?.privateSyncedFromAccount) {
            if (!this._privateAccountSyncDirty) this._privateAccountSyncDirty = new Set();
            this._privateAccountSyncDirty.add(branchId);
        }
    },

    /** Ids of account-synced local branches dirtied since last take (for quiet republish). */
    takePrivateAccountSyncDirtyIds() {
        if (!this._privateAccountSyncDirty?.size) return [];
        const ids = [...this._privateAccountSyncDirty];
        this._privateAccountSyncDirty.clear();
        return ids;
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

    /**
     * Await IndexedDB write for one branch (fork / plant must not race a later hydrate).
     * @param {string} branchId
     */
    async flushBranchEntry(branchId) {
        const id = String(branchId || '').trim();
        if (!id) return;
        this._branchesDirty?.delete?.(id);
        const entry = (this.state.branches || []).find((t) => t.id === id);
        if (!entry) return;
        await persistBranchEntry(entry);
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
                    if (Array.isArray(parsed.xpAwardedNodes)) {
                        this.state.xpAwardedNodes = new Set(parsed.xpAwardedNodes);
                    } else if (!this.state.xpAwardedNodes) {
                        this.state.xpAwardedNodes = new Set(parsed.progress);
                    }
                    if (typeof parsed.cloudProgressSync === 'boolean') {
                        this.state.cloudProgressSync = parsed.cloudProgressSync;
                    }
                    if (typeof parsed.autoSyncLocalBranches === 'boolean') {
                        this.state.autoSyncLocalBranches = parsed.autoSyncLocalBranches;
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

    notifyCatalogChanged() {
        this._catalogRevision = (this._catalogRevision || 0) + 1;
        if (typeof this.onCatalogHydrated === 'function') {
            this.onCatalogHydrated(this._catalogRevision);
        }
    },

    _rememberCatalogTombstone(kind, id) {
        const key = String(id || '').trim();
        if (!key) return;
        if (!this._catalogTombstones) {
            this._catalogTombstones = { branches: new Set(), trees: new Set() };
        }
        if (kind === 'branches') this._catalogTombstones.branches.add(key);
        else if (kind === 'trees') this._catalogTombstones.trees.add(key);
    },

    _mergeCatalogEntries(storedList, memoryList, tombstones = new Set()) {
        const byId = new Map((storedList || []).map((entry) => [String(entry.id), entry]));
        for (const id of tombstones) byId.delete(String(id));
        for (const mem of memoryList || []) {
            if (!mem?.id) continue;
            const mid = String(mem.id);
            if (tombstones.has(mid)) continue;
            const stored = byId.get(mid);
            if (!stored || (Number(mem.updated) || 0) >= (Number(stored.updated) || 0)) {
                byId.set(mid, mem);
            }
        }
        return [...byId.values()];
    },

    async _hydrateCatalog() {
        try {
            const [branches, trees] = await Promise.all([loadBranches(), loadTrees()]);
            const tomb = this._catalogTombstones || { branches: new Set(), trees: new Set() };
            this.state.branches = this._mergeCatalogEntries(
                branches,
                this.state.branches,
                tomb.branches
            );
            this.state.trees = this._mergeCatalogEntries(trees, this.state.trees, tomb.trees).map(
                (t) => ({
                    ...t,
                    branchRefs: normalizeComposedTreeBranchRefs(t.branchRefs),
                })
            );
            this._catalogRevision = (this._catalogRevision || 0) + 1;
            maybeSeedArboritoDemo(this);
            if (typeof this.onCatalogHydrated === 'function') {
                this.onCatalogHydrated(this._catalogRevision);
            }
        } catch (e) {
            console.warn('[Arborito] catalog load failed', e);
            this.state.branches = this.state.branches || [];
            this.state.trees = this.state.trees || [];
        }
    },

    getPersistenceData() {
        return {
            progress: Array.from(this.state.completedNodes),
            xpAwardedNodes: Array.from(this.state.xpAwardedNodes || this.state.completedNodes),
            gamification: this.state.gamification,
            bookmarks: this.state.bookmarks,
            installedGames: this.state.installedGames,
            gameRepos: this.state.gameRepos,
            offlineGames: this.state.offlineGames,
            frozenTrees: this.state.frozenTrees,
            gameData: this.state.gameData,
            cloudProgressSync: !!this.state.cloudProgressSync,
            autoSyncLocalBranches: !!this.state.autoSyncLocalBranches,
            memory: this.state.memory,
            timestamp: Date.now()
        };
    },

    persist() {
        if (areArboritoStorageWritesDisabled()) return;
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
        const ids = completionIdAliases(nodeId);
        let isComplete = ids.some((id) => this.state.completedNodes.has(id));
        let shouldAdd = forceState !== null ? forceState : !isComplete;
        let xpResult = null;
        if (!this.state.xpAwardedNodes) this.state.xpAwardedNodes = new Set(this.state.completedNodes);
        if (shouldAdd) {
             if (!isComplete) {
                 for (const id of ids) this.state.completedNodes.add(id);
                                 if (awardXP && !ids.some((id) => this.state.xpAwardedNodes.has(id))) {
                     for (const id of ids) this.state.xpAwardedNodes.add(id);
                     xpResult = this.addXP(10);
                 }
             }
        } else {
             for (const id of ids) this.state.completedNodes.delete(id);
        }
        this.persist();
        return xpResult;
    },

    isCompleted(id) {
        const aliases = completionIdAliases(id);
        if (aliases.some((alias) => this.state.completedNodes.has(alias))) return true;
        /* Bare id completed under a composed prefix (`ref::id`). */
        if (!String(id || '').includes('::')) {
            const bare = String(id || '');
            if (!bare) return false;
            const suffix = `::${bare}`;
            for (const c of this.state.completedNodes) {
                if (String(c).endsWith(suffix)) return true;
            }
        }
        return false;
    },

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
    },

    /**
     * Clear completion + recent lesson positions for nodes in a local branch.
     * @param {string} branchId
     * @returns {number} how many completion ids were removed
     */
    resetProgressForBranch(branchId) {
        const id = String(branchId || '').trim();
        if (!id) return 0;
        const entry = (this.state.branches || []).find((t) => String(t?.id) === id);
        if (!entry?.data) return 0;

        const walk = (node, set) => {
            if (!node || typeof node !== 'object') return;
            if (node.id != null) set.add(String(node.id));
            if (Array.isArray(node.children)) node.children.forEach((c) => walk(c, set));
        };
        const nodeIds = new Set();
        const langs = entry.data?.languages && typeof entry.data.languages === 'object'
            ? Object.keys(entry.data.languages)
            : [];
        for (const lang of langs) walk(entry.data.languages[lang], nodeIds);
        if (!nodeIds.size) return 0;

        const matches = (raw) => {
            const s = String(raw || '');
            if (!s) return false;
            if (nodeIds.has(s)) return true;
            const sep = s.indexOf('::');
            if (sep >= 0 && nodeIds.has(s.slice(sep + 2))) return true;
            return false;
        };

        let removed = 0;
        for (const c of [...this.state.completedNodes]) {
            if (!matches(c)) continue;
            this.state.completedNodes.delete(c);
            removed += 1;
        }
        if (this.state.xpAwardedNodes?.size) {
            for (const c of [...this.state.xpAwardedNodes]) {
                if (matches(c)) this.state.xpAwardedNodes.delete(c);
            }
        }
        if (this.state.recentLessons && typeof this.state.recentLessons === 'object') {
            for (const k of Object.keys(this.state.recentLessons)) {
                if (matches(k)) delete this.state.recentLessons[k];
            }
            try {
                localStorage.setItem('arborito-recent-lessons', JSON.stringify(this.state.recentLessons));
            } catch {
                /* ignore */
            }
        } else {
            try {
                const key = 'arborito-recent-lessons';
                const raw = localStorage.getItem(key);
                if (raw) {
                    const map = JSON.parse(raw);
                    if (map && typeof map === 'object') {
                        let changed = false;
                        for (const k of Object.keys(map)) {
                            if (matches(k)) {
                                delete map[k];
                                changed = true;
                            }
                        }
                        if (changed) localStorage.setItem(key, JSON.stringify(map));
                    }
                }
            } catch {
                /* ignore */
            }
        }
        this.persist();
        return removed;
    }
};
