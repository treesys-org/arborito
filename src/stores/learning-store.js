import { createArboritoStore } from './create-store.js';
import { useStore } from 'zustand';
import { getArboritoStore } from '../core/store-singleton.js';
import { patchStoreSlice } from './sync-shallow.js';
import {
    closeContentAction,
    closePreviewAction,
    enterLessonAction,
    learningContentActions,
} from './learning-store-actions.js';
import { findNodeAction, navigateToAction } from './tree-graph-store-actions.js';
import { requestGoHomeAction } from './shell-ui-store-actions.js';

const DEFAULT_AI = { status: 'idle', progress: '', messages: [] };

function learningAiEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
        a.status === b.status &&
        a.progress === b.progress &&
        a.messages === b.messages &&
        a.contextMode === b.contextMode &&
        a.voiceReply === b.voiceReply
    );
}

/**
 * Piloto Zustand, slice de aprendizaje / Sage (desacoplado gradualmente de core/store).
 * Se sincroniza desde el snapshot global en syncReactSnapshot().
 */
export const learningStore = createArboritoStore(() => ({
    ai: { ...DEFAULT_AI },
    selectedNode: null,
    previewNode: null,
    path: [],
    lessonOpenHint: null,
}));

/** @param {Record<string, unknown>} snap, reactStateStore snapshot */
export function syncLearningStoreFromSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    const prev = learningStore.getState();
    const ai = snap.ai && typeof snap.ai === 'object' ? snap.ai : DEFAULT_AI;
    const nextAi = {
        status: ai.status ?? DEFAULT_AI.status,
        progress: ai.progress ?? DEFAULT_AI.progress,
        messages: Array.isArray(ai.messages) ? ai.messages : DEFAULT_AI.messages,
        ...(ai.contextMode != null ? { contextMode: ai.contextMode } : {}),
        ...(ai.voiceReply != null ? { voiceReply: ai.voiceReply } : {}),
    };
    patchStoreSlice(learningStore, {
        ai: learningAiEqual(prev.ai, nextAi) ? prev.ai : nextAi,
        selectedNode: snap.selectedNode ?? null,
        previewNode: snap.previewNode ?? null,
        path: Array.isArray(snap.path) ? snap.path : [],
        lessonOpenHint: snap.lessonOpenHint ?? null,
    });
}

export function useLearningSlice(selector) {
    return useStore(learningStore, selector);
}

/** Actualización síncrona del slice (p. ej. streaming Sage entre microtasks del singleton). */
export function patchLearningSlice(partial) {
    if (!partial || typeof partial !== 'object') return;
    learningStore.setState(partial);
}

export { closeContentAction, commitLearningState, closePreviewAction, enterLessonAction } from './learning-store-actions.js';

function storeCall(method) {
    return (...args) => {
        const store = getArboritoStore();
        if (!store) return undefined;
        const fn = store[method];
        return typeof fn === 'function' ? fn.call(store, ...args) : undefined;
    };
}

/** Learning actions, `learning-store-actions.js` (no prototype indirection). */
export const learningActions = {
    initSage: learningContentActions.initSage,
    abortSage: learningContentActions.abortSage,
    clearSageChat: learningContentActions.clearSageChat,
    chatWithSage: learningContentActions.chatWithSage,
    loadNodeContent: learningContentActions.loadNodeContent,
    openSageModal: storeCall('openSageModal'),
    enterLesson: enterLessonAction,
    closeContent: closeContentAction,
    closePreview: closePreviewAction,
    findNode: findNodeAction,
    navigateTo: navigateToAction,
    getBookmark: storeCall('getBookmark'),
    saveBookmark: storeCall('saveBookmark'),
    removeBookmark: storeCall('removeBookmark'),
    markComplete: storeCall('markComplete'),
    isCompleted: storeCall('isCompleted'),
    nostrCreateChild: storeCall('nostrCreateChild'),
    requestGoHome: requestGoHomeAction,
    toggleConstructionMode: storeCall('toggleConstructionMode'),
};
