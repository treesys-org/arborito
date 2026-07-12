import { parseContent } from '../../../learning/api/parser.js';
import { buildTocFromBlocks } from '../../../learning/api/content-toc.js';
import { getLessonInsertContext } from '../lesson-insert-block.js';

/** TOC sections/subsections usable as game topic context. */
export function getLessonTopicItems(bodyMarkdown) {
    const blocks = parseContent(bodyMarkdown || '');
    const toc = buildTocFromBlocks(blocks);
    return toc
        .map((item) => ({
            id: String(item.id || ''),
            text: String(item.text || '').trim(),
            level: item.level || 1,
        }))
        .filter((t) => t.id && t.text);
}

export function getCurrentLessonTopicItems() {
    const ctx = getLessonInsertContext();
    const body =
        typeof ctx?.getLessonBodyForToc === 'function'
            ? ctx.getLessonBodyForToc()
            : ctx?.panel?.lessonBodyMarkdown || '';
    return getLessonTopicItems(body);
}

export function resolveTopicLabels(topicIds, topicCatalog) {
    const map = new Map((topicCatalog || []).map((t) => [t.id, t.text]));
    return (topicIds || []).map((id) => map.get(id) || id);
}
