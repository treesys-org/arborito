import { reconstructArboritoFile } from './editor-engine.js';

/**
 * Target file path for node metadata (folder meta.json or lesson file).
 * @param {object} node
 * @param {string} [lang]
 */
export function getNodeMetaTargetPath(node, lang) {
    let path = node.sourcePath;

    if (!path && node.type === 'root') {
        path = `content/${lang || 'EN'}`;
    }

    if (path && path.startsWith('/')) path = path.substring(1);

    if (node.type === 'branch' || node.type === 'root') {
        if (path && !path.endsWith('meta.json')) {
            path = path.endsWith('/') ? path + 'meta.json' : path + '/meta.json';
        }
    }
    return path;
}

/**
 * Persist name, icon, description for a leaf/branch/root node (same rules as modal).
 * @param {{ fileSystem: any, store: any }} deps
 * @param {object} opts
 */
export async function persistNodeMetaProperties(deps, opts) {
    const { fileSystem, store } = deps;
    const { node, name, icon, description, originalMeta, originalBody, skipReload } = opts;

    const newMeta = {
        ...originalMeta,
        title: name,
        icon,
        description
    };

    const isFolder = node.type === 'branch' || node.type === 'root';
    let newContent = '';

    if (isFolder) {
        newContent = JSON.stringify(
            {
                name,
                icon,
                description,
                order: originalMeta.order || '99'
            },
            null,
            2
        );
    } else {
        newContent = reconstructArboritoFile(newMeta, originalBody);
    }

    const targetPath = getNodeMetaTargetPath(node, store.value.lang);
    // Local / Nostr saves resolve the node by id in saveFile(); sourcePath is optional and may be
    // missing on some nodes (e.g. local trees before path sync). Do not require it to persist meta.
    const nodePayload = targetPath ? { ...node, sourcePath: targetPath } : { ...node };

    await fileSystem.saveFile(nodePayload, newContent, newMeta, `Update properties: ${name}`);

    if (name !== node.name) {
        let originalFolderPath = node.sourcePath || '';
        if (originalFolderPath.endsWith('/meta.json')) {
            originalFolderPath = originalFolderPath.replace('/meta.json', '');
        }
        // Local/network saves already refresh the in-memory graph via `saveFile()` → `processLoadedData()`.
        // Calling `renameNode()` here with an empty/mismatched path can break inline renames.
        if (originalFolderPath) {
            await fileSystem.renameNode(originalFolderPath, name, isFolder ? 'folder' : 'file');
        }
    }

    // Optional: avoid a full reload right after an instant save (local/network) — callers can refresh explicitly.
    if (!skipReload) {
        await store.loadData(store.value.activeSource, false);
    }
}
