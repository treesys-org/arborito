import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { patchTreeGraphSlice } from '../../../stores/tree-graph-store.js';

/**
 * Soft mount from Biblioteca “Añadir” / open: close the catalog early and show
 * trunk + root comic bubble on the graph until the first structure paints —
 * never the heavy green “Cargando árbol…” block card.
 * Clears the canvas synchronously so chrome paints on the same click (no network wait).
 */
export function beginBibliotecaSoftMount() {
    store._bibliotecaSoftMount = true;
    const patch = {
        bibliotecaSoftMount: true,
        treeHydrating: true,
        treeGrowingOverlay: false,
        treeGrowingHint: null,
        data: null,
        rawGraphData: null,
        path: [],
        selectedNode: null,
        previewNode: null,
    };
    try {
        store.update(patch);
    } catch {
        /* ignore */
    }
    patchTreeGraphSlice({
        bibliotecaSoftMount: true,
        treeHydrating: true,
        data: null,
        rawGraphData: null,
    });
}

export function endBibliotecaSoftMount() {
    store._bibliotecaSoftMount = false;
    try {
        store.update({ bibliotecaSoftMount: false });
    } catch {
        /* ignore */
    }
    patchTreeGraphSlice({ bibliotecaSoftMount: false });
    /* Soft-mount just painted — kick the shell tour without waiting for another mount tick. */
    queueMicrotask(() => {
        try {
            store.maybeScheduleShellProductTourAfterTree?.();
        } catch {
            /* ignore */
        }
    });
}

export function isBibliotecaSoftMount() {
    return !!(store._bibliotecaSoftMount || store.state?.bibliotecaSoftMount);
}

/**
 * Biblioteca modal open from React state only (not sticky panel refs — those
 * unregister after paint and would wrongly hold suppress flags for a frame).
 * @param {{ state?: object, value?: object, modal?: unknown }|null|undefined} [s]
 */
export function isBibliotecaModalOpen(s = store) {
    const m = s?.modal ?? s?.state?.modal ?? s?.value?.modal;
    return !!(m === 'sources' || (typeof m === 'object' && m && m.type === 'sources'));
}

/**
 * Biblioteca UI is open: desktop/web modal, or mobile More-menu embed
 * (`ModalSources` mounted — `store.state.modal` is often not `'sources'` there).
 * @param {{ state?: object, value?: object }|null|undefined} [s]
 */
export function isBibliotecaUiOpen(s = store) {
    if (isBibliotecaModalOpen(s)) return true;
    return !!getPanelRef('modal-sources');
}

/**
 * True while Biblioteca is open OR a soft mount from Añadir is in flight —
 * suppresses the heavy blocking “Cargando árbol…” card (graph comic handles the wait).
 */
export function shouldSuppressTreeGrowingBlock(s = store) {
    return isBibliotecaSoftMount() || isBibliotecaUiOpen(s);
}

/**
 * Biblioteca was opened from onboarding/welcome (`modal.fromOnboarding`).
 * Used by auth/sources flows that treat welcome-load specially.
 */
export function isSourcesWelcomeLoadClose() {
    const m = store.state?.modal ?? store.value?.modal;
    return !!(m && typeof m === 'object' && m.fromOnboarding);
}

/** Snapshot whether a curriculum was mounted before a Biblioteca load action. */
export function captureHadCurriculumBeforeLoad() {
    const s = store.state ?? store.value;
    return !!s?.data;
}

/**
 * After a successful load/plant/import in Biblioteca: close and show the canvas.
 * Soft-mount / Abrir·Añadir must leave Bosque on the same click — no dismiss gates.
 * @param {{ close?: (opts?: object) => void, updateContent?: () => void, isConnected?: boolean }} [modal]
 * @param {{ hadCurriculumBeforeLoad?: boolean }} [_opts] kept for call-site compat
 */
export function finishSourcesLoadSession(modal, _opts = {}) {
    try {
        if (modal && modal.isConnected !== false && typeof modal.close === 'function') {
            modal.close({ returnToMore: false });
        }
    } catch {
        /* ignore */
    }
    try {
        store.dismissModal({ returnToMore: false });
    } catch {
        /* ignore */
    }
    try {
        getPanelRef('sidebar')?.closeMobileMenuIfOpen?.();
    } catch {
        /* ignore */
    }
}
