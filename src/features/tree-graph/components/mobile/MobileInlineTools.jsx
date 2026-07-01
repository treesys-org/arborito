import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';

function constructionToolbarUi(ui, node) {
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
 * Construction inline tools (move / delete) — JSX port of graph-mobile-toolbar.js.
 */
export function MobileInlineTools({ node, compact, folderContextDimmed, revealDelete, omitDelete }) {
    const tree = useTreeGraph();
    const { ui, userStore, graphUi, constructionMode } = tree;
    const canWrite = fileSystem.features.canWrite;

    const runAct = async (act) => {
        if (!node) return;
        await tree.runGraphNodeAction(node, act);
        tree.bumpGraphUiRevision();
    };

    if (!node || !canWrite) return null;

    const isRoot = node.type === 'root';
    const canMove = !isRoot && fileSystem.features.canMove;
    const ct = constructionToolbarUi(ui, node);
    const compactClass = compact ? ' mobile-inline-tools--compact' : '';
    const shouldHide = revealDelete !== false && !constructionMode;
    const delReveal = shouldHide ? ' mobile-inline-tool--hover-reveal' : '';
    const hostExtra = folderContextDimmed ? ' mobile-inline-tools-host--folder-context-dimmed' : '';
    const hostTitle = folderContextDimmed && ct.folderHint ? ct.folderHint : undefined;

    return (
        <div
            className={`mobile-inline-tools-host${hostExtra}`}
            title={hostTitle}
        >
            <div
                className={`mobile-inline-tools${compactClass}`}
                role="group"
                aria-label={ct.toolsGroupAria}
            >
                {canMove ? (
                    <button
                        type="button"
                        className="mobile-inline-tool"
                        aria-label={ui.graphMove || 'Move'}
                        title={ui.graphMove || 'Move'}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void runAct('move');
                        }}
                    >
                        <span aria-hidden="true">↕️</span>
                    </button>
                ) : null}
                {!isRoot && !omitDelete ? (
                    <button
                        type="button"
                        className={`mobile-inline-tool mobile-inline-tool--danger${delReveal}`}
                        aria-label={ui.graphDelete || 'Delete'}
                        title={ui.graphDelete || 'Delete'}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void runAct('delete');
                        }}
                    >
                        <span aria-hidden="true">✕</span>
                    </button>
                ) : null}
            </div>
        </div>
    );
}
