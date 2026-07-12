import { getArboritoStore } from '../../../core/store-singleton.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { loadUnifiedReleasesList } from './releases-service.js';

function bumpCurriculumSwitcher() {
    getArboritoStore()?.bumpGraphUiRevision();
}

export async function _ensureSnapshotsAdminLoaded(graph) {
    const store = getArboritoStore();
    const isConstruct = !!store?.value.constructionMode;
    const canWrite = !!fileSystem.features.canWrite;
    if (!isConstruct || !canWrite) return;
    if (graph._snapAdminLoading) return;
    graph._snapAdminLoading = true;
    try {
        const all = await loadUnifiedReleasesList();
        graph._snapAdminItems = all.filter((r) => !r.isRemote);
    } catch {
        graph._snapAdminItems = [];
    } finally {
        graph._snapAdminLoading = false;
        bumpCurriculumSwitcher();
    }
}
