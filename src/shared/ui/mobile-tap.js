/** Slack pixels before treating the touch as a scroll (Android often moves more than 14px). */
const MOBILE_TAP_SLOP_PX = 36;

/**
 * Mark an element as a tap target so WebKit/Blink fire `click` eagerly:
 *   - skip the legacy 300ms double-tap-to-zoom wait
 *   - never cancel the synthetic click when the finger drifts a few px
 *     while the element lives inside a scrollable container
 * Uses a CSS class (not inline `touch-action`) so scroll surfaces can override
 * with `pan-y` (trunk / lesson body). Inline styles used to win the cascade and
 * steal the first vertical swipe.
 *
 * Use on every interactive element that is NOT itself a scrollable surface.
 *
 * @param {Element | null | undefined} el
 */
export function markTapTarget(el) {
    if (!el || !el.classList) return;
    el.classList.add('arborito-tap-target');
}

/**
 * Swallow the synthetic *click* that follows a touchend activation.
 * Do NOT preventDefault on touchend itself — that poisons WebKit overflow
 * pan-y (trunk needs a second/third drag). Click-only, like the lesson
 * post-close guard. Stops retargeting (Back → adjacent "change branch" chip).
 */
let _ghostUntil = 0;
let _ghostOn = false;
let _ghostTimer = 0;

function ghostClickGuard(e) {
    if (Date.now() >= _ghostUntil) {
        teardownGhostClickGuard();
        return;
    }
    /* Keep programmatic click() (detail 0), e.g. nested btn.click() from a row tap. */
    if (typeof e.detail === 'number' && e.detail === 0) return;
    try {
        e.preventDefault();
    } catch {
        /* noop */
    }
    try {
        e.stopPropagation();
    } catch {
        /* noop */
    }
    if (typeof e.stopImmediatePropagation === 'function') {
        try {
            e.stopImmediatePropagation();
        } catch {
            /* noop */
        }
    }
}

function teardownGhostClickGuard() {
    if (_ghostTimer) {
        clearTimeout(_ghostTimer);
        _ghostTimer = 0;
    }
    if (!_ghostOn) return;
    _ghostOn = false;
    document.removeEventListener('click', ghostClickGuard, true);
}

function armGhostClickGuard(ms = 450) {
    const dur = Math.max(0, Number(ms) || 0);
    _ghostUntil = Date.now() + dur;
    if (_ghostTimer) clearTimeout(_ghostTimer);
    _ghostTimer = setTimeout(() => {
        _ghostTimer = 0;
        teardownGhostClickGuard();
    }, dur + 32);
    if (_ghostOn) return;
    _ghostOn = true;
    document.addEventListener('click', ghostClickGuard, true);
}

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

/**
 * Reliable activation on touch devices: WebKit often drops synthetic `click` after scrolling
 * a parent (e.g. sheet "More", tree trunk). Complements `click` for mouse/desktop.
 * If it already fired from touch, the duplicate `click` (~300ms later) is ignored.
 *
 * @param {Element | null | undefined} el
 * @param {(ev: Event) => void} handler
 * @returns {() => void} removes listeners (useful when replacing the container's innerHTML)
 */
