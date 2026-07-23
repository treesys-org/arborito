/**
 * Construct editor DOM seed pin: `${index}\u0001${sectionId}`
 * Legacy formats still parse (prose-in-seed / index-only).
 */

import { getTocSectionRanges } from '../../../learning/api/lesson-section-slices.js';

/**
 * @param {string|null|undefined} seed
 * @returns {{ index: number|null, sectionId: string }}
 */
export function parseConstructEditorSeed(seed) {
    const raw = String(seed != null ? seed : '');
    if (!raw) return { index: null, sectionId: '' };
    const parts = raw.split('\u0001');
    const indexRaw = parts[0];
    const index =
        indexRaw !== '' && Number.isFinite(Number(indexRaw)) ? Number(indexRaw) : null;
    if (!Number.isInteger(index)) return { index: null, sectionId: '' };

    if (parts.length >= 2) {
        const maybeId = parts[1];
        /* Ids are single-line slugs; legacy 2-field seeds put markdown in parts[1]. */
        if (maybeId != null && !String(maybeId).includes('\n') && String(maybeId).length < 160) {
            return { index, sectionId: String(maybeId) };
        }
    }
    return { index, sectionId: '' };
}

/**
 * @param {number} sectionIndex
 * @param {string} sectionId
 */
export function formatConstructEditorSeed(sectionIndex, sectionId) {
    return `${sectionIndex}\u0001${sectionId || ''}`;
}

/**
 * Resolve the section slot for a dirty DOM flush. Never falls back to an unbound
 * active index — missing/mismatched pins abort (caller keeps dirty).
 * @param {HTMLElement|{ dataset?: { arboritoEditorSeed?: string } }|null|undefined} ed
 * @param {string} bodyMarkdown
 * @returns {number|null}
 */
export function resolvePinnedFlushSectionIndex(ed, bodyMarkdown) {
    const pin = parseConstructEditorSeed(ed?.dataset?.arboritoEditorSeed);
    if (pin.index == null || !Number.isInteger(pin.index)) return null;
    const ranges = getTocSectionRanges(bodyMarkdown);
    if (!ranges.length) {
        return pin.index === 0 ? 0 : null;
    }
    if (pin.sectionId) {
        const at = ranges[pin.index];
        if (at?.id === pin.sectionId) return pin.index;
        const byId = ranges.findIndex((r) => r.id === pin.sectionId);
        if (byId !== -1) return byId;
        return null;
    }
    if (pin.index < 0 || pin.index >= ranges.length) return null;
    return pin.index;
}

/**
 * After a flush attempt: return the body to mutate, or null to abort.
 * Never clear the editor seed unless this returns a string.
 *
 * @param {{ ok?: boolean, aborted?: boolean, bodyMarkdown?: string }|null|undefined} flushed
 * @param {HTMLElement|{ dataset?: { arboritoEditorDirty?: string } }|null|undefined} editorEl
 * @param {string|null|undefined} fallbackBody
 * @returns {string|null}
 */
export function bodyAfterFlushOrAbort(flushed, editorEl, fallbackBody) {
    if (flushed == null) return null;
    if (flushed.ok === false || flushed.aborted) return null;
    if (editorEl?.dataset?.arboritoEditorDirty === '1') return null;
    if (flushed.bodyMarkdown != null) return String(flushed.bodyMarkdown);
    return fallbackBody != null ? String(fallbackBody) : null;
}
