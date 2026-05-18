import { store } from '../store.js';
import { fileSystem } from '../services/filesystem.js';
import { DataProcessor } from './data-processor.js';

function cloneCurriculumSnapshotExcludingReleaseMeta(raw) {
    if (!(raw && raw.languages)) return null;
    const o = JSON.parse(JSON.stringify(raw));
    delete o.releaseSnapshots;
    return o;
}

/**
 * Unified list of releases/snapshots for UI.
 * Returns objects like: { id, name, url, isRemote }
 */
export async function loadUnifiedReleasesList() {
    const ui = store.ui;
    const publicReleases = store.value.availableReleases || [];

    /** @type {Array<{id: string, name: string, url: string | null, isRemote: boolean}>} */
    let releases = publicReleases
        .filter((r) => r && r.type === 'archive')
        .map((r) => ({
            id: String(r.year || r.name || '').trim(),
            name: String(r.name || '').trim(),
            url: r.url || null,
            isRemote: true
        }))
        .filter((r) => r.id);

    if (fileSystem.features.canWrite) {
        // Optional FS scan for writable non-local sources (e.g. when editing via filesystem).
        if (!fileSystem.isLocal && !fileSystem.isNostrTreeSource()) {
            try {
                const tree = await fileSystem.getTree('content/releases');
                const releaseFolders = new Set();
                tree.forEach((node) => {
                    const parts = String(node.path || '').split('/');
                    if (parts.length >= 3 && parts[0] === 'content' && parts[1] === 'releases') {
                        releaseFolders.add(parts[2]);
                    }
                });
                releaseFolders.forEach((folder) => {
                    if (!folder) return;
                    if (!releases.find((r) => r.id === folder)) {
                        releases.push({
                            id: folder,
                            name: `${ui.releasesSnapshot || 'Snapshot'} ${folder}`,
                            url: null,
                            isRemote: false
                        });
                    }
                });
            } catch {
                /* ignore */
            }
        }

        // Local gardens: versions = keys of userStore.releaseSnapshots
        if (fileSystem.isLocal) {
            const tid = fileSystem.localGardenTreeId();
            const te = tid ? store.userStore?.state?.localTrees?.find((t) => t.id === tid) : null;
            const snaps = te && te.releaseSnapshots ? te.releaseSnapshots : null;
            if (snaps) {
                Object.keys(snaps).forEach((id) => {
                    if (!id) return;
                    if (!releases.find((r) => r.id === id)) {
                        releases.push({
                            id,
                            name: `${ui.releasesSnapshot || 'Snapshot'} ${id}`,
                            url: null,
                            isRemote: false
                        });
                    }
                });
            }
        }

        // public trees: versions = keys of rawGraphData.releaseSnapshots
        if (fileSystem.isNostrTreeSource()) {
            const raw = store.value.rawGraphData;
            const snaps = raw && raw.releaseSnapshots ? raw.releaseSnapshots : null;
            if (snaps) {
                Object.keys(snaps).forEach((id) => {
                    if (!id) return;
                    if (!releases.find((r) => r.id === id)) {
                        releases.push({
                            id,
                            name: `${ui.releasesSnapshot || 'Snapshot'} ${id}`,
                            url: null,
                            isRemote: false
                        });
                    }
                });
            }
        }
    }

    return releases.sort((a, b) => String(b.id).localeCompare(String(a.id)));
}

/**
 * Create a new version tag in content/releases and (when possible) store a curriculum snapshot under that tag.
 * Returns { didSaveSnapshot }.
 */
export async function createReleaseVersion(tagRaw, wantCopy = true) {
    const ui = store.ui;
    const tag = String(tagRaw || '').trim();
    if (!tag) throw new Error(ui.releasesVersionNameRequired || ui.treeNameRequired || 'Enter a version tag.');

    await fileSystem.createNode('content/releases', tag, 'folder');

    let didSaveSnapshot = false;
    if (wantCopy && fileSystem.features.canWrite) {
        const prevLatestId = (() => {
            const publicReleases = store.value.availableReleases || [];
            const ids = publicReleases
                .filter((r) => r && r.type === 'archive')
                .map((r) => String(r.year || r.name || '').trim())
                .filter(Boolean)
                .sort((a, b) => b.localeCompare(a));
            return ids.length ? ids[0] : null;
        })();

        if (fileSystem.isLocal) {
            const tid = fileSystem.localGardenTreeId() || (store.value.activeSource && store.value.activeSource.id);
            const te = tid ? store.userStore.state.localTrees.find((t) => t.id === tid) : null;
            let snap = null;
            if (prevLatestId && ((te && te.releaseSnapshots) ? te.releaseSnapshots[prevLatestId] : undefined)) {
                snap = JSON.parse(JSON.stringify(te.releaseSnapshots[prevLatestId]));
            } else if (te && te.data) {
                snap = JSON.parse(JSON.stringify(te.data));
            }
            if (snap && tid) {
                didSaveSnapshot = store.userStore.saveReleaseSnapshotForVersion(tid, tag, snap);
            }
        } else if (fileSystem.isNostrTreeSource()) {
            const raw = store.value.rawGraphData;
            let snap = null;
            if (prevLatestId && ((raw && raw.releaseSnapshots) ? raw.releaseSnapshots[prevLatestId] : undefined)) {
                const mat = await store.materializeNetworkReleaseSnapshot(prevLatestId);
                snap = mat ? JSON.parse(JSON.stringify(mat)) : cloneCurriculumSnapshotExcludingReleaseMeta(raw);
            } else {
                snap = cloneCurriculumSnapshotExcludingReleaseMeta(raw);
            }
            if (snap) {
                const nextRaw = JSON.parse(JSON.stringify(store.value.rawGraphData || {}));
                nextRaw.releaseSnapshots = nextRaw.releaseSnapshots || {};
                nextRaw.releaseSnapshots[tag] = snap;
                store.update({ rawGraphData: nextRaw });
                DataProcessor.process(store, nextRaw, store.value.activeSource, {
                    suppressReadmeAutoOpen: true
                });
                didSaveSnapshot = true;
            }
        }
    }

    return { didSaveSnapshot };
}

/**
 * Delete a version tag.
 * For local: removes userStore.releaseSnapshots entry (FileSystemService handles it via deleteNode).
 * For published trees: removes rawGraphData.releaseSnapshots entry too.
 */
export async function deleteReleaseVersion(tagRaw) {
    const tag = String(tagRaw || '').trim();
    if (!tag) return;

    await fileSystem.deleteNode(`content/releases/${tag}`, 'folder');

    if (fileSystem.isNostrTreeSource()) {
        const raw = store.value.rawGraphData;
        const snaps = raw && raw.releaseSnapshots ? raw.releaseSnapshots : null;
        if (snaps && Object.prototype.hasOwnProperty.call(snaps, tag)) {
            const nextRaw = JSON.parse(JSON.stringify(raw || {}));
            if (nextRaw.releaseSnapshots) {
                delete nextRaw.releaseSnapshots[tag];
                if (Object.keys(nextRaw.releaseSnapshots).length === 0) delete nextRaw.releaseSnapshots;
            }
            store.update({ rawGraphData: nextRaw });
            DataProcessor.process(store, nextRaw, store.value.activeSource, {
                suppressReadmeAutoOpen: true
            });
        }
    }
}

