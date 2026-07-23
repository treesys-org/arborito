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

/**
 * Heuristic for *restored localStorage* drafts only.
 * Do not use on live construct sync/panel drafts — intentional TOC deletes and
 * large edits look identical to truncation and would wipe in-session work.
 */
export function isDraftBodyUsable(draftBody, nodeContent) {
    if (typeof draftBody !== 'string' || !draftBody.trim()) return false;
    const savedCount = countTocSectionsFromLessonContent(nodeContent);
    const draftCount = buildTocFromBlocks(parseContent(draftBody)).length;
    if (savedCount && draftCount < savedCount) return false;
    const savedBody = String(parseArboritoFile(nodeContent || '')?.body || '').trim();
    const draftTrim = draftBody.trim();
    /* Same TOC count but half the prose gone → treat as corrupted. */
    if (savedBody.length > 80 && draftTrim.length < Math.floor(savedBody.length * 0.5)) {
        return false;
    }
    return true;
}

/** Live construct draft is trusted once present (sync slot or panel flags). */
export function isLiveConstructDraftBody(draftBody) {
    return typeof draftBody === 'string';
}

export function lessonContentFingerprint(content) {
    const s = String(content ?? '');
    let h = 2166136261;
    /* FNV-1a over the full body so small mid-file edits invalidate drafts. */
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `${s.length}:${h >>> 0}`;
}

function normalizeDraftLang(lang) {
    const k = String(lang || '').trim();
    return k || '_';
}

function draftKey(sourceId, nodeId, lang) {
    return `${STORAGE_PREFIX}:${String(sourceId)}:${String(nodeId)}:${normalizeDraftLang(lang)}`;
}

/** Legacy key without language (pre-lang drafts). */
function legacyDraftKey(sourceId, nodeId) {
    return `${STORAGE_PREFIX}:${String(sourceId)}:${String(nodeId)}`;
}

export function saveLessonDraft({
    sourceId,
    nodeId,
    bodyMarkdown,
    headerMetaDraft,
    activeSectionIndex,
    baseContentFp,
    curriculumLang
}) {
    if (!sourceId || !nodeId || bodyMarkdown == null) return;
    try {
        const payload = {
            v: DRAFT_VERSION,
            bodyMarkdown,
            headerMetaDraft: headerMetaDraft ?? null,
            activeSectionIndex: Number.isInteger(activeSectionIndex) ? activeSectionIndex : 0,
            baseContentFp: baseContentFp ?? '',
            curriculumLang: normalizeDraftLang(curriculumLang),
            savedAt: Date.now()
        };
        localStorage.setItem(draftKey(sourceId, nodeId, curriculumLang), JSON.stringify(payload));
        /* Drop legacy unscoped draft so it cannot restore into another language. */
        try {
            localStorage.removeItem(legacyDraftKey(sourceId, nodeId));
        } catch {
            /* ignore */
        }
    } catch {
        /* quota / private mode */
    }
}

export function loadLessonDraft(sourceId, nodeId, curriculumLang) {
    if (!sourceId || !nodeId) return null;
    try {
        let raw = localStorage.getItem(draftKey(sourceId, nodeId, curriculumLang));
        if (!raw) {
            /* Only accept legacy drafts when no lang was requested (or lang is default). */
            raw = localStorage.getItem(legacyDraftKey(sourceId, nodeId));
            if (raw && curriculumLang) {
                const parsed = JSON.parse(raw);
                /* Reject legacy if it would collide across languages. */
                if (parsed && !parsed.curriculumLang) return null;
            }
        }
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== DRAFT_VERSION || typeof parsed.bodyMarkdown !== 'string') {
            return null;
        }
        if (
            parsed.curriculumLang &&
            curriculumLang &&
            normalizeDraftLang(parsed.curriculumLang) !== normalizeDraftLang(curriculumLang)
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function clearLessonDraft(sourceId, nodeId, curriculumLang) {
    if (!sourceId || !nodeId) return;
    try {
        localStorage.removeItem(draftKey(sourceId, nodeId, curriculumLang));
        localStorage.removeItem(legacyDraftKey(sourceId, nodeId));
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
