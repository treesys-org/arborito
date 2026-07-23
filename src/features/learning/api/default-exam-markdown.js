/**
 * Initial markdown for a newly created exam node.
 * @param {Record<string, string>} ui
 */
export function buildDefaultExamMarkdown(ui) {
    const head = String((ui && ui.defaultExamFirstHeading) != null ? ui.defaultExamFirstHeading : '').trim();
    const body = String((ui && ui.defaultExamContent) != null ? ui.defaultExamContent : '').trim();
    const h = head || 'Exam';
    const b = body || '…';
    return `# ${h}\n\n${b}\n\n@quiz\nconcept: …\nquestion: …\nanswer: …\nmodes: multiple,recall\ntraps:\n- …\n- …\n@/quiz\n`;
}
