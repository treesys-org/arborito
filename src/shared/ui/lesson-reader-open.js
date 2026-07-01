/**
 * Lesson reader open — single rule for Sage chrome consolidation.
 * When a leaf/exam is focused, Sage entry lives only in LessonHeader (`btn-ask-sage`).
 * Global FAB / dock / construction-dock Sage hide via `arborito-lesson-reader-open` on `<html>`.
 */

/**
 * @param {{ state?: object, selectedNode?: object, previewNode?: object }|object|null|undefined} storeOrState
 */
export function isLessonReaderOpen(storeOrState) {
    const s = storeOrState?.state ?? storeOrState;
    if (!s || typeof s !== 'object') return false;
    const node = s.selectedNode || s.previewNode;
    return !!(node && (node.type === 'leaf' || node.type === 'exam'));
}

/**
 * @param {{ state?: object }|object|null|undefined} store
 */
export function syncLessonReaderChromeClass(store) {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('arborito-lesson-reader-open', isLessonReaderOpen(store));
}
