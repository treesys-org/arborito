import { parseContent } from '../../../learning/api/parser.js';
import { getToc } from '../../../learning/api/content-toc.js';
import { extractSectionProseMarkdown } from '../../../learning/api/lesson-section-slices.js';
import { markdownToVisualHTML, replaceEditorHtml } from '../editor-engine.js';
import { visualHTMLToMarkdown } from './editor-serialize.js';
import { formatConstructEditorSeed } from './lesson-construct-seed.js';
import { resolveLiveConstructBody } from './lesson-construct-body.js';
import { getArboritoStore as store } from '../../../../core/store-singleton.js';

const MISPLACED_BLOCK_SEL =
    '.edit-block-wrapper, .arborito-quiz-edit, .arborito-game-edit, .arborito-media-edit, .arborito-callout-edit, .arborito-math-edit, .arborito-table-edit';
const INLINE_BLOCK_HOST_SEL = 'P, H1, H2, H3, H4, H5, H6, BLOCKQUOTE, SPAN[data-arb-size]';

/** Pull quiz/game/media blocks out of paragraphs or size spans before markdown capture. */
export function hoistMisplacedEditorBlocks(editorEl) {
    if (!editorEl) return;
    const blocks = [...editorEl.querySelectorAll(MISPLACED_BLOCK_SEL)];
    for (const block of blocks) {
        if (!(block instanceof HTMLElement) || !editorEl.contains(block)) continue;
        const host = block.parentElement?.closest(INLINE_BLOCK_HOST_SEL);
        if (!host || !editorEl.contains(host) || host === editorEl) continue;
        const outer =
            host.tagName === 'SPAN'
                ? host.parentElement?.closest('P, H1, H2, H3, H4, H5, H6, BLOCKQUOTE') || host
                : host;
        if (outer?.parentNode) outer.parentNode.insertBefore(block, outer.nextSibling);
    }
}

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
    hoistMisplacedEditorBlocks(editorEl);
    return visualHTMLToMarkdown(editorEl);
}

export function applyEditorSectionMarkdown(editorEl, sectionMd) {
    if (!editorEl) return;
    editorEl.classList.remove('arborito-lesson-editor--ghost-outline');
    editorEl.classList.add('arborito-lesson-editor--wysiwyg');
    const html = markdownToVisualHTML(sectionMd);
    replaceEditorHtml(editorEl, html);
    assignHeadingIdsFromBlocks(editorEl, sectionMd);
}

/** Prose-only seed for the visual construct editor (outline heading stays in the TOC). */
export function buildConstructEditorSeed(node, panel, sectionIndex) {
    if (!node) return { sectionMd: '', sectionId: '', seedKey: formatConstructEditorSeed(0, '') };
    const liveContent = store.findNode(node.id)?.content || node.content || '';
    const fullBodyMd = resolveLiveConstructBody({
        nodeId: node.id,
        nodeContent: liveContent,
        lessonBodyMarkdown: panel.lessonBodyMarkdown,
        lessonConstructDraft: panel.lessonConstructDraft,
        lessonDraftLessonId: panel.lessonDraftLessonId,
    });
    const toc = getToc({ content: fullBodyMd });
    const sectionId = toc[sectionIndex]?.id || '';
    const sectionMd = extractSectionProseMarkdown(fullBodyMd, sectionIndex);
    return {
        sectionMd,
        sectionId,
        seedKey: formatConstructEditorSeed(sectionIndex, sectionId),
    };
}
