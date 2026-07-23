import { loadUnifiedReleasesList } from './releases-service.js';

import { getArboritoStore } from '../../../core/store-singleton.js';

function bumpCurriculumSwitcher() {
    getArboritoStore()?.bumpGraphUiRevision();
}

export async function _ensureLocalSnapshotsLoaded(graph) {
    if (!graph) return;
    if (graph._localSnapLoading) return;
    graph._localSnapLoading = true;
    try {
        const all = await loadUnifiedReleasesList();
        graph._localSnapItems = all.filter((r) => !r.isRemote);
    } catch {
        graph._localSnapItems = [];
    } finally {
        graph._localSnapLoading = false;
        bumpCurriculumSwitcher();
    }
}
