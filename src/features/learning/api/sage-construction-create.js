import { getArboritoStore } from '../../../core/store-singleton.js';

/**
 * Create a tree node from Sage AI quick actions (construction mode only).
 * @param {'create-lesson'|'create-folder'|'create-exam'} action
 * @param {{ parentNode?: object | null, ui?: Record<string, string> }} [opts]
 * @returns {Promise<boolean>}
 */
export async function runSageConstructionCreate(action, { parentNode = null, ui: uiOverride } = {}) {
    const store = getArboritoStore();
    if (!store) return false;

    const ui = uiOverride || store.ui || {};
    if (!store.state.constructionMode) {
        store.notify(ui.sageGuideConNeedConstruction || ui.navConstruct || 'Construction mode', true);
        return false;
    }

    let parent = parentNode || store.state.selectedNode;
    if (!parent || (parent.type !== 'root' && parent.type !== 'branch')) {
        store.notify(
            ui.sageGuideConPickModule ||
                ui.sageGuideConstructNoSel ||
                'Tap a module on the map first.',
            true
        );
        return false;
    }

    store.selectMobileNode?.(parent.id);
    store.setGraphMoveMode?.(false);

    const dockAct =
        action === 'create-folder' ? 'new-folder' : action === 'create-exam' ? 'new-exam' : 'new-file';

    await store.handleGraphDockAction?.(dockAct, { skipPrompt: true });
    store.bumpGraphUiRevision?.();
    return true;
}
