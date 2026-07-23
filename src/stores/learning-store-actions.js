import { getArboritoStore } from '../core/store-singleton.js';
import { ensureConnectedAI } from '../shared/lib/connected-services/index.js';

/**
 * Apply a learning patch to the singleton (syncs slices via `store.update`).
 * @param {Record<string, unknown>} partial
 */
export function commitLearningState(partial) {
    const store = getArboritoStore();
    if (!store || !partial) return;
    store.update(partial);
}

export function closePreviewAction() {
    commitLearningState({ previewNode: null });
}

export async function enterLessonAction() {
    const store = getArboritoStore();
    if (!store) return;
    const node = store.state.previewNode;
    if (!node) return;
    const current = store.state.selectedNode;
    if (
        current &&
        (current.type === 'leaf' || current.type === 'exam') &&
        String(current.id) !== String(node.id)
    ) {
        if (typeof store.confirmLeaveActiveQuizIfNeeded === 'function') {
            const ok = await store.confirmLeaveActiveQuizIfNeeded();
            if (!ok) return;
        }
    }
    if (!node.content && (node.contentPath || (node.treeLazyContent && node.treeContentKey))) {
        await loadNodeContentAction(node);
        commitLearningState({ selectedNode: node, previewNode: null });
    } else {
        commitLearningState({ selectedNode: node, previewNode: null });
    }
}

export async function closeContentAction(opts = {}) {
    const store = getArboritoStore();
    if (!store) return;
    /* Callers that already ran confirmLeaveIfNeeded must pass skipConfirm to avoid a second dialog. */
    if (!opts.skipConfirm && typeof store.confirmLeaveActiveQuizIfNeeded === 'function') {
        const ok = await store.confirmLeaveActiveQuizIfNeeded();
        if (!ok) return;
    }
    commitLearningState({ selectedNode: null });
}

export async function loadNodeContentAction(node) {
    const store = getArboritoStore();
    if (!store?.graphLogic) return undefined;
    return store.graphLogic.loadNodeContent(node);
}

export async function initSageAction() {
    const store = getArboritoStore();
    if (!store) return undefined;
    const ai = await ensureConnectedAI(store);
    return ai ? ai.initSage() : undefined;
}

export function abortSageAction() {
    const store = getArboritoStore();
    if (store?._aiLogic) return store._aiLogic.abortSage();
}

export function clearSageChatAction() {
    const store = getArboritoStore();
    if (store?._aiLogic) return store._aiLogic.clearSageChat();
}

/**
 * Drop Sage chat + nav focus when the loaded curriculum source changes.
 * Safe if AILogic was never opened (patches `state.ai` directly).
 * @param {import('../core/store.js').Store | null | undefined} [store]
 */
export function resetSageChatForSourceChange(store = getArboritoStore()) {
    if (!store) return;
    if (store._aiLogic) {
        store._aiLogic.clearSageChat();
        return;
    }
    const prev = store.state?.ai || {};
    const msgs = Array.isArray(prev.messages) ? prev.messages : [];
    const hasUserTurn = msgs.some((m) => m && m.role === 'user');
    if (!hasUserTurn && !prev.sageNavFocus && !prev.pendingConstructionProposal) return;
    const hello = store.ui?.sageHello;
    store.update({
        ai: {
            ...prev,
            messages: hello ? [{ role: 'assistant', content: hello }] : [],
            status: prev.status === 'loading' ? 'ready' : prev.status || 'idle',
            progress: null,
            pendingConstructionProposal: null,
            lastConstructionAction: null,
            sageNavFocus: null,
            voiceReply: false,
        },
    });
}

export async function chatWithSageAction(userText) {
    const store = getArboritoStore();
    if (!store) return undefined;
    const ai = await ensureConnectedAI(store);
    return ai ? ai.chatWithSage(userText) : undefined;
}

/** Store.prototype, learning content panel. */
export const storeLearningContentMethods = {
    loadNodeContent: loadNodeContentAction,
    enterLesson: enterLessonAction,
    closeContent: closeContentAction,
    closePreview: closePreviewAction,
};

/** Store.prototype, Sage / AI. */
export const storeLearningSageMethods = {
    initSage: initSageAction,
    abortSage: abortSageAction,
    clearSageChat: clearSageChatAction,
    chatWithSage: chatWithSageAction,
};

/** Learning domain actions for hooks. */
export const learningContentActions = {
    loadNodeContent: loadNodeContentAction,
    enterLesson: enterLessonAction,
    closeContent: closeContentAction,
    closePreview: closePreviewAction,
    initSage: initSageAction,
    abortSage: abortSageAction,
    clearSageChat: clearSageChatAction,
    chatWithSage: chatWithSageAction,
};
