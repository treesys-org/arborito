import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { getPanelRef } from '../../../app/panel-refs.js';

export const TOUR_PAD = 10;
/** Extra ring padding for the root clover SVG (visual bounds exceed the knot box). */
export const TOUR_PAD_GRAPH_ROOT = 20;

function unionRects(a, b) {
    if (!a) return b;
    if (!b) return a;
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    const right = Math.max(a.right, b.right);
    const bottom = Math.max(a.bottom, b.bottom);
    return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

function queryGraphRootTourTarget() {
    const el =
        document.querySelector('[data-tour-id="graph-root"]') ||
        document.querySelector('[data-arbor-tour="graph-root"]');
    if (!el) return null;
    return el.closest('.mobile-knot-wrapper') || el;
}

export function queryTourTarget(target) {
    if (!target) return null;

    if (target === 'graph' || target === 'graph-root') {
        const root = queryGraphRootTourTarget();
        if (root) return root;
        if (target === 'graph-root') {
            const panel =
                document.querySelector('[data-arborito-panel="graph"]') ||
                document.querySelector('#mobile-tree-ui.visible');
            if (panel) return panel;
        }
    }

    const escaped = CSS.escape(target);
    const selTourId = `[data-tour-id="${escaped}"]`;
    const selArborTour = `[data-arbor-tour="${escaped}"]`;
    const el = document.querySelector(selTourId) || document.querySelector(selArborTour);
    if (!el) return null;
    if (target === 'graph-root') {
        return el.closest('.mobile-knot-wrapper') || el;
    }
    return el;
}

export function stepHasTarget(step) {
    if (!(step && step.target)) return false;
    return !!queryTourTarget(step.target);
}

export function rectForElement(el, targetHint) {
    if (!el || !el.getBoundingClientRect) return null;

    if (targetHint === 'graph-root') {
        const knot =
            el.matches?.('[data-tour-id="graph-root"], [data-arbor-tour="graph-root"]') ?
                el
            :   el.querySelector?.('[data-tour-id="graph-root"], [data-arbor-tour="graph-root"]');
        const mark = knot?.querySelector?.('.arborito-root-knot-mark, .mobile-knot__svg');
        const wrapper = knot?.closest?.('.mobile-knot-wrapper') || knot || el;
        let r = null;
        for (const node of [mark, knot, wrapper]) {
            if (!node?.getBoundingClientRect) continue;
            const box = node.getBoundingClientRect();
            if (box.width < 2 || box.height < 2) continue;
            r = unionRects(r, box);
        }
        if (r) return r;
    }

    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return null;
    return r;
}

export function fallbackRect() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rw = Math.min(w * 0.72, 520);
    const rh = Math.min(h * 0.5, 380);
    return new DOMRect((w - rw) / 2, (h - rh) / 2, rw, rh);
}

export function cloneTourStep(step) {
    if (!step || typeof step !== 'object') return null;
    return {
        target: String(step.target || ''),
        title: String(step.title || ''),
        body: String(step.body || '')
    };
}

/** True when a leaf/exam is open in construction and the lesson-edit tour anchors exist. */
export function isLessonEditTourContextReady() {
    if (!store.value.constructionMode) return false;
    const node = store.value.selectedNode;
    if (!node || (node.type !== 'leaf' && node.type !== 'exam')) return false;
    const panel = getPanelRef('content');
    if (!panel?.currentNode) return false;
    const root =
        document.querySelector('[data-arborito-panel="content"]') ||
        document.getElementById('content-panel');
    if (!(root instanceof Element)) return false;
    return !!(
        root.querySelector('[data-tour-id="lesson-edit-meta"]') ||
        root.querySelector('[data-arbor-tour="lesson-edit-meta"]')
    );
}
