/** Exam nodes are typed `exam` in the curriculum graph. */
export function isExamLesson(node) {
    return !!(node && node.type === 'exam');
}
