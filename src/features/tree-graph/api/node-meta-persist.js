import { reconstructArboritoFile } from '../../editor/api/editor-engine.js';
import { folderReadmeFromNode } from '../../../shared/lib/arborito-archive.js';

const FOLDER_README_SUFFIX = '/README.md';

/**
 * Target file path for node metadata (folder `README.md` or lesson `.md`).
 * @param {object} node
 * @param {string} [lang]
 */
export function getNodeMetaTargetPath(node, lang) {
    let path = node.sourcePath;

    if (!path && node.type === 'root') {
        path = `lessons/${lang || 'EN'}`;
    }

    if (path && path.startsWith('/')) path = path.substring(1);

    if (node.type === 'branch' || node.type === 'root') {
        if (path && !path.endsWith(FOLDER_README_SUFFIX)) {
            path = path.endsWith('/') ? `${path}README.md` : `${path}/README.md`;
        }
    }
    return path;
}

/**
 * Persist name, icon and description for a leaf/branch/root node.
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
        newContent = folderReadmeFromNode({
            ...node,
            name,
            icon,
            description
        });
    } else {
        newContent = reconstructArboritoFile(newMeta, originalBody);
    }

    const targetPath = getNodeMetaTargetPath(node, store.value.lang);
    const nodePayload = targetPath ? { ...node, sourcePath: targetPath } : { ...node };

    await fileSystem.saveFile(nodePayload, newContent, newMeta, `Update properties: ${name}`);

    if (name !== node.name) {
        let originalFolderPath = node.sourcePath || '';
        if (originalFolderPath.endsWith(FOLDER_README_SUFFIX)) {
            originalFolderPath = originalFolderPath.slice(0, -FOLDER_README_SUFFIX.length);
        }
        if (originalFolderPath) {
            await fileSystem.renameNode(originalFolderPath, name, isFolder ? 'folder' : 'file');
        }
    }

    if (!skipReload) {
        await store.loadData(store.value.activeSource, false);
    }
}
