/** Resolve and apply Arborito light/dark theme on <html> (boot splash + runtime). */

/** User chose light/dark in preferences (not following OS). */
export function hasExplicitThemePreference() {
    try {
        const t = localStorage.getItem('arborito-theme');
        return t === 'dark' || t === 'light';
    } catch {
        return false;
    }
}

/** OS / desktop shell preference when the user has not saved a theme. */
export function resolveSystemThemePreference() {
    if (typeof window !== 'undefined') {
        const bridge = window.arboritoElectron?.systemTheme;
        if (bridge && typeof bridge.get === 'function') {
            const t = bridge.get();
            if (t === 'dark' || t === 'light') return t;
        }
    }
    try {
        if (typeof window !== 'undefined' && window.matchMedia) {
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
            if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
        }
    } catch {
        /* ignore */
    }
    return 'light';
}

export function resolveStoredTheme() {
    if (hasExplicitThemePreference()) {
        try {
            return localStorage.getItem('arborito-theme') === 'dark' ? 'dark' : 'light';
        } catch {
            /* ignore */
        }
    }
    return resolveSystemThemePreference();
}

export function applyArboritoTheme(theme) {
    if (typeof document === 'undefined') return;
    const dark = theme === 'dark';
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    try {
        let meta = document.querySelector('meta[name="theme-color"]:not([media])');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', dark ? '#0a1e16' : '#ecfdf5');
    } catch {
        /* ignore */
    }
}
