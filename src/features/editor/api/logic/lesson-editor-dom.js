import { parseContent } from '../../../learning/api/parser.js';
import {
    extractTocSectionMarkdown,
    metaQuizBelongsOnSectionIndex,
} from '../../../learning/api/lesson-section-slices.js';
import { markdownToVisualHTML, replaceEditorHtml, parseArboritoFile, BLOCKS } from '../editor-engine.js';
import { visualHTMLToMarkdown } from './editor-serialize.js';
import { bodyMarkdownHasQuizBlock } from '../../../learning/api/quiz-status.js';

/** Outline headings inside the visual lesson editor (contentEditable). */
export function constructSectionMarkers(editorEl) {
    if (!editorEl) return [];
    const markers = [];
    for (const el of editorEl.getElementsByClassName('arborito-authoring-outline')) {
        markers.push(el);
    }
    for (const tag of ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']) {
        for (const el of editorEl.getElementsByTagName(tag)) {
            markers.push(el);
        }
    }
    return markers.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
}

export function assignHeadingIdsFromBlocks(editorEl, markdownBody) {
    const blocks = parseContent(markdownBody || '');
    const ids = [];
    for (const b of blocks) {
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'subsection'].includes(b.type)) {
            ids.push(b.id);
        }
    }
    constructSectionMarkers(editorEl).forEach((marker, i) => {
        if (ids[i]) {
            marker.id = ids[i];
            marker.setAttribute('data-arborito-section-id', ids[i]);
        } else {
            marker.removeAttribute('id');
            marker.removeAttribute('data-arborito-section-id');
        }
    });
}

export function captureEditorSectionMarkdown(editorEl) {
    if (!editorEl) return '';
    return visualHTMLToMarkdown(editorEl);
}

export function applyEditorSectionMarkdown(editorEl, sectionMd, { extraHtml = '' } = {}) {
    if (!editorEl) return;
    editorEl.classList.add('arborito-lesson-editor--ghost-outline');
    let html = markdownToVisualHTML(sectionMd, { authoringGhostOutline: true });
    if (extraHtml) html += extraHtml;
    replaceEditorHtml(editorEl, html);
    assignHeadingIdsFromBlocks(editorEl, sectionMd);
}

/** Section markdown + optional quiz-meta HTML for the visual construct editor. */
export function buildConstructEditorSeed(node, panel, sectionIndex) {
    if (!node) return { sectionMd: '', extraHtml: '' };
    const parsed = parseArboritoFile(node.content || '');
    const fullBodyMd = panel.lessonBodyMarkdown !== null ? panel.lessonBodyMarkdown : parsed.body;
    const sectionMd = extractTocSectionMarkdown(fullBodyMd, sectionIndex);
    let extraHtml = '';
    const c =
        (panel.headerMetaDraft?.nodeId === node.id && panel.headerMetaDraft.challenge) ||
        parsed.meta?.challenge;
    const hasChallenge =
        c && (c.core_concept || c.correct_answer || c.short_definition || c.main_question);
    if (
        hasChallenge &&
        !bodyMarkdownHasQuizBlock(fullBodyMd) &&
        metaQuizBelongsOnSectionIndex(fullBodyMd, sectionIndex)
    ) {
        extraHtml = BLOCKS.quiz(c);
    }
    return { sectionMd, extraHtml };
}
