/**
 * Single viewport relayout pipeline (web + Electron).
 * Debounces resize/IPC until dimensions stabilize, then syncs shell + panels.
 */

import { hideViewportResizeLoader, showViewportResizeLoader } from '../../boot-loader.js';
import { getPanelRef } from '../../app/panel-refs.js';
import { getArboritoStore } from '../../core/store-singleton.js';
import { reapplyViewportDetection } from './breakpoints.js';
import { syncSceneBackgroundLayer } from './scene-background.js';
import {
    handleGraphPanelResize,
    regroundGraphTrunkScroll,
} from '../../features/tree-graph/api/graph-panel-api.js';
import { syncMobileTreeShellClass } from './mobile-tree-shell-class.js';
import { syncLessonReaderChromeClass } from './lesson-reader-open.js';
import {
    resetOverlaysIfBreakpointCrossed,
    initOverlayBreakpointTracking,
} from '../../stores/shell-overlay-coordinator.js';

function isElectronShell() {
    return typeof window !== 'undefined' && !!window.arboritoElectron;
}

function viewportDims() {
    if (typeof window === 'undefined') return { w: 0, h: 0 };
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    return { w, h };
}

function reapplyMobileShellClasses() {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle(
        'arborito-construction-mobile',
        !!getArboritoStore()?.value.constructionMode
    );
    const sb = getPanelRef('sidebar');
    const store = getArboritoStore();
    syncMobileTreeShellClass(store, { mobileMoreOpen: !!(sb && sb.isMobileMenuOpen) });
    syncLessonReaderChromeClass(store);
}

function runRelayoutSettled({ withLoader = false } = {}) {
    const useLoader = withLoader && isElectronShell();
    if (useLoader) showViewportResizeLoader();

    reapplyViewportDetection();
    reapplyMobileShellClasses();
    resetOverlaysIfBreakpointCrossed(getArboritoStore());

    getPanelRef('sidebar')?.render?.();
    getPanelRef('content')?.scheduleUpdate?.(true);
    handleGraphPanelResize();

    syncSceneBackgroundLayer({ pinBody: isElectronShell() });
    regroundGraphTrunkScroll();

    const gc = document.querySelector('#graph-container');
    if (gc) void gc.offsetHeight;
    const app = document.getElementById('app');
    if (app) void app.offsetHeight;

    const finish = () => {
        if (useLoader) hideViewportResizeLoader();
    };

    if (useLoader) {
        requestAnimationFrame(() => {
            requestAnimationFrame(finish);
        });
    }
}

let debounceTimer = null;
let stableTimer = null;
let lastDims = null;
let pendingWithLoader = false;

/**
 * @param {{ source?: string, withLoader?: boolean }} [opts]
 */
export function scheduleViewportRelayout(opts = {}) {
    if (typeof window === 'undefined') return;

    if (opts.withLoader) pendingWithLoader = true;

    const debounceMs = isElectronShell() ? 80 : 120;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        waitForStableDims();
    }, debounceMs);
}

function waitForStableDims(attempt = 0) {
    const dims = viewportDims();
    const key = `${dims.w}x${dims.h}`;

    if (lastDims === key && attempt >= 1) {
        lastDims = key;
        const withLoader = pendingWithLoader;
        pendingWithLoader = false;
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = null;
        runRelayoutSettled({ withLoader });
        return;
    }

    lastDims = key;

    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = setTimeout(() => {
        stableTimer = null;
        requestAnimationFrame(() => {
            waitForStableDims(attempt + 1);
        });
    }, 16);
}

export function initViewportRelayout() {
    if (typeof window === 'undefined') return;
    initOverlayBreakpointTracking();
}

export function runStartupViewportRelayout() {
    scheduleViewportRelayout({ source: 'startup', withLoader: isElectronShell() });
}
