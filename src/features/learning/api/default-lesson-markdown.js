import { prepareConstructOutlineBody, buildConstructStarterProse } from './lesson-toc-mutations.js';

/**
 * Initial markdown for a newly created lesson.
 * First syllabus fence (`@section` + `index: 1` + `title`) plus in-lesson `{{lg}}` and body hint,
 * then a sample `@quiz` so a planted branch is not an empty void.
 * @param {Record<string, string>} ui
 */
export function buildDefaultLessonMarkdown(ui) {
    const head = String((ui && ui.defaultLessonFirstHeading) != null ? ui.defaultLessonFirstHeading : '').trim();
    const body = String((ui && ui.defaultLessonContent) != null ? ui.defaultLessonContent : '').trim();
    const h = head || 'New section';
    const b = body || '…';
    const starter = buildConstructStarterProse(h, b);
    const concept = String((ui && ui.defaultLessonQuizConcept) != null ? ui.defaultLessonQuizConcept : '').trim() || '…';
    const question = String((ui && ui.defaultLessonQuizQuestion) != null ? ui.defaultLessonQuizQuestion : '').trim() || '…';
    const answer = String((ui && ui.defaultLessonQuizAnswer) != null ? ui.defaultLessonQuizAnswer : '').trim() || '…';
    const trap1 = String((ui && ui.defaultLessonQuizTrap1) != null ? ui.defaultLessonQuizTrap1 : '').trim() || '…';
    const trap2 = String((ui && ui.defaultLessonQuizTrap2) != null ? ui.defaultLessonQuizTrap2 : '').trim() || '…';
    const quiz = [
        '@quiz',
        `concept: ${concept}`,
        'items:',
        `  - question: ${question}`,
        `    answer: ${answer}`,
        '    modes: multiple,recall',
        '    traps:',
        `      - ${trap1}`,
        `      - ${trap2}`,
        '@/quiz',
        '',
    ].join('\n');
    return prepareConstructOutlineBody(`## ${h}\n\n${starter}\n\n${quiz}`, h);
}
