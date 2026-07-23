/** Pure helpers for mobile tree presentation (no engine). */

export function getMobileTone(node) {
    if (!node || !node.type) return 'branch';
    if (node.type === 'root') return 'root';
    if (node.type === 'exam') return 'exam';
    if (node.type === 'leaf') return 'leaf';
    return 'branch';
}
