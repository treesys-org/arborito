/**
 * Single live construct body: sync buffer → panel draft → file body.
 */

import { parseArboritoFile } from '../editor-engine.js';
import { isLiveConstructDraftBody } from './lesson-draft-persist.js';
import { peekSyncLessonDraftBody } from './lesson-sync-draft-body.js';

/**
 * @param {{
 *   nodeId?: string|number|null,
 *   nodeContent?: string|null,
 *   lessonBodyMarkdown?: string|null,
 *   lessonConstructDraft?: boolean,
 *   lessonDraftLessonId?: string|null,
 * }} src
 * @returns {string}
 */
export function resolveLiveConstructBody(src = {}) {
    const nodeId = src.nodeId;
    if (nodeId != null) {
        const syncBody = peekSyncLessonDraftBody(nodeId);
        if (syncBody != null && isLiveConstructDraftBody(syncBody)) return syncBody;
    }
    const usingDraft =
        src.lessonConstructDraft &&
        src.lessonDraftLessonId === nodeId &&
        isLiveConstructDraftBody(src.lessonBodyMarkdown);
    if (usingDraft) return src.lessonBodyMarkdown;
    return parseArboritoFile(src.nodeContent || '').body || '';
}
