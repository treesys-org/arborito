/**
 * Force shell + graph layout after Electron window resize / maximize.
 */

import { syncSceneBackgroundLayer } from './scene-background.js';
import { handleGraphPanelResize, regroundGraphTrunkScroll } from '../../features/tree-graph/api/graph-panel-api.js';
import { getPanelRef } from '../../app/panel-refs.js';
import {
    scheduleViewportRelayout,
    initViewportRelayout,
    runStartupViewportRelayout,
} from './viewport-relayout.js';

export function forceViewportRepaint({ withLoader = false, pinBody = false } = {}) {
    if (typeof window === 'undefined') return;

    syncSceneBackgroundLayer({ pinBody: pinBody && !!window.arboritoElectron });
    handleGraphPanelResize();
    regroundGraphTrunkScroll();

    const gc = document.querySelector('#graph-container');
    if (gc) void gc.offsetHeight;

    const app = document.getElementById('app');
    if (app) void app.offsetHeight;

    if (withLoader) {
        scheduleViewportRelayout({ source: 'force-repaint', withLoader: true });
    }
}

export function initElectronViewportRepaint() {
    if (typeof window === 'undefined') return;
    const bridge = window.arboritoElectron;
    if (!bridge || typeof bridge.onWindowResized !== 'function') return;

    bridge.onWindowResized(() => {
        scheduleViewportRelayout({ source: 'electron-ipc', withLoader: true });
    });

    window.addEventListener('arborito-emoji-ready', () => {
        requestAnimationFrame(() => forceViewportRepaint());
    });
}

export function scheduleStartupRepaints() {
    if (typeof window === 'undefined') return;
    runStartupViewportRelayout();
}

export { scheduleViewportRelayout, initViewportRelayout } from './viewport-relayout.js';
