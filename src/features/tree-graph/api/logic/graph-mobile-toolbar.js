import { getArboritoStore } from '../../../../core/store-singleton.js';

export async function runMobileNodeAction(node, act) {
    if (!node || !act) return;
    if (act === 'move') {
        if (node.type === 'root') return;
        this.selectedNodeId = node.id;
        this.openMoveNodePicker();
        return;
    }
    if (act === 'edit') {
        this.selectedNodeId = node.id;
        this.isMoveMode = false;
        if (node.type === 'branch' || node.type === 'root') getArboritoStore().setModal({ type: 'node-properties', node });
        else getArboritoStore().openEditor(node);
        return;
    }
    if (act === 'delete' || act === 'add-folder' || act === 'add-file') {
        this.selectedNodeId = node.id;
        const dock =
            act === 'add-folder' ? 'new-folder' : act === 'add-file' ? 'new-file' : 'delete';
        await this.handleDockAction(dock);
    }
}
