import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { getArboritoStore } from '../../../../core/store-singleton.js';
import { persistNodeMetaProperties } from '../node-meta-persist.js';

/** Optional folder diploma (🏆 on a map folder). Not for linked branch rows in a composed tree. */
export function canIssueOptionalFolderAchievement(node) {
    if (!node || node.type !== 'branch') return false;
    if (node._composedWrapper) return false;
    return true;
}

/**
 * Node toolbar capabilities for construction inline tools.
 * @param {object} node
 */
export function getNodeToolbarCapabilities(node) {
    const isRoot = node?.type === 'root';
    const isBranch = node?.type === 'branch';
    return {
        isRoot,
        canMove: !isRoot && !!fileSystem.features.canMove,
        canDelete: !isRoot,
        canToggleDiploma: canIssueOptionalFolderAchievement(node) && !!fileSystem.features.canWrite,
    };
}

/**
 * ARIA labels and hints for construction inline tool groups.
 * @param {object} ui
 * @param {object} node
 */
export function getNodeToolbarMeta(ui, node) {
    const isRoot = node?.type === 'root';
    return {
        toolsGroupAria:
            (isRoot
                ? ui.graphNodeToolsGroupLabelRoot || ui.graphNodeToolsGroupLabel || ui.graphNodeToolsAriaFallback
                : ui.graphNodeToolsGroupLabel || ui.graphNodeToolsAriaFallback) || 'Node tools',
        folderHint: isRoot
            ? ui.graphFolderToolsScopeHintRoot || ui.graphFolderToolsScopeHint || ''
            : ui.graphFolderToolsScopeHint || '',
    };
}

/**
 * Run a construction graph node action (move / delete).
 * Bound via store context in tree-graph-actions-store-actions.js.
 */
export async function runGraphNodeAction(node, act) {
    if (!node || !act) return;
    if (act === 'move') {
        if (node.type === 'root') return;
        this.selectedNodeId = node.id;
        this.openMoveNodePicker();
        return;
    }
    if (act === 'delete') {
        this.selectedNodeId = node.id;
        await this.handleDockAction('delete');
    }
    if (act === 'toggle-diploma') {
        if (!canIssueOptionalFolderAchievement(node)) return;
        const store = getArboritoStore();
        if (!store) return;
        const next = !node.isCertifiable;
        let originalMeta = {};
        let originalBody = '';
        try {
            const fileData = await fileSystem.getFile(node.id);
            originalMeta = fileData.meta || {};
            originalBody = fileData.body || '';
        } catch {
            /* graph fallback */
        }
        await persistNodeMetaProperties(
            {
                fileSystem,
                store: {
                    value: { lang: store.state.lang, activeSource: store.state.activeSource },
                    loadData: (source, force) => store.loadData(source, force),
                },
            },
            {
                node,
                name: node.name,
                icon: node.icon || '📁',
                description: node.description || '',
                originalMeta,
                originalBody,
                isCertifiable: next,
                skipReload: true,
            }
        );
        node.isCertifiable = next;
        store.update({});
        store.dispatchEvent(new CustomEvent('graph-update'));
        try {
            window.dispatchEvent(new CustomEvent('graph-update'));
        } catch {
            /* ignore */
        }
        const ui = store.ui || {};
        store.notify(
            next
                ? ui.graphDiplomaEnabled || 'Diploma enabled for this folder.'
                : ui.graphDiplomaDisabled || 'Diploma disabled for this folder.',
            false
        );
    }
}
