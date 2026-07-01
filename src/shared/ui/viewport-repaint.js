/**
 * Force shell + graph layout after Electron window resize / maximize.
 */

import { syncSceneBackgroundLayer } from './scene-background.js';
import { handleGraphPanelResize } from '../../features/tree-graph/api/graph-panel-api.js';

export function forceViewportRepaint() {
    if (typeof window === 'undefined') return;

    syncSceneBackgroundLayer();
    handleGraphPanelResize();

    const gc = document.querySelector('#graph-container');
    if (gc) {
        void gc.offsetHeight;
    }

    const app = document.getElementById('app');
    if (app) {
        void app.offsetHeight;
    }
}

export function initElectronViewportRepaint() {
    if (typeof window === 'undefined') return;
    const bridge = window.arboritoElectron;
    if (!bridge || typeof bridge.onWindowResized !== 'function') return;

    let timer = null;
    const schedule = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            forceViewportRepaint();
        }, 16);
    };

    bridge.onWindowResized(schedule);

    scheduleStartupRepaints();
    window.addEventListener('arborito-viewport', schedule);
    window.addEventListener('arborito-emoji-ready', () => {
        requestAnimationFrame(() => forceViewportRepaint());
    });
}

export function scheduleStartupRepaints() {
    if (typeof window === 'undefined') return;
    const run = () => forceViewportRepaint();
    requestAnimationFrame(run);
    setTimeout(run, 120);
}
