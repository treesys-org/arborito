/** Local draft autosave for lesson construct edits (not persisted to the tree). */

const STORAGE_PREFIX = 'arborito-lesson-draft-v1';
const DRAFT_VERSION = 1;

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
    if (!draft?.baseContentFp) return true;
    return draft.baseContentFp === lessonContentFingerprint(nodeContent);
}
