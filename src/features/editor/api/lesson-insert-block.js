import { insertBlockInEditor, insertMathSymbolInEditor, rememberMathLatexInput } from './editor-commands.js';
import { restoreEditorSelection } from './editor-selection.js';
import { markConstructBodyEdited } from './logic/lesson-construct-capture.js';

export const LESSON_INSERT_BLOCK_EVENT = 'arborito-lesson-insert-block';

/** @type {{ editorRef?: { current: HTMLElement | null }, lessonEditor?: object, patchPanel?: (p: object) => void, panel?: object }} */
let insertContext = {};

export function setLessonInsertContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return;
    insertContext = { ...insertContext, ...ctx };
}

export function getLessonInsertContext() {
    return insertContext;
}

/** @param {string} type */
export function dispatchLessonInsertBlock(type) {
    const t = String(type || '').trim();
    if (!t || typeof window === 'undefined') return;
    performLessonInsertBlock(t, insertContext);
}

export function resolveLessonEditorEl(editorRef) {
    const fromRef = editorRef?.current;
    if (fromRef?.isConnected) return fromRef;
    const byId = document.getElementById('lesson-visual-editor');
    return byId?.isConnected ? byId : fromRef || byId || null;
}

function insertTypeFromButton(btn) {
    if (!(btn instanceof Element)) return '';
    if (btn.id === 'btn-insert-quiz') return 'quiz';
    const sym = btn.getAttribute('data-math-char');
    if (sym) return `math-symbol:${sym}`;
    return String(btn.getAttribute('data-type') || '').trim();
}

export function isLessonInsertToolbarButton(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('.lesson-editor-insert-panel__opt, .lesson-editor-math-symbol, #btn-insert-quiz');
}

/** @param {string} type @param {object} ctx */
export function performLessonInsertBlock(type, ctx) {
    const t = String(type || '').trim();
    if (!t) return false;
    const editorEl = resolveLessonEditorEl(ctx?.editorRef);
    if (!editorEl) return false;
    const lessonEditor = ctx?.lessonEditor;
    const markEdited = () =>
        markConstructBodyEdited(editorEl, {
            markUserEdited: () => lessonEditor?.markUserEdited?.(),
        });

    if (t.startsWith('math-symbol:')) {
        const symbol = t.slice('math-symbol:'.length);
        lessonEditor?.pushHistory?.(editorEl);
        /* insertMathSymbolInEditor prefers the last focused formula textarea. */
        insertMathSymbolInEditor(editorEl, symbol);
        markEdited();
        return true;
    }

    lessonEditor?.pushHistory?.(editorEl);
    restoreEditorSelection(editorEl, lessonEditor?.savedRangeRef);
    editorEl.focus({ preventScroll: true });
    restoreEditorSelection(editorEl, lessonEditor?.savedRangeRef);
    insertBlockInEditor(editorEl, t);
    markEdited();
    return true;
}

function closeInsertPanel() {
    try {
        window.dispatchEvent(new CustomEvent('arborito-lesson-insert-panel-close'));
    } catch {
        /* ignore */
    }
    const panel = document.getElementById('lesson-editor-insert-panel');
    if (panel) panel.classList.add('hidden');
}

function onMathLatexFocusIn(ev) {
    const t = ev.target;
    if (!(t instanceof HTMLTextAreaElement) || !t.classList.contains('math-latex-input')) return;
    const editorEl = t.closest('#lesson-visual-editor') || document.getElementById('lesson-visual-editor');
    if (editorEl instanceof HTMLElement) rememberMathLatexInput(editorEl, t);
}

/** Document-level insert (toolbar buttons may portal outside React tree). */
export function bindLessonInsertToolbarDelegation(getCtx = getLessonInsertContext) {
    let lastAt = 0;
    const fire = (ev) => {
        const btn = isLessonInsertToolbarButton(ev.target);
        if (!btn) return;
        const type = insertTypeFromButton(btn);
        if (!type) return;
        const now = Date.now();
        if (now - lastAt < 400) return;
        lastAt = now;
        ev.preventDefault();
        ev.stopPropagation();
        const ctx = typeof getCtx === 'function' ? getCtx() : getCtx;
        if (!performLessonInsertBlock(type, ctx)) return;
        closeInsertPanel();
    };
    document.addEventListener('pointerup', fire, true);
    document.addEventListener('click', fire, true);
    document.addEventListener('focusin', onMathLatexFocusIn, true);
    return () => {
        document.removeEventListener('pointerup', fire, true);
        document.removeEventListener('click', fire, true);
        document.removeEventListener('focusin', onMathLatexFocusIn, true);
    };
}

let unbindLessonInsertDelegation = null;

export function ensureLessonInsertToolbarDelegation() {
    if (unbindLessonInsertDelegation || typeof document === 'undefined') return;
    unbindLessonInsertDelegation = bindLessonInsertToolbarDelegation(getLessonInsertContext);
}
