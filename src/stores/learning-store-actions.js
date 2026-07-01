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

export function enterLessonAction() {
    const store = getArboritoStore();
    if (!store) return;
    const node = store.state.previewNode;
    if (!node) return;
    if (!node.content && (node.contentPath || (node.treeLazyContent && node.treeContentKey))) {
        loadNodeContentAction(node).then(() => {
            commitLearningState({ selectedNode: node, previewNode: null });
        });
    } else {
        commitLearningState({ selectedNode: node, previewNode: null });
    }
}

export function closeContentAction() {
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

export async function chatWithSageAction(userText) {
    const store = getArboritoStore();
    if (!store) return undefined;
    const ai = await ensureConnectedAI(store);
    return ai ? ai.chatWithSage(userText) : undefined;
}

/** Store.prototype — learning content panel. */
export const storeLearningContentMethods = {
    loadNodeContent: loadNodeContentAction,
    enterLesson: enterLessonAction,
    closeContent: closeContentAction,
    closePreview: closePreviewAction,
};

/** Store.prototype — Sage / AI. */
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
