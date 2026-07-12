/**
 * Minimal focus trap for modal dialogs (WCAG 2.4.3).
 */

const TABBABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function tabbablesIn(container) {
    return [...container.querySelectorAll(TABBABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
    );
}

/**
 * @param {HTMLElement} container
 * @param {{ onEscape?: () => void }} [opts]
 * @returns {() => void} release
 */
export function trapFocus(container, opts = {}) {
    if (!container) return () => {};
    const previous = document.activeElement;

    const onKeyDown = (e) => {
        if (e.key === 'Escape' && typeof opts.onEscape === 'function') {
            opts.onEscape();
            return;
        }
        if (e.key !== 'Tab') return;
        const nodes = tabbablesIn(container);
        if (!nodes.length) {
            e.preventDefault();
            return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    container.addEventListener('keydown', onKeyDown);

    return () => {
        container.removeEventListener('keydown', onKeyDown);
        if (previous && typeof previous.focus === 'function') {
            try { previous.focus({ preventScroll: true }); } catch (_) {}
        }
    };
}

export function setMainAppInert(inert) {
    const app = document.getElementById('app');
    if (!app) return;
    if (inert) app.setAttribute('aria-hidden', 'true');
    else app.removeAttribute('aria-hidden');
}