export function bindMobileTap(el, handler, opts = {}) {
    if (!el) return () => {};
    const slopPx = typeof opts.slopPx === 'number' ? opts.slopPx : MOBILE_TAP_SLOP_PX;
    if (el.tagName !== 'BUTTON') {
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
    }

    markTapTarget(el);

    /* Persist touch state ON the element (not in this closure) so that if the host
     * re-wires listeners between `touchstart` and `touchend` (e.g. sources modal
     * `state-change` while the user is mid-tap), the *new* listener can still read
     * the original touch start coordinates. Without this, the new listener would
     * see `touchStartX=0`, compute a huge delta, decide "scroll, not tap" and drop
     * the click, symptom: "trees won't install on mobile when tapping". */
    const stateKey = '__arboritoTapState';
    if (!el[stateKey]) {
        el[stateKey] = { touchStartX: 0, touchStartY: 0, lastTouchFireAt: 0, hasStart: false };
    }
    const state = el[stateKey];

    const onTouchStart = (e) => {
        const t = (e.touches ? e.touches[0] : undefined) || (e.changedTouches ? e.changedTouches[0] : undefined);
        if (!t) return;
        state.touchStartX = t.clientX;
        state.touchStartY = t.clientY;
        state.hasStart = true;
        try {
            const bag = (globalThis.__arboritoTapById = globalThis.__arboritoTapById || new Map());
            bag.set(t.identifier, { x: t.clientX, y: t.clientY, at: Date.now() });
        } catch {
            /* noop */
        }
    };

    const onTouchEnd = (e) => {
        if (!(e.changedTouches && e.changedTouches.length)) return;
        const t = e.changedTouches[0];
        let sx = state.touchStartX;
        let sy = state.touchStartY;
        let hadStart = !!state.hasStart;
        if (!hadStart) {
            try {
                const bag = globalThis.__arboritoTapById;
                const stashed = bag && bag.get(t.identifier);
                if (stashed && Date.now() - stashed.at < 2500) {
                    sx = stashed.x;
                    sy = stashed.y;
                    hadStart = true;
                }
            } catch {
                /* noop */
            }
        }
        try {
            globalThis.__arboritoTapById?.delete?.(t.identifier);
        } catch {
            /* noop */
        }
        state.hasStart = false;
        if (!hadStart) return;
        if (Math.abs(t.clientX - sx) > slopPx || Math.abs(t.clientY - sy) > slopPx) {
            return;
        }
        /* No preventDefault on touchend — WebKit trunk pan poison. Ghost click → armGhostClickGuard. */
        state.lastTouchFireAt = Date.now();
        armGhostClickGuard(450);
        handler(e);
    };

    const onClick = (ev) => {
        if (Date.now() - state.lastTouchFireAt < 450) return;
        handler(ev);
    };

    const onKeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            handler(ev);
        }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeydown);

    return () => {
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchend', onTouchEnd);
        el.removeEventListener('click', onClick);
        el.removeEventListener('keydown', onKeydown);
    };
}

/**
 * Delegates `click` + `touchend` on a scrollable container.
 * On WebKit/iOS, after `overflow-y: auto` the synthetic `click` sometimes never fires; `elementFromPoint`
 * on `touchend` mirrors the touch target.
 *
 * Prefer {@link bindMobileTap} / `useBindMobileTapRef` on each control when using React `onClick`.
 * If the handler calls `el.click()`, do **not** stop that event: `HTMLElement.click()` uses
 * `detail === 0`, and stopping it here used to swallow React handlers (TOC / graph regression).
 *
 * @param {Element | null | undefined} root
 * @param {(e: Event | { target: Element; currentTarget: Element; type: string }) => void} handler
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
        lastTouchHandledAt = Date.now();
        armGhostClickGuard(450);
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
            if (typeof e.detail === 'number' && e.detail === 0) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            return;
        }
        handler(e);
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
    root.addEventListener('click', onClick);

    return () => {
        root.removeEventListener('touchstart', onTouchStart);
        root.removeEventListener('touchend', onTouchEnd);
        root.removeEventListener('click', onClick);
    };
}

/**
 * Wire up `.btn-close` (and friends) on a modal host to a close handler.
 *
 * @param {Element} host
 * @param {() => void} onClose
 * @param {string|string[]} [selector]
 */
export function bindCloseTaps(host, onClose, selector = '.btn-close') {
    if (!host || typeof onClose !== 'function') return;
    const selectors = Array.isArray(selector) ? selector : [selector];
    selectors.forEach((sel) => {
        host.querySelectorAll(sel).forEach((b) => bindMobileTap(b, () => onClose()));
    });
}
