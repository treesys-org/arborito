/** Loopback / local-workspace boot helpers for SourceManager. */

export function isLoopbackLocalBoot() {
    const h = window.location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1') return false;
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('localBoot') === '1') return true;
        return localStorage.getItem('arborito-local-boot') === 'true';
    } catch {
        return false;
    }
}

export async function checkLocalBootSource() {
    try {
        const check = await fetch('./data/data.json', { method: 'HEAD' });
        if (check.ok) {
            return {
                id: 'local-boot',
                name: 'Local Workspace',
                url: './data/data.json',
                isTrusted: true,
                type: 'rolling',
            };
        }
    } catch {
        /* no local data */
    }
    return null;
}
