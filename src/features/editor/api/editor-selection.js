/** Toolbar roots — format/insert panels may portal to `document.body`. */
export const LESSON_EDITOR_TOOLBAR_SELECTOR =
    '#lesson-editor-format-panel, #lesson-editor-insert-panel, .arborito-lesson-actions--construct, .arborito-lesson-toolbar-clusters, .lesson-editor-format-wrap, .lesson-editor-insert-wrap';

export function isLessonEditorToolbarControl(target) {
    if (!(target instanceof Element)) return false;
    if (!target.closest(LESSON_EDITOR_TOOLBAR_SELECTOR)) return false;
    return !!target.closest('button, .tool-btn, .block-btn, [role="menuitem"]');
}

export function isLessonEditorToolbarFocused() {
    const active = document.activeElement;
    if (!(active instanceof Element)) return false;
    return !!active.closest(LESSON_EDITOR_TOOLBAR_SELECTOR);
}

/**
 * True when a collapsed/no-op selectionchange should not replace a saved text range
 * (typical when the user tapped Bold/Aa/etc. after highlighting with a finger).
 */
export function shouldKeepSavedEditorSelection(editorEl, savedRange, nextRange) {
    if (!savedRange || savedRange.collapsed || !editorEl?.contains(savedRange.commonAncestorContainer)) {
        return false;
    }
    if (!nextRange) return isLessonEditorToolbarFocused();
    if (!nextRange.collapsed) return false;
    if (editorEl.contains(nextRange.commonAncestorContainer)) {
        return isLessonEditorToolbarFocused();
    }
    return isLessonEditorToolbarFocused();
}

/**
 * Snapshot the current in-editor selection (prefer non-collapsed ranges).
 */
export function captureEditorSelection(editorEl, savedRangeRef) {
    if (!editorEl || !savedRangeRef) return;
    try {
        const sel = window.getSelection();
        if (!(sel && sel.rangeCount)) return;
        const r = sel.getRangeAt(0);
        if (!editorEl.contains(r.commonAncestorContainer)) return;
        if (!r.collapsed) {
            savedRangeRef.current = r.cloneRange();
            return;
        }
        const saved = savedRangeRef.current;
        if (saved && !saved.collapsed && editorEl.contains(saved.commonAncestorContainer)) {
            return;
        }
        savedRangeRef.current = r.cloneRange();
    } catch {
        /* ignore */
    }
}

export function restoreEditorSelection(editorEl, savedRangeRef) {
    const saved = savedRangeRef?.current;
    if (!saved || !editorEl?.isConnected) return false;
    try {
        if (!editorEl.contains(saved.commonAncestorContainer)) return false;
        const sel = window.getSelection();
        if (!sel) return false;
        sel.removeAllRanges();
        sel.addRange(saved.cloneRange());
        return true;
    } catch {
        return false;
    }
}
