/**
 * Bundle demo lesson images (demo/arborito-demo/media/*.png) into IndexedDB
 * as ./media/… for branch-arborito-demo — same path as a local .arborito import.
 */

import { putLessonMediaFile, safeMediaFilename } from '../../features/learning/api/lesson-local-media-store.js';
import { DEMO_BRANCH_ID } from './arborito-demo-ids.js';
import { listBundledDemoMediaFilenames, resolveBundledDemoMediaUrl } from './demo-media-assets.js';

/**
 * @param {string} [branchId]
 * @returns {Promise<number>} files imported
 */
export async function importBundledDemoMedia(branchId = DEMO_BRANCH_ID) {
    const bid = String(branchId || DEMO_BRANCH_ID).trim();
    if (!bid) return 0;
    let n = 0;
    for (const fileRaw of listBundledDemoMediaFilenames()) {
        const file = safeMediaFilename(fileRaw);
        const url = resolveBundledDemoMediaUrl(file);
        if (!file || !url) continue;
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const blob = await res.blob();
            if (!blob?.size) continue;
            await putLessonMediaFile(bid, file, blob, blob.type || 'image/png');
            n += 1;
        } catch (e) {
            console.warn('[Arborito] demo media import failed', file, e);
        }
    }
    return n;
}
