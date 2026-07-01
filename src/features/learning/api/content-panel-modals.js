import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { isExamLesson } from './exam-context.js';

/**
 * Save · Don't save · Cancel when lesson has unsaved construct edits.
 * @returns {Promise<'proceed'|'cancel'>}
 */
async function confirmUnsavedLessonEdits(ctx, { saveLesson } = {}) {
    if (!ctx.isLessonConstructEdit?.() || !ctx.isLessonDirty?.()) {
        return 'proceed';
    }
    const ui = store.ui;
    const choice = await store.showDialog({
        type: 'choice',
        title: ui.confirmUnsavedLessonCloseTitle || 'Unsaved changes',
        body:
            ui.confirmUnsavedLessonCloseBody ||
            'You have unsaved changes in this lesson. Save before closing?',
        choices: [
            { id: 'save', label: ui.confirmUnsavedLessonSave || ui.lessonSave || 'Save lesson' },
            { id: 'discard', label: ui.confirmUnsavedLessonDiscard || "Don't save" }
        ],
        cancelText: ui.cancel || 'Cancel'
    });
    if (choice == null) return 'cancel';
    if (choice === 'save') {
        if (typeof saveLesson === 'function') await saveLesson();
        if (ctx.isLessonDirty?.()) return 'cancel';
        return 'proceed';
    }
    if (choice === 'discard') return 'proceed';
    return 'cancel';
}

/** @returns {Promise<boolean>} */
async function confirmActiveQuizLeave(ctx) {
    if (!ctx.hasActiveQuizInProgress()) return true;
    const isExam = ctx.currentNode && isExamLesson(ctx.currentNode);
    const msg = isExam
        ? store.ui.confirmLeaveActiveExam ||
          'Leave the exam? You will lose this attempt\u2019s progress.'
        : store.ui.confirmLeaveActiveQuiz ||
          'Leave the quiz? You will lose this attempt\u2019s progress.';
    return store.confirm(msg);
}

/** Store-mediated dialogs/modals (from legacy modal-dispatch-mixin). */
export async function confirmLeaveIfNeeded(ctx, { saveLesson } = {}) {
    const lesson = await confirmUnsavedLessonEdits(ctx, { saveLesson });
    if (lesson !== 'proceed') return false;
    return confirmActiveQuizLeave(ctx);
}

/** Electron window close — same flow as confirmLeaveIfNeeded. */
export async function resolveAppCloseIfNeeded(ctx, opts = {}) {
    const ok = await confirmLeaveIfNeeded(ctx, opts);
    return ok ? 'proceed' : 'cancel';
}

export async function launchInlineGame(ctx, url, title, topics) {
    const u = String(url || '').trim();
    if (!u) return;

    try {
        const hideKey = 'arborito-inline-game-warning-hide';
        const alreadyHidden = localStorage.getItem(hideKey) === 'true';
        if (!alreadyHidden) {
            const ui = store.ui;
            const msg =
                ui.inlineGameWarning ||
                'You are about to load an external game that may include third-party content. Continue? (This notice will not be shown again.)';
            const ok = await store.confirm(msg);
            if (!ok) return;
            localStorage.setItem(hideKey, 'true');
        }
    } catch {
        /* ignore */
    }

    const activeSource = store.value.activeSource;
    if (!activeSource) {
        store.notify(store.ui.errorNoContent || 'No active source selected.', true);
        return;
    }
    const lang = store.value.lang || 'EN';
    const node = ctx.currentNode;
    const parent = node?.parentId ? store.findNode(node.parentId) : null;
    const moduleId =
        parent && (parent.type === 'branch' || parent.type === 'root') ? parent.id : (node?.id || null);
    if (!moduleId) {
        store.notify(store.ui.gameScopeMissing || store.ui.errorNoContent || 'Could not resolve module for this game.', true);
        return;
    }
    const targetNode = store.findNode(moduleId);
    const modulePath = targetNode?.apiPath || targetNode?.contentPath || '';
    const treeUrl = encodeURIComponent(activeSource.url);
    const encodedPath = encodeURIComponent(modulePath);

    let finalUrl = u;
    const separator = finalUrl.includes('?') ? '&' : '?';
    finalUrl += `${separator}source=${treeUrl}&lang=${lang}`;
    if (encodedPath) finalUrl += `&module=${encodedPath}`;
    finalUrl += `&moduleId=${encodeURIComponent(String(moduleId))}`;
    const topicIds = Array.isArray(topics)
        ? topics.map((t) => String(t).trim()).filter(Boolean)
        : String(topics || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
    if (topicIds.length > 0) {
        finalUrl += `&topics=${encodeURIComponent(topicIds.join(','))}`;
    }

    store.setModal({
        type: 'game-player',
        url: finalUrl,
        title: title || store.ui.gameDefaultTitle,
        moduleId,
        gameEntryUrl: u,
        aiMode: 'static'
    });
}

export function lessonStoreFingerprint(currentNode, detail) {
    const n = currentNode;
    if (!n) return '';
    return [
        n.id,
        store.isCompleted(n.id) ? 1 : 0,
        detail.activeSource?.id ?? '',
        detail.constructionMode ? 1 : 0,
        detail.theme ?? '',
        detail.lang ?? ''
    ].join('|');
}
