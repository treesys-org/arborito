/** Public API — árbol, grafo, curriculum. */
export { useTreeGraph } from './hooks/useTreeGraph.js';
export { treeGraphStore, useTreeGraphSlice, treeGraphActions, patchTreeGraphSlice, commitTreeGraphState } from '../../stores/tree-graph-store.js';
export { Graph } from './components/Graph.jsx';
export { TreeGrowingOverlay } from './components/TreeGrowingOverlay.jsx';
export { ModalMoveNode } from './modals/MoveNodeModal.jsx';
export { ModalPreview } from './modals/PreviewModal.jsx';
export { ModalTreeInfo } from './modals/TreeInfoModal.jsx';
export { ModalNodeProperties } from './modals/NodePropertiesModal.jsx';
