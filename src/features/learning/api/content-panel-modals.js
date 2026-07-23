import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { clearLessonDraft } from '../../editor/api/logic/lesson-draft-persist.js';
import { isExamLesson } from './exam-context.js';
import { hasActiveQuizInProgress, hasExamAttemptInProgress } from './content-panel-quiz.js';

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
            { id: 'discard', label: ui.confirmUnsavedLessonDiscard || "Don't save" },
            { id: 'save', label: ui.confirmUnsavedLessonSave || ui.lessonSave || 'Save lesson' },
        ],
        hideCancel: true,
    });
    if (choice == null) return 'cancel';
    if (choice === 'save') {
        if (typeof saveLesson === 'function') await saveLesson();
        /* Still dirty after Save (validation failed, TOC/meta draft, DOM) → stay. */
        if (ctx.isLessonDirty?.()) return 'cancel';
        const edDirty =
            typeof ctx.getEditorEl === 'function' &&
            ctx.getEditorEl()?.dataset?.arboritoEditorDirty === '1';
        if (edDirty) return 'cancel';
        return 'proceed';
    }
    if (choice === 'discard') {
        const node = ctx.currentNode;
        const sourceId = store.value.activeSource?.id;
        if (node?.id != null && sourceId != null) {
            clearLessonDraft(
                sourceId,
                node.id,
                store.getCurrentContentLangKey?.() ||
                    store.value.curriculumEditLang ||
                    store.value.lang
            );
        }
        if (typeof ctx.onDiscardLessonEdits === 'function') {
            ctx.onDiscardLessonEdits();
        }
        return 'proceed';
    }
    return 'cancel';
}

/** @returns {Promise<boolean>} */
async function confirmActiveQuizLeave(ctx) {
    const inQuiz =
        typeof ctx.hasActiveQuizInProgress === 'function'
            ? ctx.hasActiveQuizInProgress()
            : hasActiveQuizInProgress(ctx);
    const inExam =
        typeof ctx.hasExamAttemptInProgress === 'function'
            ? ctx.hasExamAttemptInProgress()
            : hasExamAttemptInProgress(ctx);
    if (!inQuiz && !inExam) return true;
    const isExam = ctx.currentNode && isExamLesson(ctx.currentNode);
    const msg =
        isExam && inExam
            ? store.ui.confirmLeaveActiveExam ||
              'Leave the exam? You will lose this attempt\u2019s progress.'
            : store.ui.confirmLeaveActiveQuiz ||
              'Leave the quiz? You will lose this attempt\u2019s progress.';
    return store.confirm(msg);
}

/** Prevents stacked leave dialogs from double-tap / duplicate handlers. */
let leaveConfirmInFlight = null;

/** Store-mediated dialogs/modals. */
export async function confirmLeaveIfNeeded(ctx, { saveLesson } = {}) {
    if (leaveConfirmInFlight) return leaveConfirmInFlight;
    leaveConfirmInFlight = (async () => {
        try {
            const lesson = await confirmUnsavedLessonEdits(ctx, { saveLesson });
            if (lesson !== 'proceed') return false;
            return confirmActiveQuizLeave(ctx);
        } finally {
            leaveConfirmInFlight = null;
        }
    })();
    return leaveConfirmInFlight;
}

/** Electron window close, same flow as confirmLeaveIfNeeded. */
export async function resolveAppCloseIfNeeded(ctx, opts = {}) {
    const ok = await confirmLeaveIfNeeded(ctx, opts);
    return ok ? 'proceed' : 'cancel';
}

export async function launchInlineGame(ctx, url, title, topics) {
    const u = String(url || '').trim();
    if (!u) return;

    try {
        const { isMediaSrcBlocked, persistMediaOriginsConsent } = await import(
            '../../privacy-gdpr/api/third-party-media.js'
        );
        if (isMediaSrcBlocked(u)) {
            const ui = store.ui;
            const ok = await store.confirm(
                ui.mediaConsentGameBody ||
                    ui.inlineGameWarning ||
                    'This game loads third-party content. Allow this site for lesson media?',
                ui.mediaConsentTitle || 'External content'
            );
            if (!ok) return;
            try {
                const origin = new URL(u, typeof window !== 'undefined' ? window.location.href : undefined)
                    .origin;
                persistMediaOriginsConsent([origin], true);
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* ignore */
    }

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
    const content = String(n.content ?? '');
    let h = 2166136261;
    for (let i = 0; i < content.length; i++) {
        h ^= content.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return [
        n.id,
        store.isCompleted(n.id) ? 1 : 0,
        detail.activeSource?.id ?? '',
        detail.constructionMode ? 1 : 0,
        detail.theme ?? '',
        detail.lang ?? '',
        content.length,
        h >>> 0
    ].join('|');
}
