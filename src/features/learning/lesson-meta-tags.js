/**
 * Optional lesson properties exposed to game cartridges as `lesson.meta` via
 * the Arborito SDK. Authored inside the leaf's `@info … @/info` block.
 *
 * The lesson identifier is `lesson.id` (path-derived) — not duplicated here.
 *
 * Spaced repetition is decided by Arborito's SRS engine internally
 * (`window.arborito.memory.due()`), not by a per-lesson author flag, so this
 * surface intentionally only exposes `tags`.
 */

import { parseArboritoFile } from '../editor/editor-engine.js';

/** @typedef {{ tags: string[] }} LessonMetaTags */

/**
 * @param {object} meta parseArboritoFile().meta
 * @returns {LessonMetaTags}
 */
export function readLessonMetaTags(meta) {
    const m = meta || {};
    return {
        tags: Array.isArray(m.tags) ? [...m.tags] : []
    };
}

/**
 * @param {string} content
 * @returns {LessonMetaTags}
 */
export function parseLessonMetaTagsFromContent(content) {
    const { meta } = parseArboritoFile(content || '');
    return readLessonMetaTags(meta);
}
