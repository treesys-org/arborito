const DISMISS_KEY = 'arborito-guest-sync-banner-dismissed';

export function isGuestSyncBannerDismissed() {
    try {
        return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
        return false;
    }
}

export function dismissGuestSyncBanner() {
    try {
        localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
        /* ignore */
    }
}
