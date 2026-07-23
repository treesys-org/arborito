/**
 * Synchronous construct draft body — bridges the gap between flush (DOM → markdown)
 * and React `patchPanel` (async). Save / TOC / autosave must read this in the same tick
 * as flush, before `lessonBodyMarkdown` commits.
 */

/** @type {{ nodeId: string, body: string } | null} */
let syncDraft = null;

/** @param {string|number|null|undefined} nodeId @param {string|null|undefined} body */
export function setSyncLessonDraftBody(nodeId, body) {
    if (nodeId == null || body == null) {
        syncDraft = null;
        return;
    }
    syncDraft = { nodeId: String(nodeId), body: String(body) };
}

/** @param {string|number|null|undefined} [nodeId] */
export function clearSyncLessonDraftBody(nodeId) {
    if (!syncDraft) return;
    if (nodeId == null || syncDraft.nodeId === String(nodeId)) syncDraft = null;
}

/**
 * @param {string|number|null|undefined} nodeId
 * @returns {string|null}
 */
export function peekSyncLessonDraftBody(nodeId) {
    if (!syncDraft || nodeId == null) return null;
    return syncDraft.nodeId === String(nodeId) ? syncDraft.body : null;
}
