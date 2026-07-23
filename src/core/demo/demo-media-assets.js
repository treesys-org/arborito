/**
 * Vite URLs for demo/arborito-demo/media/*.png — instant resolve before IndexedDB seed finishes.
 * Seed still copies them into IDB so export/.arborito packing works like any local branch.
 */

const mediaUrlModules = import.meta.glob('../../../demo/arborito-demo/media/*.png', {
    query: '?url',
    import: 'default',
    eager: true,
});

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
