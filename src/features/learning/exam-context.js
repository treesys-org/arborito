/**
 * Exam nodes carry type === 'exam'. As a fallback, a markdown header may
 * declare @exam while the loaded node still arrives typed as leaf — accept
 * both shapes so alternate sources don't silently demote exam nodes.
 */
export function isExamLesson(node) {
    if (!node) return false;
    if (node.type === 'exam') return true;
    const c = node.content;
    if (typeof c !== 'string' || !c.length) return false;
    return /^\s*@exam\s*$/m.test(c.slice(0, 12000));
}
