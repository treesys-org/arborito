import { useEffect } from 'react';

/** Sync boot hint on #arborito-initial-loader (static markup in index.html). */
export function BootScreen() {
    useEffect(() => {
        try {
            const lang = (localStorage.getItem('arborito-lang') || 'EN').toUpperCase();
            const el = document.getElementById('arborito-loader-hint');
            if (el) el.textContent = lang.indexOf('ES') === 0 ? 'Cargando…' : 'Loading...';
        } catch {
            /* ignore */
        }
    }, []);

    return null;
}
