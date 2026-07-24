/**
 * Vite URLs for demo/arborito-demo/media/*.png — instant resolve before IndexedDB seed finishes.
 * Seed still copies them into IDB so export/.arborito packing works like any local branch.
 */

/** Vite rewrites glob to a module map; Node CI has no glob — empty map is fine for store smoke. */
const mediaUrlModules = (() => {
    try {
        return import.meta.glob('../../../demo/arborito-demo/media/*.png', {
            query: '?url',
            import: 'default',
            eager: true,
        });
    } catch (_) {
        return {};
    }
})();

/** @type {Map<string, string>} */
const BY_FILENAME = new Map();
for (const [modPath, url] of Object.entries(mediaUrlModules)) {
    const base = String(modPath || '')
        .split(/[/\\]/)
        .pop();
    if (base && typeof url === 'string' && url) BY_FILENAME.set(base.toLowerCase(), url);
}

/** @param {string} filename */
export function resolveBundledDemoMediaUrl(filename) {
    const file = String(filename || '')
        .split(/[/\\]/)
        .pop()
        .trim();
    if (!file) return '';
    return BY_FILENAME.get(file.toLowerCase()) || '';
}

export function listBundledDemoMediaFilenames() {
    return [...BY_FILENAME.keys()];
}
