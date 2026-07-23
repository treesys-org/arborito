import { getFileSystemSync } from './store-lazy-modules.js';
import { persistActiveComposedBranchFromRaw } from '../features/forest/api/persist-composed-branch-from-raw.js';

/** Construction undo + branch autosave, mixed onto Store.prototype (overrides ShellStore.update). */
export const storeConstructionUpdateMethods = {
    update(partialState) {
        const proto = Object.getPrototypeOf(Object.getPrototypeOf(this));
        const superUpdate = proto.update.bind(this);

        if (!partialState || typeof partialState !== 'object') {
            superUpdate(partialState);
            return;
        }

        if ('rawGraphData' in partialState && partialState.rawGraphData == null && !this._constructionUndoApplying) {
            this._flushPendingConstructionUndo?.();
            this._constructionUndoStack = [];
            this._constructionRedoStack = [];
            this.dispatchEvent(new CustomEvent('construction-undo-changed'));
        }

        const fs = getFileSystemSync();
        const shouldRecordUndo =
            !this._constructionUndoApplying &&
            'rawGraphData' in partialState &&
            partialState.rawGraphData != null &&
            this.state.constructionMode &&
            !this.state.treeHydrating &&
            fs &&
            fs.features.canWrite &&
            (fs.isLocal || fs.isNostrTreeSource()) &&
            this.state.rawGraphData;

        if (shouldRecordUndo) {
            try {
                const prev =
                    this._constructionUndoStack.length > 0
                        ? this._normalizeConstructionHistoryEntry(
                              this._constructionUndoStack[this._constructionUndoStack.length - 1]
                          ).snap
                        : null;
                const snapBefore = this.state.rawGraphData;
                const summary = this._constructionHistorySummary(prev, partialState.rawGraphData);
                this._scheduleConstructionUndoRecord(snapBefore, summary);
            } catch {
                /* ignore */
            }
        }

        superUpdate(partialState);

        if (fs && 'rawGraphData' in partialState && fs.features.canWrite && fs.isLocal) {
            if (fs.isLocalComposedTree?.()) {
                if (this._branchAutosaveTimer) clearTimeout(this._branchAutosaveTimer);
                this._branchAutosaveTimer = setTimeout(() => {
                    this._branchAutosaveTimer = null;
                    if (this.state.treeHydrating) return;
                    if (!fs.activeComposedBranchId?.()) return;
                    persistActiveComposedBranchFromRaw(this, this.state.rawGraphData, {
                        notifyOnFailure: true,
                    });
                }, 350);
            } else if (this.state.activeSource?.url?.startsWith('branch://')) {
                if (this._branchAutosaveTimer) clearTimeout(this._branchAutosaveTimer);
                this._branchAutosaveTimer = setTimeout(() => {
                    this._branchAutosaveTimer = null;
                    this.persistActiveBranchIfNeeded();
                }, 350);
            }
        }

        if (fs && 'rawGraphData' in partialState && fs.features.canWrite && fs.isNostrTreeSource?.()) {
            if (this._linkedLocalMirrorAutosaveTimer) clearTimeout(this._linkedLocalMirrorAutosaveTimer);
            this._linkedLocalMirrorAutosaveTimer = setTimeout(() => {
                this._linkedLocalMirrorAutosaveTimer = null;
                if (this.state.treeHydrating) return;
                this.persistLinkedLocalMirrorIfNeeded();
            }, 350);
        }
    },
};
