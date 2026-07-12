const DISMISS_KEY = 'arborito-local-mode-banner-dismissed';

export function isLocalModeBannerDismissed() {
    try {
        return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
        return false;
    }
}

export function dismissLocalModeBanner() {
    try {
        localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
        /* ignore */
    }
}
