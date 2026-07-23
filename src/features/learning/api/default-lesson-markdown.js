import { prepareConstructOutlineBody, buildConstructStarterProse } from './lesson-toc-mutations.js';

/**
 * Initial markdown for a newly created lesson.
 * First syllabus fence (`@section` + `index: 1` + `title`) plus in-lesson `{{lg}}` and body hint.
 * @param {Record<string, string>} ui
 */
export function buildDefaultLessonMarkdown(ui) {
    const head = String((ui && ui.defaultLessonFirstHeading) != null ? ui.defaultLessonFirstHeading : '').trim();
    const body = String((ui && ui.defaultLessonContent) != null ? ui.defaultLessonContent : '').trim();
    const h = head || 'New section';
    const b = body || '…';
    const starter = buildConstructStarterProse(h, b);
    return prepareConstructOutlineBody(`## ${h}\n\n${starter}\n`, h);
}
