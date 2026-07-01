/**
 * Explicit construction-mode sync across the UI (mobile + desktop).
 * The store already sets `html.arborito-construction-mobile` in `UIStore.update`; here we nudge
 * repaints that sometimes do not arrive from `state-change` alone (mobile trunk, panel).
 */

import { maybePromptConstructionEditTarget } from './construction-enter-flow.js';
import { getPanelRef } from '../../../app/panel-refs.js';

/**
 * @param {EventTarget & { value?: object }} storeLike — store instance (EventTarget + `.value`)
 * @param {{ entering?: boolean }} [opts]
 */
export function afterConstructionModeMutation(storeLike, opts = {}) {
    if (typeof document === 'undefined') return;
    const entering = opts.entering ?? !!storeLike.value?.constructionMode;
    const shellReady = storeLike.value?.constructionMode
        ? import('../../../shell-lazy-init.js').then((m) => m.preloadConstructionPanel())
        : Promise.resolve();
    void shellReady.then(async () => {
        try {
            storeLike.dispatchEvent(new CustomEvent('graph-update'));
        } catch {
            /* ignore */
        }
        import('../../search/api/search-index-service.js').then((m) => {
            try {
                m.scheduleSearchIndexAfterConstructionMutation(storeLike);
            } catch {
                /* ignore */
            }
        });
        const panel = getPanelRef('construction-panel');
        if (panel && typeof panel.syncConstructionFromStore === 'function') {
            panel.syncConstructionFromStore();
        }
        if (entering && storeLike.value?.constructionMode) {
            await maybePromptConstructionEditTarget();
        }
    });
}
