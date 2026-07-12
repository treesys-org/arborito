import { getArboritoStore } from '../core/store-singleton.js';
import { DataProcessor } from '../features/tree-graph/api/data-processor.js';
import { diffTreeData } from '../features/tree-graph/api/tree-diff.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { scheduleIdle } from '../shared/lib/yield-to-paint.js';
import {
    consumeForumShellSnapshotAction,
    stashForumShellBeforeDialogAction,
} from './forum-store-actions.js';
import { prefetchConstructionOnIntent } from '../shell-lazy-init.js';
import { offerLocalCopyFromNetworkTreeForEditingAction } from './publishing-publish-interactive-store-actions.js';

function shell() {
    return getArboritoStore();
}

function warmConstructionShell() {
    void prefetchConstructionOnIntent();
}

/** Construction-mode undo/redo, forum-shell snapshot, and `toggleConstructionMode`. */

export function getConstructionUndoDepthAction() {
    const store = shell();
    if (!store) return undefined;

            store._flushPendingConstructionUndo?.();
            return store._constructionUndoStack?.length ?? 0;

}

export function getConstructionRedoDepthAction() {
    const store = shell();
    if (!store) return undefined;

            store._flushPendingConstructionUndo?.();
            return store._constructionRedoStack?.length ?? 0;

}

export function _cloneGraphSnapAction(snap) {
    const store = shell();
    if (!store) return undefined;

            if (snap == null) return snap;
            if (typeof structuredClone === 'function') {
                try {
                    return structuredClone(snap);
                } catch {
                    /* fall through */
                }
            }
            return JSON.parse(JSON.stringify(snap));

}

export function _flushPendingConstructionUndoAction() {
    const store = shell();
    if (!store) return undefined;

            const queued = store._pendingConstructionUndoQueue;
            if (!queued?.length) return;
            store._pendingConstructionUndoQueue = [];
            store._pendingConstructionUndoScheduled = false;
            try {
                for (const entry of queued) {
                    store._constructionUndoStack.push(store._makeConstructionHistoryEntry(entry.snap, entry.summary));
                }
                store._constructionRedoStack = [];
                while (store._constructionUndoStack.length > store._constructionUndoMax) {
                    store._constructionUndoStack.shift();
                }
                store.dispatchEvent(new CustomEvent('construction-undo-changed'));
            } catch {
                /* ignore */
            }

}

export function _scheduleConstructionUndoRecordAction(snap, summary) {
    const store = shell();
    if (!store) return undefined;

            if (!store._pendingConstructionUndoQueue) store._pendingConstructionUndoQueue = [];
            store._pendingConstructionUndoQueue.push({ snap, summary });
            if (store._pendingConstructionUndoScheduled) return;
            store._pendingConstructionUndoScheduled = true;
            scheduleIdle(() => {
                store._pendingConstructionUndoScheduled = false;
                store._flushPendingConstructionUndo();
            }, 80);

}

export function _constructionHistoryAuthorAction() {
    const store = shell();
    if (!store) return undefined;

            const g = store.state.gamification;
            const sess = store._authSession;
            const name = (g && g.username && String(g.username).trim()) || (sess && sess.username) || '';
            return name || (store.ui.conHistoryAnonymous || 'Editor');

}

export function _normalizeConstructionHistoryEntryAction(entry) {
    const store = shell();
    if (!store) return undefined;

            if (!entry) return null;
            if (entry.snap != null) return entry;
            return { snap: entry, at: Date.now(), by: '', summary: '' };

}

export function _constructionHistorySummaryAction(prevSnap, nextSnap) {
    const store = shell();
    if (!store) return undefined;

            if (!prevSnap || !nextSnap) return '';
            try {
                const d = diffTreeData(prevSnap, nextSnap);
                const ui = store.ui;
                const parts = [];
                if (d.counts.added) parts.push(`+${d.counts.added}`);
                if (d.counts.removed) parts.push(`-${d.counts.removed}`);
                if (d.counts.changed) parts.push(`~${d.counts.changed}`);
                if (!parts.length) return ui.conHistoryNoNodeChanges || 'No structural changes';
                return parts.join(' ');
            } catch {
                return '';
            }

}

export function _makeConstructionHistoryEntryAction(snap, summary = '') {
    const store = shell();
    if (!store) return undefined;

            return {
                snap: store._cloneGraphSnap(snap),
                at: Date.now(),
                by: store._constructionHistoryAuthor(),
                summary: summary || ''
            };

}

