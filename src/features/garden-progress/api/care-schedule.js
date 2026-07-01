/**
 * Cuidados: mapeo resultado de cuestionario → calidad SM-2 (0–5).
 */

import { lessonContentHasCompleteQuiz } from '../../learning/api/quiz-status.js';

function mapQuizRateToQuality(rate) {
    const r = Math.max(0, Math.min(1, Number(rate) || 0));
    if (r <= 0) return 1;
    if (r < 0.35) return 2;
    if (r < 0.65) return 3;
    if (r < 1) return 4;
    return 5;
}

/**
 * @param {import('../../../core/store.js' ).default} store
 */
export function updateCareFromQuiz(store, nodeId, correct, total) {
    if (!nodeId || total <= 0) return null;
    const node = typeof store.findNode === 'function' ? store.findNode(nodeId) : null;
    if (!node) return null;
    const quality = mapQuizRateToQuality(correct / total);
    store.userStore.reportMemory(nodeId, quality);
    return store.userStore.getMemoryStatus(nodeId);
}

/**
 * @param {import('../../../core/store.js' ).default} store
 */
export function updateCareOnLessonCompleteFallback(store, nodeId) {
    if (!nodeId) return;
    const node = typeof store.findNode === 'function' ? store.findNode(nodeId) : null;
    if (!node) return;
    if (lessonContentHasCompleteQuiz(node.content || '')) return;
    store.userStore.reportMemory(nodeId, 4);
}
