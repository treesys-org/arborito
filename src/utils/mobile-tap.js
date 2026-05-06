/** Slack pixels before treating the touch as a scroll (Android often moves more than 14px). */
const MOBILE_TAP_SLOP_PX = 26;

/**
 * Reliable activation on touch devices: WebKit often drops synthetic `click` after scrolling
 * a parent (e.g. sheet “More”, tree trunk). Complements `click` for mouse/desktop.
 * If it already fired from touch, the duplicate `click` (~300ms later) is ignored.
 *
 * @param {Element | null | undefined} el
 * @param {(ev: Event) => void} handler
 * @returns {() => void} removes listeners (useful when replacing the container’s innerHTML)
 */
/**
 * True when the event hit the backdrop surface itself, not the modal shell (first child) nor its descendants.
 * Prefer this over `e.target === backdrop` for dismissing modals: touch stacks sometimes retarget oddly.
 *
 * @param {Element | null | undefined} backdrop
 * @param {Event} e
 */
export function isModalBackdropEmptyTap(backdrop, e) {
    if (!backdrop || !(e && e.target)) return false;
    let t = /** @type {Node} */ (e.target);
    if (t.nodeType === 3) t = t.parentElement;
    if (!t) return false;
    const inner = backdrop.firstElementChild;
    if (inner && t instanceof Node && t !== backdrop && inner.contains(t)) return false;
    return t === backdrop;
}

export function bindMobileTap(el, handler) {
    if (!el) return () => {};
    if (el.tagName !== 'BUTTON') {
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
    }

    let touchStartX = 0;
    let touchStartY = 0;
    let lastTouchFireAt = 0;

    const onTouchStart = (e) => {
        const t = (e.touches ? e.touches[0] : undefined) || (e.changedTouches ? e.changedTouches[0] : undefined);
        if (!t) return;
        touchStartX = t.clientX;
        touchStartY = t.clientY;
    };

    const onTouchEnd = (e) => {
        if (!(e.changedTouches && e.changedTouches.length)) return;
        const t = e.changedTouches[0];
        if (
            Math.abs(t.clientX - touchStartX) > MOBILE_TAP_SLOP_PX ||
            Math.abs(t.clientY - touchStartY) > MOBILE_TAP_SLOP_PX
        ) {
            return;
        }
        try {
            e.preventDefault();
        } catch {
            /* noop */
        }
        try {
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
        } catch {
            /* noop */
        }
        lastTouchFireAt = Date.now();
        handler(e);
    };

    const onClick = (ev) => {
        if (Date.now() - lastTouchFireAt < 450) return;
        handler(ev);
    };

    const onKeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            handler(ev);
        }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeydown);

    return () => {
        el.removeEventListener('touchstart', onTouchStart, { passive: true });
        el.removeEventListener('touchend', onTouchEnd, { passive: false });
        el.removeEventListener('click', onClick);
        el.removeEventListener('keydown', onKeydown);
    };
}

/**
 * Delegates `click` + `touchend` on a scrollable container (e.g. sources `#tab-content`).
 * On WebKit/iOS, after `overflow-y: auto` the synthetic `click` sometimes never fires; `elementFromPoint`
 * on `touchend` mirrors the touch target.
 *
 * @param {Element | null | undefined} root
 * @param {(e: Event | { target: Element; currentTarget: Element }) => void} handler
 */
export function addScrollSafeClickDelegation(root, handler) {
    if (!root) return () => {};
    let sx = 0;
    let sy = 0;
    let lastTouchHandledAt = 0;

    const onTouchStart = (e) => {
        const t = (e.touches ? e.touches[0] : undefined) || (e.changedTouches ? e.changedTouches[0] : undefined);
        if (!t) return;
        sx = t.clientX;
        sy = t.clientY;
    };

    const onTouchEnd = (e) => {
        if (!(e.changedTouches && e.changedTouches.length)) return;
        const t = e.changedTouches[0];
        if (Math.abs(t.clientX - sx) > MOBILE_TAP_SLOP_PX || Math.abs(t.clientY - sy) > MOBILE_TAP_SLOP_PX) return;
        let el = null;
        try {
            el = document.elementFromPoint(t.clientX, t.clientY);
        } catch {
            return;
        }
        if (!el || !root.contains(el)) return;
        try {
            e.preventDefault();
        } catch {
            /* noop */
        }
        lastTouchHandledAt = Date.now();
        handler({
            target: el,
            currentTarget: root,
            type: 'touchend',
            preventDefault: () => {},
            stopPropagation: () => {}
        });
    };

    const onClick = (e) => {
        if (Date.now() - lastTouchHandledAt < 450) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            return;
        }
        handler(e);
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: false });
    root.addEventListener('click', onClick);

    return () => {
        root.removeEventListener('touchstart', onTouchStart);
        root.removeEventListener('touchend', onTouchEnd);
        root.removeEventListener('click', onClick);
    };
}
