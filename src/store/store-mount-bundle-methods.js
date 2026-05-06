import { mountCurriculum } from '../curriculum/mount-curriculum.js';
import { DataProcessor } from '../utils/data-processor.js';
import { normalizeLoadedTreeJson } from '../utils/tree-load-pipeline.js';

/** Source loading, view repair, and merge of IPFS/file bundles. */
export const mountBundleMethods = {
    // --- SOURCE & DATA DELEGATION ---

    /**
     * Curriculum load: delegates to `mount-curriculum.js` (tree uses `treeHydrating`, not `loading`).
     */
    async loadData(source, forceRefresh = true) {
        return mountCurriculum(this, source, forceRefresh);
    },

    /** No active tree: clear canvas, leave construction, close modals, open the “Load tree” step. */
    async clearCanvasAndShowLoadTreeWelcome() {
        await this.loadData(null);
        this.update({ constructionMode: false, curriculumEditLang: null });
        this.dismissModal();
        // No welcome modal: open Trees directly (unified sources modal).
        queueMicrotask(() => this.setModal({ type: 'sources' }));
    },

    /**
     * Sources modal: if there is no local tree left and no curriculum in memory,
     * it cannot be dismissed until the user loads or adds one (Internet or another flow).
     */
    isSourcesDismissBlocked() {
        const locals = (((this.userStore && this.userStore.state) && (this.userStore && this.userStore.state).localTrees ? (this.userStore && this.userStore.state).localTrees.length : null) != null ? ((this.userStore && this.userStore.state) && (this.userStore && this.userStore.state).localTrees ? (this.userStore && this.userStore.state).localTrees.length : null) : 0);
        return locals === 0 && !this.state.data;
    },

    /**
     * If the user just added the only community link and the Sources modal is open,
     * load that tree and close the modal (avoids an extra click on “Load”).
     * @param {{ ok?: boolean, source?: object }} addResult result from `addCommunitySource` / `_appendSource`
     */
    async maybeAutoLoadSoleCommunityAfterAdd(addResult) {
        if (!addResult || addResult.ok !== true) return;
        const list = this.state.communitySources || [];
        if (list.length !== 1) return;
        const sole =
            addResult.source && list.some((s) => s && String(s.id) === String(addResult.source.id))
                ? addResult.source
                : list[0];
        if (!sole?.id) return;
        const m = this.state.modal;
        const sourcesOpen =
            m &&
            (m === 'sources' || (typeof m === 'object' && m.type === 'sources'));
        if (!sourcesOpen) return;
        try {
            const ok = await this.loadAndSmartMerge(sole.id);
            if (!ok) {
                /* `mountCurriculum` already set `error`, cleared the canvas on source switch, and queued `notify`. */
                return;
            }
        } catch (e) {
            console.warn('[Arborito] maybeAutoLoadSoleCommunityAfterAdd', e);
            const ui = this.ui || {};
            const msg = String((e && e.message) || e || '').trim();
            if (msg) {
                const tpl = ui.curriculumLoadFailedSummary || '{message}';
                try {
                    this.notify(tpl.replace(/\{message\}/g, msg), true);
                } catch {
                    /* ignore */
                }
            }
            return;
        }
        this.dismissModal({ returnToMore: false });
    },

    /**
     * If raw graph is in memory but `data` stayed null (inconsistent state), re-process once.
     */
    repairTreeViewFromRaw() {
        if (this.state.data) return false;
        if (this.state.treeHydrating) return false;
        if (this.state.loading) return false;
        if (this.state.error) return false;
        const raw = this.state.rawGraphData;
        const src = this.state.activeSource;
        if (!(raw && raw.languages) || !src) return false;
        try {
            DataProcessor.process(this, raw, src, { suppressReadmeAutoOpen: true });
            return true;
        } catch (e) {
            console.warn('[Arborito] repairTreeViewFromRaw', e);
            this.update({ loading: false });
            return false;
        }
    },
    
    proceedWithUntrustedLoad() {
        const source = this.state.pendingUntrustedSource;
        if (source) {
            this.update({ modal: null, pendingUntrustedSource: null });
            this.loadData(source);
        }
    },

    async cancelUntrustedLoad() {
        this.update({ modal: null, pendingUntrustedSource: null });
        const defaultSource = await this.sourceManager.getDefaultSource();
        if (defaultSource) {
            this.loadData(defaultSource);
        } else {
            this.update({ loading: false, error: null });
        }
    },

    processLoadedData(json) {
        const graphJson = normalizeLoadedTreeJson(json, this, this.state.activeSource);
        if (!graphJson) return;
        DataProcessor.process(this, graphJson, this.state.activeSource, { suppressReadmeAutoOpen: true });
    },

    /**
     * Merge progress + forum from a loaded arborito-bundle (IPFS or file).
     * @param {{ tree: object, progress: object|null, forum: object|null, meta?: object|null }} unpacked
     * @param {object|null} finalSource
     */
    applyBundlePayload(unpacked, finalSource) {
        const p = unpacked.progress;
        if (p) {
            const us = this.userStore.state;
            for (const id of p.completedNodes || []) {
                us.completedNodes.add(id);
            }
            if (p.memory && typeof p.memory === 'object') {
                for (const [k, v] of Object.entries(p.memory)) {
                    us.memory[k] = v;
                }
            }
            if (p.bookmarks && typeof p.bookmarks === 'object') {
                for (const [k, v] of Object.entries(p.bookmarks)) {
                    us.bookmarks[k] = v;
                }
            }
            if (p.gameData && typeof p.gameData === 'object') {
                us.gameData = { ...us.gameData, ...p.gameData };
            }
            if (p.gamification && typeof p.gamification === 'object') {
                const g = us.gamification;
                const bg = p.gamification;
                if ((bg.xp || 0) > (g.xp || 0)) {
                    g.xp = bg.xp;
                }
                g.dailyXP = Math.max(g.dailyXP || 0, bg.dailyXP || 0);
                g.streak = Math.max(g.streak || 0, bg.streak || 0);
                if (bg.username && (!g.username || g.username === '')) {
                    g.username = bg.username;
                }
                if (bg.avatar && (!g.avatar || g.avatar === '👤' || g.avatar === '🌱')) {
                    g.avatar = bg.avatar;
                }
                if (Array.isArray(bg.seeds) && bg.seeds.length > ((g.seeds && g.seeds.length) || 0)) {
                    g.seeds = bg.seeds;
                }
            }
            this.userStore.persist();
            try {
                localStorage.setItem('arborito-bookmarks', JSON.stringify(us.bookmarks));
            } catch {
                /* ignore */
            }
        }
        if (unpacked.forum && (finalSource && finalSource.id) && finalSource.origin !== 'nostr') {
            this.forumStore.replaceSnapshot(finalSource.id, {
                threads: unpacked.forum.threads,
                messages: unpacked.forum.messages,
                moderationLog: unpacked.forum.moderationLog
            });
        }
    }

};
