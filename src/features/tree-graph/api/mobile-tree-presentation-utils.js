/** Pure helpers for mobile tree presentation (no engine). */

export function getMobileTone(node) {
    if (!node || !node.type) return 'branch';
    if (node.type === 'root') return 'root';
    if (node.type === 'exam') return 'exam';
    if (node.type === 'leaf') return 'leaf';
    return 'branch';
}

/**
 * True when `node` is the last-opened lesson/exam, or a non-root parent folder that leads to it.
 * Root is never highlighted — the whole tree would light up and the cue stops being useful.
 * @param {object | null | undefined} node
 * @param {string | null | undefined} lessonId
 * @param {(id: string) => object | null | undefined} [findNode]
 */
export function nodeLeadsToLessonId(node, lessonId, findNode) {
    if (!node || lessonId == null || lessonId === '') return false;
    if (node.type === 'root') return false;
    const lid = String(lessonId);
    if (String(node.id) === lid) return true;

    if (typeof findNode === 'function') {
        let cur = findNode(lid);
        let guard = 0;
        while (cur && guard++ < 256) {
            if (String(cur.id) === String(node.id)) return true;
            if (cur.parentId == null || cur.parentId === '') break;
            const parent = findNode(cur.parentId);
            /* Stop before treating the curriculum root as a “parent cue”. */
            if (parent && parent.type === 'root') break;
            cur = parent;
        }
    }

    if (Array.isArray(node.leafIds) && node.leafIds.some((id) => String(id) === lid)) {
        return true;
    }
    if (Array.isArray(node.children) && node.children.length) {
        for (const ch of node.children) {
            if (nodeLeadsToLessonId(ch, lid, findNode)) return true;
        }
    }
    return false;
}
