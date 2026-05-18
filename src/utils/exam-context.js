/**
 * Exam nodes should have type === 'exam' from the library build.
 * Fallback: markdown header may contain @exam while the loaded node is still typed as leaf (legacy or alternate sources).
 */
export function isExamLesson(node) {
    if (!node) return false;
    if (node.type === 'exam') return true;
    const c = node.content;
    if (typeof c !== 'string' || !c.length) return false;
    return /^\s*@exam\s*$/m.test(c.slice(0, 12000));
}
