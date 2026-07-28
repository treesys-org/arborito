import { prepareConstructOutlineBody, buildConstructStarterProse } from './lesson-toc-mutations.js';

/**
 * Initial markdown for a newly created lesson.
 * Syllabus fence + starter prose + sample @quiz with Remember fields only
 * (question/answer stay empty so wizard placeholders teach that block).
 * @param {Record<string, string>} ui
 */
export function buildDefaultLessonMarkdown(ui) {
    const head = String((ui && ui.defaultLessonFirstHeading) != null ? ui.defaultLessonFirstHeading : '').trim();
    const body = String((ui && ui.defaultLessonContent) != null ? ui.defaultLessonContent : '').trim();
    const h = head || 'New section';
    const b = body || '…';
    const starter = buildConstructStarterProse(h, b);
    const concept =
        String((ui && ui.defaultLessonQuizConcept) != null ? ui.defaultLessonQuizConcept : '').trim() ||
        '…';
    const definition = String(
        (ui && ui.defaultLessonQuizDefinition) != null ? ui.defaultLessonQuizDefinition : ''
    ).trim();
    const quizLines = ['@quiz', `concept: ${concept}`];
    if (definition) quizLines.push(`definition: ${definition}`);
    quizLines.push('@/quiz', '');
    return prepareConstructOutlineBody(`## ${h}\n\n${starter}\n\n${quizLines.join('\n')}`, h);
}
