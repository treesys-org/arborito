import { store } from '../../../core/store.js';
import { getAliasForUrl } from '../tree-aliases.js';
import { runPlantNewTree } from '../plant-flow.js';
import { readArboritoArchive } from '../../../shared/lib/arborito-archive.js';

export function handleSwitch(modal) {
    if (modal.selectedVersionUrl) {
        const releases = store.value.availableReleases || [];
        const target = releases.find((r) => r.url === modal.selectedVersionUrl);
        if (target) {
            const active = store.value.activeSource;
            const newSource = {
                ...active,
                id: target.id || `release-${Date.now()}`,
                url: target.url,
                type: target.type,
                name: target.name || active.name
            };
            store.loadData(newSource);
            modal.close({ returnToMore: false });
        }
    }
}

export async function plantNewTree(modal, name, skeleton = null) {
    await runPlantNewTree(store, name, modal, skeleton);
}

export function importTreeFromFile(modal) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.arborito';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const jsonData = await readArboritoArchive(event.target.result);
                const newTree = store.userStore.importLocalTree(jsonData);
                const source = {
                    id: newTree.id,
                    name: newTree.name,
                    url: `local://${newTree.id}`,
                    type: 'local'
                };
                await store.loadData(source);
                const sum = jsonData.meta && jsonData.meta.importSummary;
                if (sum && typeof sum === 'object') {
                    const { countCareDue } = await import('../../garden-progress/care-reminders.js');
                    const due = countCareDue(store);
                    const ui = store.ui;
                    const tpl =
                        ui.importCareDone ||
                        '{notes} lecciones importadas · {scheduled} con cuidados programados · {due} pendientes hoy.';
                    store.notify(
                        String(tpl)
                            .replace(/\{notes\}/g, String(sum.noteCount ?? ''))
                            .replace(/\{scheduled\}/g, String(sum.noteCount ?? ''))
                            .replace(/\{due\}/g, String(due)),
                        false
                    );
                }
                modal.activeTab = 'local';
                if (modal?.skipCloseAfterImport) {
                    if (typeof modal.updateContent === 'function') modal.updateContent();
                    return;
                }
                modal.close({ returnToMore: false });
            } catch (err) {
                const ui = store.ui;
                store.notify(
                    (ui.sourcesImportError || 'Error importing tree: {message}').replace('{message}', err.message),
                    true
                );
            }
        };
        reader.readAsArrayBuffer(file);
    };
    input.click();
}

export function loadLocalTree(modal, id, name) {
    void (async () => {
        await store.loadData({ id, name, url: `local://${id}`, type: 'local', isTrusted: true });
        if (modal?.skipCloseAfterImport) {
            if (typeof modal.updateContent === 'function') modal.updateContent();
            return;
        }
        modal.close({ returnToMore: false });
    })();
}

export async function exportLocalTree(id, name) {
    const entry = store.userStore.state.localTrees.find((t) => t.id === id);
    if (!entry) return;

    const snaps = entry.data?.releaseSnapshots;
    const snapIds =
        snaps && typeof snaps === 'object'
            ? Object.keys(snaps).sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
            : [];
    let releaseSnapshotIds = null;

    if (snapIds.length > 0) {
        const ui = store.ui;
        const rows = snapIds.map((snapId) => ({
            id: snapId,
            label: (ui.exportSnapshotRowLabel || '{{id}}').replace(/\{\{\s*id\s*\}\}/gi, snapId)
        }));
        const picked = await store.showExportSnapshotsPickDialog({
            title: ui.exportReleaseSnapshotsTitle ?? 'Export',
            body: ui.exportReleaseSnapshotsBody ?? '',
            confirmText: ui.exportSnapshotsExport ?? 'Export',
            selectAllText: ui.exportSnapshotsSelectAll ?? 'Select all',
            selectNoneText: ui.exportSnapshotsSelectNone ?? 'Select none',
            snapshots: rows
        });
        if (picked == null) return;
        releaseSnapshotIds = picked;
    }

    const archiveBytes = await store.exportLocalTreeArchive(id, { releaseSnapshotIds });
    if (!archiveBytes) return;
    const blob = new Blob([archiveBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `arborito-garden-${safeName}.arborito`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function shareActiveTree() {
    const url = store.value.activeSource?.url;
    if (!url) return;
    const sc = store.value.activeSource?.shareCode;
    const sourceParam = sc || getAliasForUrl(url) || url;
    const shareLink = `${window.location.origin}${window.location.pathname}?source=${encodeURIComponent(sourceParam)}`;
    navigator.clipboard.writeText(shareLink).then(() =>
        store.notify(store.ui.sourcesShareCopied || 'Share link copied to clipboard.')
    );
}
