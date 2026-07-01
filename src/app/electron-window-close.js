import { getArboritoStore } from '../core/store-singleton.js';
import { persistTreeUiState } from '../features/tree-graph/api/tree-ui-persist.js';
import { getPanelRef } from './panel-refs.js';

/** Desktop: intercept window close and show in-app Save / Don't save / Cancel. */
export function initElectronWindowCloseGuard() {
    const bridge = window.arboritoElectron;
    if (!bridge?.onWindowCloseRequest || !bridge?.respondWindowClose) return;

    bridge.onWindowCloseRequest(async () => {
        try {
            persistTreeUiState(getArboritoStore());
        } catch {
            /* ignore */
        }

        const contentEl = getPanelRef('content');
        let decision = 'proceed';
        if (contentEl && typeof contentEl.resolveAppCloseIfNeeded === 'function') {
            try {
                decision = await contentEl.resolveAppCloseIfNeeded();
            } catch {
                decision = 'cancel';
            }
        }
        bridge.respondWindowClose(decision === 'proceed' ? 'proceed' : 'cancel');
    });
}
