/**
 * Illustrated app background — real DOM layer (not body::before).
 * Electron/Linux Chromium can leave fixed pseudo-element backgrounds torn on resize;
 * explicit pixel sizing + paint invalidation fixes the seam until interaction.
 */

let rafPending = false;
/** @type {ResizeObserver|null} */
let resizeObserver = null;

export function syncSceneBackgroundLayer() {
    if (typeof document === 'undefined') return;

    const el = document.getElementById('arborito-scene-bg');
    if (!el) return;

    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(vv?.width ?? window.innerWidth));
    const h = Math.max(1, Math.round(vv?.height ?? window.innerHeight));
    const top = Math.round(vv?.offsetTop ?? 0);
    const left = Math.round(vv?.offsetLeft ?? 0);

    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;

    /* Electron: % height on position:fixed body can lag behind the viewport. */
    const body = document.body;
    if (body && body.classList.contains('arborito-app')) {
        body.style.width = '100%';
        body.style.minHeight = `${h}px`;
        body.style.height = `${h}px`;
    }

    const app = document.getElementById('app');
    if (app) {
        app.style.width = '';
        app.style.maxWidth = '';
    }

    el.style.backgroundSize = '100.03% 100.03%';
    void el.offsetHeight;
    el.style.backgroundSize = 'cover';
}

function scheduleSceneBackgroundSync() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        syncSceneBackgroundLayer();
    });
}

export function initSceneBackground() {
    if (typeof window === 'undefined') return;
    if (!document.getElementById('arborito-scene-bg')) return;

    syncSceneBackgroundLayer();

    window.addEventListener('resize', scheduleSceneBackgroundSync, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleSceneBackgroundSync, { passive: true });
        window.visualViewport.addEventListener('scroll', scheduleSceneBackgroundSync, { passive: true });
    }

    if (typeof ResizeObserver !== 'undefined' && !resizeObserver) {
        resizeObserver = new ResizeObserver(scheduleSceneBackgroundSync);
        resizeObserver.observe(document.documentElement);
        if (document.body) resizeObserver.observe(document.body);
    }

    try {
        const classObs = new MutationObserver(scheduleSceneBackgroundSync);
        classObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
}
