import { DataProcessor } from '../../tree-graph/data-processor.js';
import { diffTreeData } from '../../tree-graph/tree-diff.js';
import { fileSystem } from '../../backup-export/filesystem.js';

/** Construction-mode undo/redo, forum-shell snapshot, and `toggleConstructionMode`. */
export const storeConstructionUndoMethods = {
    getConstructionUndoDepth() {
        return this._constructionUndoStack?.length ?? 0;
    },

    getConstructionRedoDepth() {
        return this._constructionRedoStack?.length ?? 0;
    },

    _constructionHistoryAuthor() {
        const g = this.state.gamification;
        const sess = this._authSession;
        const name = (g && g.username && String(g.username).trim()) || (sess && sess.username) || '';
        return name || (this.ui.conHistoryAnonymous || 'Editor');
    },

    _normalizeConstructionHistoryEntry(entry) {
        if (!entry) return null;
        if (entry.snap != null) return entry;
        return { snap: entry, at: Date.now(), by: '', summary: '' };
    },

    _constructionHistorySummary(prevSnap, nextSnap) {
        if (!prevSnap || !nextSnap) return '';
        try {
            const d = diffTreeData(prevSnap, nextSnap);
            const ui = this.ui;
            const parts = [];
            if (d.counts.added) parts.push(`+${d.counts.added}`);
            if (d.counts.removed) parts.push(`-${d.counts.removed}`);
            if (d.counts.changed) parts.push(`~${d.counts.changed}`);
            if (!parts.length) return ui.conHistoryNoNodeChanges || 'No structural changes';
            return parts.join(' ');
        } catch {
            return '';
        }
    },

    _makeConstructionHistoryEntry(snap, summary = '') {
        return {
            snap: JSON.parse(JSON.stringify(snap)),
            at: Date.now(),
            by: this._constructionHistoryAuthor(),
            summary: summary || ''
        };
    },

    /** Timeline for construction history UI: past undo snapshots, current, redo futures. */
    getConstructionHistoryTimeline() {
        const undo = (this._constructionUndoStack || [])
            .map((e) => this._normalizeConstructionHistoryEntry(e))
            .filter(Boolean);
        const current = {
            ...this._makeConstructionHistoryEntry(this.state.rawGraphData),
            isCurrent: true
        };
        const redo = (this._constructionRedoStack || [])
            .map((e) => this._normalizeConstructionHistoryEntry(e))
            .filter(Boolean)
            .reverse();
        return { states: [...undo, current, ...redo], currentIndex: undo.length };
    },

    /**
     * Restores the previous `rawGraphData` snapshot (only the map / JSON metadata; does not undo separately saved lessons).
     * @returns {boolean} true if there was something to undo
     */
    undoConstructionEdit() {
        const raw = this._constructionUndoStack?.pop();
        if (!raw) return false;
        const snap = this._normalizeConstructionHistoryEntry(raw).snap;
        this._constructionUndoApplying = true;
        try {
            // Push current state to redo stack
            this._constructionRedoStack.push(
                this._makeConstructionHistoryEntry(
                    this.state.rawGraphData,
                    this._constructionHistorySummary(snap, this.state.rawGraphData)
                )
            );
            while (this._constructionRedoStack.length > this._constructionUndoMax) {
                this._constructionRedoStack.shift();
            }

            const next = JSON.parse(JSON.stringify(snap));
            DataProcessor.process(this, next, this.state.activeSource, { suppressReadmeAutoOpen: true });
            this.dispatchEvent(new CustomEvent('construction-undo-changed'));
            return true;
        } finally {
            this._constructionUndoApplying = false;
        }
    },

    redoConstructionEdit() {
        const raw = this._constructionRedoStack?.pop();
        if (!raw) return false;
        const snap = this._normalizeConstructionHistoryEntry(raw).snap;
        this._constructionUndoApplying = true;
        try {
            // Push current state back to undo stack
            this._constructionUndoStack.push(
                this._makeConstructionHistoryEntry(
                    this.state.rawGraphData,
                    this._constructionHistorySummary(this.state.rawGraphData, snap)
                )
            );
            while (this._constructionUndoStack.length > this._constructionUndoMax) {
                this._constructionUndoStack.shift();
            }

            const next = JSON.parse(JSON.stringify(snap));
            DataProcessor.process(this, next, this.state.activeSource, { suppressReadmeAutoOpen: true });
            this.dispatchEvent(new CustomEvent('construction-undo-changed'));
            return true;
        } finally {
            this._constructionUndoApplying = false;
        }
    },

    clearConstructionUndoStack() {
        this._constructionUndoStack = [];
        this._constructionRedoStack = [];
        this.dispatchEvent(new CustomEvent('construction-undo-changed'));
    },

    /**
     * Called by the forum modal before await store.confirm / prompt so remount restores scroll/thread.
     * @param {{ threadId?: string|null, placeId?: string|null, mobilePanel?: string, draft?: string, replyParentId?: string|null }} snap
     */
    stashForumShellBeforeDialog(snap) {
        this._forumShellSnapshot = snap;
    },

    consumeForumShellSnapshot() {
        const s = this._forumShellSnapshot;
        this._forumShellSnapshot = null;
        return s || null;
    },

    /** Enter construction mode: local always; public tree: owner, editor, or proposer (proposer read-only until proposals flow). */
    canOpenConstruction() {
        if (fileSystem.isLocal) return true;
        if (!fileSystem.isNostrTreeSource()) return false;
        const r = this.getMyTreeNetworkRole();
        return r === 'owner' || r === 'editor' || r === 'proposer';
    },

    toggleConstructionMode() {
        const willEnable = !this.state.constructionMode;
        if (willEnable) {
            const role = typeof this.getMyTreeNetworkRole === 'function' ? this.getMyTreeNetworkRole() : null;
            if (
                fileSystem.isNostrTreeSource() &&
                !fileSystem.features.canWrite &&
                role !== 'owner' &&
                role !== 'editor' &&
                this.state.rawGraphData
            ) {
                void this.offerLocalCopyFromNetworkTreeForEditing();
                return;
            }
        }
        if (willEnable && !this.hasAcceptedAuthorLicense()) {
            this.acceptAuthorLicense();
        }
        if (willEnable && !this.canOpenConstruction()) {
            const ui = this.ui;
            this.notify(ui.constructionRequiresWritable || ui.treeReadOnlyHint || 'This tree is read-only.', true);
            return;
        }
        const enabling = willEnable;
        this.update({ constructionMode: enabling });
        if (!enabling) {
            // Construction ended: if we are on a public tree and cloud sync is off,
            // we may want to show a post-load banner now (non-blocking).
            try {
                this.maybeShowCloudSyncBannerForSource?.(this.state.activeSource);
            } catch {
                /* ignore */
            }
            const m = this.state.modal;
            const t = typeof m === 'object' && m ? m.type : m;
            if (
                t === 'construction-curriculum-lang' ||
                (t === 'pick-curriculum-lang' && m && typeof m === 'object' && m.fromConstructionLangModal)
            ) {
                this.setModal(null);
            }
            this.update({ curriculumEditLang: null });
            if (this.state.rawGraphData?.languages && this.state.activeSource) {
                DataProcessor.process(this, this.state.rawGraphData, this.state.activeSource, {
                    suppressReadmeAutoOpen: true
                });
            }
        } else {
            if (!this.state.data && this.state.rawGraphData?.languages && this.state.activeSource) {
                try {
                    DataProcessor.process(this, this.state.rawGraphData, this.state.activeSource, {
                        suppressReadmeAutoOpen: true
                    });
                } catch (e) {
                    console.error('toggleConstructionMode: rehydrate graph', e);
                    this.update({ loading: false });
                }
            }
            // Start construction tour once (separate from the default UI tour).
            queueMicrotask(() => {
                try {
                    if (localStorage.getItem('arborito-ui-tour-done-construction')) return;
                } catch {
                    /* ignore */
                }
                if (this.state.modal || this.state.previewNode || this.state.modalOverlay) return;
                window.dispatchEvent(
                    new CustomEvent('arborito-start-tour', { detail: { source: 'construction-enter', mode: 'construction' } })
                );
            });
        }
    }
};
