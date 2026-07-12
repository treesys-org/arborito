/** Local draft autosave for lesson construct edits (not persisted to the tree). */

import { parseArboritoFile } from '../editor-engine.js';
import { parseContent } from '../../../learning/api/parser.js';
import { buildTocFromBlocks } from '../../../learning/api/content-toc.js';

const STORAGE_PREFIX = 'arborito-lesson-draft-v1';
const DRAFT_VERSION = 1;

/** TOC row count for a saved lesson file or body markdown. */
export function countTocSectionsFromLessonContent(content) {
    if (!content) return 0;
    const parsed = parseArboritoFile(content);
    const body = parsed?.body ?? String(content);
    return buildTocFromBlocks(parseContent(body)).length;
}

/** Reject truncated local drafts that dropped sections (common after bad editor round-trips). */
export function isDraftBodyUsable(draftBody, nodeContent) {
    if (typeof draftBody !== 'string' || !draftBody.trim()) return false;
    const savedCount = countTocSectionsFromLessonContent(nodeContent);
    if (!savedCount) return true;
    const draftCount = buildTocFromBlocks(parseContent(draftBody)).length;
    return draftCount >= savedCount;
}

export function lessonContentFingerprint(content) {
    const s = String(content ?? '');
    let h = 0;
    const lim = Math.min(s.length, 1200);
    for (let i = 0; i < lim; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `${s.length}:${h}`;
}

function draftKey(sourceId, nodeId) {
    return `${STORAGE_PREFIX}:${String(sourceId)}:${String(nodeId)}`;
}

export function saveLessonDraft({
    sourceId,
    nodeId,
    bodyMarkdown,
    headerMetaDraft,
    activeSectionIndex,
    baseContentFp
}) {
    if (!sourceId || !nodeId || bodyMarkdown == null) return;
    try {
        const payload = {
            v: DRAFT_VERSION,
            bodyMarkdown,
            headerMetaDraft: headerMetaDraft ?? null,
            activeSectionIndex: Number.isInteger(activeSectionIndex) ? activeSectionIndex : 0,
            baseContentFp: baseContentFp ?? '',
            savedAt: Date.now()
        };
        localStorage.setItem(draftKey(sourceId, nodeId), JSON.stringify(payload));
    } catch {
        /* quota / private mode */
    }
}

export function loadLessonDraft(sourceId, nodeId) {
    if (!sourceId || !nodeId) return null;
    try {
        const raw = localStorage.getItem(draftKey(sourceId, nodeId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== DRAFT_VERSION || typeof parsed.bodyMarkdown !== 'string') {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function clearLessonDraft(sourceId, nodeId) {
    if (!sourceId || !nodeId) return;
    try {
        localStorage.removeItem(draftKey(sourceId, nodeId));
    } catch {
        /* ignore */
    }
}

/** Restore draft only when the saved file has not changed since the draft was started. */
export function draftMatchesSavedContent(draft, nodeContent) {
    if (!draft?.baseContentFp) return false;
    if (draft.baseContentFp !== lessonContentFingerprint(nodeContent)) return false;
    return isDraftBodyUsable(draft.bodyMarkdown, nodeContent);
}
