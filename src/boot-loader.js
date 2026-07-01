/**
 * Dismiss the full-screen boot spinner. Idempotent — safe to call from anywhere.
 */

let dismissed = false;
let fallbackScheduled = false;

/** True after the first successful dismiss (may run before React mounts BootScreen). */
export function isBootLoaderDismissed() {
    if (dismissed) return true;
    if (typeof document === 'undefined') return false;
    const root = document.documentElement;
    return (
        root.classList.contains('arborito-shell-ready') ||
        root.classList.contains('arborito-onboarding-ready')
    );
}

function performDismiss() {
    if (typeof document === 'undefined' || dismissed) return;
    dismissed = true;
    document.documentElement.classList.remove('arborito-onboarding-boot');
    document.documentElement.classList.add('arborito-shell-ready');
    const loader = document.getElementById('arborito-initial-loader');
    if (loader) {
        loader.dataset.arboritoDismissed = '1';
        loader.setAttribute('aria-busy', 'false');
    }
    window.dispatchEvent(new CustomEvent('arborito-boot-dismiss'));
}

/** Hide the boot overlay after one paint frame so the shell can lay out first. */
export function hideInitialLoader() {
    if (dismissed) return;
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => performDismiss());
    } else {
        performDismiss();
    }
}

/** Onboarding welcome rendered — dismiss overlay so step 1 is immediately interactive. */
export function notifyOnboardingShellPainted() {
    const root = document.documentElement;
    root.classList.remove('arborito-onboarding-boot');
    root.classList.add('arborito-onboarding-ready');
    performDismiss();
    /* Step-2 onboarding UI ships in the eager OnboardingModal bundle — no mixin prefetch. */
}

/** Last-resort if the module graph never finishes loading. */
export function scheduleBootLoaderFallback(ms = 12000) {
    if (typeof window === 'undefined' || fallbackScheduled) return;
    fallbackScheduled = true;
    setTimeout(() => {
        if (dismissed) return;
        console.warn('[Arborito] boot loader fallback — forcing dismiss');
        performDismiss();
    }, ms);
}
