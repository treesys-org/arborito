/**
 * Optional lesson header tags: @repaso, @id, @grupo, @tags
 * Exposed to games as `lesson.meta` via the Arborito SDK.
 */

import { parseArboritoFile, reconstructArboritoFile } from './editor-engine.js';

const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'si', 'sí']);

function isTruthy(raw) {
    return TRUTHY.has(String(raw || '').trim().toLowerCase());
}

/** @typedef {{ repaso: boolean, id: string, grupo: string, tags: string[] }} LessonMetaTags */

/**
 * @param {object} meta parseArboritoFile().meta
 * @returns {LessonMetaTags}
 */
export function readLessonMetaTags(meta) {
    const m = meta || {};
    let repaso = !!m.repaso;
    if (!repaso && Array.isArray(m.extra)) {
        for (const line of m.extra) {
            const low = String(line).toLowerCase();
            if (!low.startsWith('@repaso:')) continue;
            const val = line.includes(':') ? line.slice(line.indexOf(':') + 1).trim() : '';
            if (isTruthy(val)) repaso = true;
            break;
        }
    }
    return {
        repaso,
        id: String(m.idTarjeta || '').trim(),
        grupo: String(m.grupo || '').trim(),
        tags: Array.isArray(m.tags) ? [...m.tags] : []
    };
}

/**
 * @param {object} meta
 * @param {Partial<LessonMetaTags>} patch
 */
export function applyLessonMetaTags(meta, patch) {
    const next = { ...(meta || {}), extra: [...((meta && meta.extra) || [])] };
    next.extra = next.extra.filter((l) => {
        const low = String(l).toLowerCase();
        return !['@repaso:', '@id:', '@grupo:', '@tags:', '@etiquetas:'].some((p) => low.startsWith(p));
    });

    if (patch.repaso != null) next.repaso = !!patch.repaso;
    if (patch.id != null) next.idTarjeta = String(patch.id || '').trim();
    if (patch.grupo != null) next.grupo = String(patch.grupo || '').trim();
    if (patch.tags != null) {
        next.tags = Array.isArray(patch.tags) ? patch.tags.map((t) => String(t || '').trim()).filter(Boolean) : [];
    }
    return next;
}

/**
 * @param {object} meta
 * @returns {string[]}
 */
export function lessonMetaTagLines(meta) {
    const { repaso, id, grupo, tags } = readLessonMetaTags(meta);
    const lines = [];
    if (repaso) lines.push('@repaso: si');
    if (id) lines.push(`@id: ${id}`);
    if (grupo) lines.push(`@grupo: ${grupo}`);
    if (tags.length) lines.push(`@tags: ${tags.join(', ')}`);
    return lines;
}

/**
 * @param {string} fullContent
 * @param {Partial<LessonMetaTags>} patch
 */
export function patchLessonMetaTags(fullContent, patch) {
    const { meta, body } = parseArboritoFile(fullContent || '');
    return reconstructArboritoFile(applyLessonMetaTags(meta, patch), body);
}

/**
 * @param {string} content
 * @returns {LessonMetaTags}
 */
export function parseLessonMetaTagsFromContent(content) {
    const { meta } = parseArboritoFile(content || '');
    return readLessonMetaTags(meta);
}