export function getConstructionHistoryTimelineAction() {
    const store = shell();
    if (!store) return undefined;

            store._flushPendingConstructionUndo?.();
            const undo = (store._constructionUndoStack || [])
                .map((e) => store._normalizeConstructionHistoryEntry(e))
                .filter(Boolean);
            const current = {
                snap: store.state.rawGraphData,
                at: Date.now(),
                by: store._constructionHistoryAuthor(),
                summary: '',
                isCurrent: true
            };
            const redo = (store._constructionRedoStack || [])
                .map((e) => store._normalizeConstructionHistoryEntry(e))
                .filter(Boolean)
                .reverse();
            return { states: [...undo, current, ...redo], currentIndex: undo.length };

}

export function undoConstructionEditAction() {
    const store = shell();
    if (!store) return undefined;

            store._flushPendingConstructionUndo?.();
            const raw = store._constructionUndoStack?.pop();
            if (!raw) return false;
            const snap = store._normalizeConstructionHistoryEntry(raw).snap;
            store._constructionUndoApplying = true;
            try {
                // Push current state to redo stack
                store._constructionRedoStack.push(
                    store._makeConstructionHistoryEntry(
                        store.state.rawGraphData,
                        store._constructionHistorySummary(snap, store.state.rawGraphData)
                    )
                );
                while (store._constructionRedoStack.length > store._constructionUndoMax) {
                    store._constructionRedoStack.shift();
                }

                const next = store._cloneGraphSnap(snap);
                DataProcessor.process(store, next, store.state.activeSource, { suppressReadmeAutoOpen: true });
                store.dispatchEvent(new CustomEvent('construction-undo-changed'));
                return true;
            } finally {
                store._constructionUndoApplying = false;
            }

}

export function redoConstructionEditAction() {
    const store = shell();
    if (!store) return undefined;

            store._flushPendingConstructionUndo?.();
            const raw = store._constructionRedoStack?.pop();
            if (!raw) return false;
            const snap = store._normalizeConstructionHistoryEntry(raw).snap;
            store._constructionUndoApplying = true;
            try {
                // Push current state back to undo stack
                store._constructionUndoStack.push(
                    store._makeConstructionHistoryEntry(
                        store.state.rawGraphData,
                        store._constructionHistorySummary(store.state.rawGraphData, snap)
                    )
                );
                while (store._constructionUndoStack.length > store._constructionUndoMax) {
                    store._constructionUndoStack.shift();
                }

                const next = store._cloneGraphSnap(snap);
                DataProcessor.process(store, next, store.state.activeSource, { suppressReadmeAutoOpen: true });
                store.dispatchEvent(new CustomEvent('construction-undo-changed'));
                return true;
            } finally {
                store._constructionUndoApplying = false;
            }

}

export function clearConstructionUndoStackAction() {
    const store = shell();
    if (!store) return undefined;

            store._pendingConstructionUndoQueue = [];
            store._pendingConstructionUndoScheduled = false;
            store._constructionUndoStack = [];
            store._constructionRedoStack = [];
            store.dispatchEvent(new CustomEvent('construction-undo-changed'));

}

export function canOpenConstructionAction() {
    const store = shell();
    if (!store) return undefined;

            if (fileSystem.isLocal) return true;
            if (!fileSystem.isNostrTreeSource()) return false;
            if (typeof store.getMyTreeNetworkRole !== 'function') return false;
            const r = store.getMyTreeNetworkRole();
            return r === 'owner' || r === 'editor' || r === 'proposer';

}

export function canEditInConstructionAction() {
    const store = shell();
    if (!store) return undefined;

            if (fileSystem.features.canWrite) return true;
            if (fileSystem.isLocal) return false;
            return store.canOpenConstruction();

}

