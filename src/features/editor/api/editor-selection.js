/** Toolbar roots; format/insert panels stay inline under the toggle. */
export const LESSON_EDITOR_TOOLBAR_SELECTOR =
    '#lesson-editor-format-panel, #lesson-editor-insert-panel, .arborito-lesson-actions--construct, .arborito-lesson-toolbar-clusters, .lesson-editor-format-wrap, .lesson-editor-insert-wrap';

export function isLessonEditorInsertControl(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest(
        '#btn-insert-quiz, #lesson-editor-insert-panel, .lesson-editor-insert-toggle, .lesson-editor-insert-panel__opt, .lesson-editor-toolbar-quiz, .lesson-editor-quiz-wrap'
    );
}

/** Dropdown toggles and touch presses must receive a full click (not preventDefault). */
export function isLessonEditorToolbarDropdownToggle(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest('.lesson-editor-format-toggle, .lesson-editor-insert-toggle');
}

/** Format/undo controls that must preserve the saved editor selection on press. */
export function isLessonEditorFormatToolbarControl(target) {
    if (!(target instanceof Element)) return false;
    if (isLessonEditorInsertControl(target)) return false;
    if (isLessonEditorToolbarDropdownToggle(target)) return false;
    if (!target.closest(LESSON_EDITOR_TOOLBAR_SELECTOR)) return false;
    return !!target.closest('button, .tool-btn, [role="menuitem"]');
}

export function isLessonEditorToolbarControl(target) {
    return isLessonEditorFormatToolbarControl(target) || isLessonEditorInsertControl(target);
}

/** @returns {boolean} */
export function isLessonEditorInsertPanelOpen() {
    const panel = document.getElementById('lesson-editor-insert-panel');
    return !!(panel && !panel.classList.contains('hidden'));
}

/** @returns {boolean} */
export function isLessonEditorFormatPanelOpen() {
    const panel = document.getElementById('lesson-editor-format-panel');
    return !!(panel && !panel.classList.contains('hidden'));
}

export function isLessonEditorToolbarPanelOpen() {
    return isLessonEditorFormatPanelOpen() || isLessonEditorInsertPanelOpen();
}

export function isLessonEditorToolbarFocused() {
    const active = document.activeElement;
    if (!(active instanceof Element)) return false;
    if (active.closest(LESSON_EDITOR_TOOLBAR_SELECTOR)) return true;
    return isLessonEditorFormatPanelOpen();
}

/**
 * True when a collapsed/no-op selectionchange should not replace a saved text range
 * (typical when the user tapped Bold/Aa/etc. after highlighting with a finger).
 */
export function shouldKeepSavedEditorSelection(editorEl, savedRange, nextRange) {
    if (!savedRange || savedRange.collapsed || !editorEl?.contains(savedRange.commonAncestorContainer)) {
        return false;
    }
    if (isLessonEditorToolbarPanelOpen()) return true;
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
