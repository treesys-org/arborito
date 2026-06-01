/**
 * Resolve cartridge asset paths when HTML is injected into a srcdoc iframe.
 * Root-absolute paths like `/tailwind.css` must not use `new URL(path, baseHref)`
 * (that resolves to the host root, e.g. raw.githubusercontent.com/tailwind.css).
 */

/** @param {string} cartridgeUrl */
function getCartridgeRepoBase(cartridgeUrl) {
    const cartridgesIdx = cartridgeUrl.indexOf('/cartridges/');
    if (cartridgesIdx !== -1) {
        return cartridgeUrl.substring(0, cartridgesIdx + 1);
    }
    return cartridgeUrl.substring(0, cartridgeUrl.lastIndexOf('/') + 1);
}

/** @param {string} path @param {string} cartridgeUrl */
export function resolveCartridgeAssetUrl(path, cartridgeUrl) {
    if (!path || path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) {
        return path;
    }

    const baseHref = cartridgeUrl.substring(0, cartridgeUrl.lastIndexOf('/') + 1);

    if (path.startsWith('/')) {
        const repoBase = getCartridgeRepoBase(cartridgeUrl);
        const rootRelative = path.slice(1);
        return repoBase + 'public/' + rootRelative;
    }

    return new URL(path, baseHref).href;
}