export async function toggleConstructionModeAction() {
    const store = shell();
    if (!store) return undefined;

            if (store._constructionToggleInFlight) return;
            store._constructionToggleInFlight = true;
            try {
                const willEnable = !store.state.constructionMode;
                if (willEnable) {
                    warmConstructionShell();

                    if (!store.state.rawGraphData) {
                        const ui = store.ui;
                        store.notify(
                            ui.constructionRequiresTree ||
                                'Open or create a course first (Trees & libraries).',
                            true
                        );
                        if (!store.state.modal) {
                            store.setModal({ type: 'sources' });
                        }
                        return;
                    }
                    const networkRole =
                        typeof store.getMyTreeNetworkRole === 'function'
                            ? store.getMyTreeNetworkRole()
                            : null;
                    if (!fileSystem.features.canWrite && networkRole !== 'proposer') {
                        await offerLocalCopyFromNetworkTreeForEditingAction({ enterConstruction: true });
                        return;
                    }
                }
                if (willEnable && typeof store.hasAcceptedAuthorLicense === 'function' && !store.hasAcceptedAuthorLicense()) {
                    store.acceptAuthorLicense();
                }
                const enabling = willEnable;
                store.update({ constructionMode: enabling });
                if (!enabling) {
                    // Construction ended: if we are on a public tree and cloud sync is off,
                    // we may want to show a post-load banner now (non-blocking).
                    try {
                        store.maybeShowCloudSyncBannerForSource?.(store.state.activeSource);
                    } catch {
                        /* ignore */
                    }
                    const m = store.state.modal;
                    const t = typeof m === 'object' && m ? m.type : m;
                    if (
                        t === 'construction-curriculum-lang' ||
                        (t === 'pick-curriculum-lang' && m && typeof m === 'object' && m.fromConstructionLangModal)
                    ) {
                        store.setModal(null);
                    }
                    store.update({ curriculumEditLang: null });
                    if (store.state.rawGraphData?.languages && store.state.activeSource) {
                        DataProcessor.process(store, store.state.rawGraphData, store.state.activeSource, {
                            suppressReadmeAutoOpen: true
                        });
                    }
                } else {
                    if (!store.state.data && store.state.rawGraphData?.languages && store.state.activeSource) {
                        queueMicrotask(() => {
                            try {
                                DataProcessor.process(store, store.state.rawGraphData, store.state.activeSource, {
                                    suppressReadmeAutoOpen: true
                                });
                            } catch (e) {
                                console.error('toggleConstructionMode: rehydrate graph', e);
                                store.update({ loading: false });
                            }
                        });
                    }
                    // Start construction tour once (separate from the default UI tour).
                    queueMicrotask(() => {
                        try {
                            if (localStorage.getItem('arborito-ui-tour-done-construction')) return;
                        } catch {
                            /* ignore */
                        }
                        if (store.state.modal || store.state.previewNode || store.state.modalOverlay) return;
                        window.dispatchEvent(
                            new CustomEvent('arborito-start-tour', { detail: { source: 'construction-enter', mode: 'construction' } })
                        );
                    });
                }
            } catch (e) {
                console.error('[Arborito] toggleConstructionMode', e);
                const ui = store.ui || {};
                store.notify(
                    (ui.constructionModeError || 'Could not enter construction mode: {message}').replace(
                        /\{message\}/g,
                        String(e?.message || e)
                    ),
                    true
                );
            } finally {
                store._constructionToggleInFlight = false;
            }

}

/** Store.prototype, explicit actions (no bindStoreContext). */
export const storeConstructionUndoMethods = {
    getConstructionUndoDepth: getConstructionUndoDepthAction,
    getConstructionRedoDepth: getConstructionRedoDepthAction,
    _cloneGraphSnap: _cloneGraphSnapAction,
    _flushPendingConstructionUndo: _flushPendingConstructionUndoAction,
    _scheduleConstructionUndoRecord: _scheduleConstructionUndoRecordAction,
    _constructionHistoryAuthor: _constructionHistoryAuthorAction,
    _normalizeConstructionHistoryEntry: _normalizeConstructionHistoryEntryAction,
    _constructionHistorySummary: _constructionHistorySummaryAction,
    _makeConstructionHistoryEntry: _makeConstructionHistoryEntryAction,
    getConstructionHistoryTimeline: getConstructionHistoryTimelineAction,
    undoConstructionEdit: undoConstructionEditAction,
    redoConstructionEdit: redoConstructionEditAction,
    clearConstructionUndoStack: clearConstructionUndoStackAction,
    stashForumShellBeforeDialog: stashForumShellBeforeDialogAction,
    consumeForumShellSnapshot: consumeForumShellSnapshotAction,
    canOpenConstruction: canOpenConstructionAction,
    canEditInConstruction: canEditInConstructionAction,
    toggleConstructionMode: toggleConstructionModeAction,
};
