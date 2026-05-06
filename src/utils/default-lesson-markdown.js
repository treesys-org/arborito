/**
 * Initial markdown for a newly created lesson.
 * The visible lesson name lives in node metadata; the body H1 uses a generic heading
 * so “New lesson” is not duplicated in title and body.
 * @param {Record<string, string>} ui
 */
export function buildDefaultLessonMarkdown(ui) {
    const head = String((ui && ui.defaultLessonFirstHeading) != null ? ui.defaultLessonFirstHeading : '').trim();
    const body = String((ui && ui.defaultLessonContent) != null ? ui.defaultLessonContent : '').trim();
    const h = head || 'Lesson body';
    const b = body || '…';
    return `# ${h}\n\n${b}\n`;
}
