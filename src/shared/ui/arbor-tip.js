/**
 * Floating tooltips for chrome buttons — avoids native title + CSS ::after glitches
 * with color emoji on Linux Electron (random glyph vs label).
 */

let tipEl = null;
/** @type {Element|null} */
let tipAnchor = null;

function ensureTipEl() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.id = 'arborito-tip-float';
    tipEl.className = 'arborito-tip-float';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
}

function tipText(el) {
    const raw = el.getAttribute('data-arbor-tip');
    return raw && String(raw).trim() ? String(raw).trim() : '';
}

function positionTip(anchor) {
    if (!tipEl || tipEl.hidden) return;
    const r = anchor.getBoundingClientRect();
    const margin = 8;
    tipEl.style.left = '0';
    tipEl.style.top = '0';
    tipEl.hidden = false;
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    let top = r.top - th - margin;
    const maxLeft = window.innerWidth - tw - margin;
    left = Math.max(margin, Math.min(maxLeft, left));
    if (top < margin) top = r.bottom + margin;
    tipEl.style.left = `${Math.round(left)}px`;
    tipEl.style.top = `${Math.round(top)}px`;
}

function showTip(anchor) {
    const text = tipText(anchor);
    if (!text) return;
    const el = ensureTipEl();
    el.textContent = text;
    el.hidden = false;
    tipAnchor = anchor;
    positionTip(anchor);
}

function hideTip() {
    if (!tipEl) return;
    tipEl.hidden = true;
    tipAnchor = null;
}

function onPointerOver(e) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const anchor = t.closest('[data-arbor-tip]');
    if (!anchor || anchor === tipAnchor) return;
    showTip(anchor);
}

function onPointerOut(e) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const from = t.closest('[data-arbor-tip]');
    if (!from || from !== tipAnchor) return;
    const rel = e.relatedTarget;
    if (rel instanceof Element && from.contains(rel)) return;
    hideTip();
}

function onScrollOrResize() {
    if (tipAnchor) positionTip(tipAnchor);
}

export function initArborTips() {
    if (typeof document === 'undefined') return;
    const coarsePointer =
        typeof window !== 'undefined' &&
        window.matchMedia('(pointer: coarse)').matches;
    if (!coarsePointer) {
        document.addEventListener('pointerover', onPointerOver, true);
        document.addEventListener('pointerout', onPointerOut, true);
    }
    document.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t instanceof Element) {
            const anchor = t.closest('[data-arbor-tip]');
            if (anchor) showTip(anchor);
        }
    }, true);
    document.addEventListener('focusout', (e) => {
        const t = e.target;
        if (t instanceof Element && t.closest('[data-arbor-tip]') === tipAnchor) hideTip();
    }, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onScrollOrResize);
        window.visualViewport.addEventListener('scroll', onScrollOrResize);
    }
}
