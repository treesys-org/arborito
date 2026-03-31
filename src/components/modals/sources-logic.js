import { store } from '../../store.js';

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

export function plantNewTree(modal, name) {
    if (!name) return;
    const newTree = store.userStore.plantTree(name);
    const source = {
        id: newTree.id,
        name: newTree.name,
        url: `local://${newTree.id}`,
        type: 'local',
        isTrusted: true
    };
    store.loadData(source);
    store.update({ constructionMode: true });
    modal.close({ returnToMore: false });
    store.setModal({ type: 'sage', mode: 'architect' });
    setTimeout(
        () =>
            store.chatWithSage(
                `I have planted a new garden named "${name}". Please generate a curriculum structure (JSON) for this topic.`
            ),
        500
    );
}

export function importTreeFromFile(modal) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,.arborito';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonData = JSON.parse(event.target.result);
                const newTree = store.userStore.importLocalTree(jsonData);
                const source = {
                    id: newTree.id,
                    name: newTree.name,
                    url: `local://${newTree.id}`,
                    type: 'local'
                };
                store.loadData(source);
                modal.activeTab = 'local';
                modal.close({ returnToMore: false });
            } catch (err) {
                const ui = store.ui;
                store.notify(
                    (ui.sourcesImportError || 'Error importing tree: {message}').replace('{message}', err.message),
                    true
                );
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

export function loadLocalTree(modal, id, name) {
    store.loadData({ id, name, url: `local://${id}`, type: 'local', isTrusted: true });
    modal.close({ returnToMore: false });
}

export function exportLocalTree(id, name) {
    const archiveJson = store.userStore.getArboritoArchive(id);
    if (!archiveJson) return;
    const blob = new Blob([archiveJson], { type: 'application/json' });
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
    const shareLink = `${window.location.origin}${window.location.pathname}?source=${encodeURIComponent(url)}`;
    navigator.clipboard.writeText(shareLink).then(() =>
        store.notify(store.ui.sourcesShareCopied || 'Share link copied to clipboard.')
    );
}
