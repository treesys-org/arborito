/** Pure helpers for mobile tree presentation (no engine). */

export function getMobileTone(node) {
    if (!node || !node.type) return 'branch';
    if (node.type === 'root') return 'root';
    if (node.type === 'exam') return 'exam';
    if (node.type === 'leaf') return 'leaf';
    return 'branch';
}

/**
 * True when `node` is the last-opened lesson/exam, or a parent folder that leads to it.
 * @param {object | null | undefined} node
 * @param {string | null | undefined} lessonId
 * @param {(id: string) => object | null | undefined} [findNode]
 */
export function nodeLeadsToLessonId(node, lessonId, findNode) {
    if (!node || lessonId == null || lessonId === '') return false;
    const lid = String(lessonId);
    if (String(node.id) === lid) return true;

    if (typeof findNode === 'function') {
        let cur = findNode(lid);
        let guard = 0;
        while (cur && guard++ < 256) {
            if (String(cur.id) === String(node.id)) return true;
            if (cur.parentId == null || cur.parentId === '') break;
            cur = findNode(cur.parentId);
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
