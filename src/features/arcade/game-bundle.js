/**
 * Download and assemble game cartridges for iframe srcdoc (online or offline).
 */
import { resolveCartridgeAssetUrl } from './cartridge-assets.js';

const MODULE_REF_REGEX = /(?:import|export)\s+[\s\S]*?\sfrom\s+(['"])(.+?)\1/g;

async function fetchTextFromNetwork(url, networkFiles) {
    if (networkFiles.has(url)) return networkFiles.get(url);
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not fetch ${url} (${res.status})`);
    const text = await res.text();
    networkFiles.set(url, text);
    return text;
}

/** @param {string} entryUrl */
export async function downloadGameBundle(entryUrl) {
    const networkFiles = new Map();
    const readText = (url) => fetchTextFromNetwork(url, networkFiles);
    const seen = new Set();

    async function ingestModule(url) {
        if (seen.has(url)) return;
        seen.add(url);
        const content = await readText(url);
        for (const match of content.matchAll(MODULE_REF_REGEX)) {
            const path = match[2];
            if (!path.startsWith('./') && !path.startsWith('../')) continue;
            await ingestModule(new URL(path, url).href);
        }
    }

    await readText(entryUrl);
    const baseHref = entryUrl.substring(0, entryUrl.lastIndexOf('/') + 1);
    const parser = new DOMParser();
    const doc = parser.parseFromString(networkFiles.get(entryUrl), 'text/html');

    for (const script of doc.querySelectorAll('script[type="module"][src]')) {
        const src = script.getAttribute('src');
        if (!src) continue;
        await ingestModule(new URL(src, baseHref).href);
    }

    for (const tag of doc.querySelectorAll('link[href], img[src], audio[src], video[src]')) {
        const attr = tag.hasAttribute('href') ? 'href' : 'src';
        const path = tag.getAttribute(attr);
        if (!path || path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) continue;
        const assetUrl = resolveCartridgeAssetUrl(path, entryUrl);
        if (!assetUrl.startsWith('http') && !assetUrl.startsWith('data:')) continue;
        if (!networkFiles.has(assetUrl)) {
            await fetchTextFromNetwork(assetUrl, networkFiles);
        }
    }

    return {
        entryUrl,
        files: Object.fromEntries(networkFiles),
        updatedAt: Date.now()
    };
}

function readTextFromBundle(url, bundleFiles) {
    const text = bundleFiles[url];
    if (text == null) throw new Error(`Missing offline asset: ${url}`);
    return text;
}

/**
 * @param {string} entryUrl
 * @param {{ entryUrl: string, files: Record<string, string> }} bundle
 * @param {{ injectErrorTrap?: boolean, sdkScriptContent?: string, rewriteAssets?: boolean }} opts
 */
export async function buildGameSrcdoc(entryUrl, bundle, opts = {}) {
    const files = bundle.files || {};
    const baseHref = entryUrl.substring(0, entryUrl.lastIndexOf('/') + 1);
    const scriptCache = new Map();

    async function resolveScript(url) {
        if (scriptCache.has(url)) return scriptCache.get(url);
        /* Nested ES module imports are rewritten to blob URLs so srcdoc iframes can load offline bundles. */
        let scriptContent = readTextFromBundle(url, files);
        for (const match of scriptContent.matchAll(MODULE_REF_REGEX)) {
            const path = match[2];
            if (!path.startsWith('./') && !path.startsWith('../')) continue;
            const nestedUrl = new URL(path, url).href;
            const blobUrl = await resolveScript(nestedUrl);
            const spec = `${match[1]}${path}${match[1]}`;
            scriptContent = scriptContent.split(spec).join(`${match[1]}${blobUrl}${match[1]}`);
        }
        const blob = new Blob([scriptContent], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        scriptCache.set(url, blobUrl);
        return blobUrl;
    }

    const html = readTextFromBundle(entryUrl, files);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (opts.injectErrorTrap !== false) {
        const errorTrapScript = doc.createElement('script');
        errorTrapScript.textContent = `
                window.onerror = function(msg, url, line, col, error) {
                    if (window.parent && window.parent.__ARBORITO_GAME_BRIDGE__) {
                        window.parent.__ARBORITO_GAME_BRIDGE__.reportError(msg + " (Line " + line + ")");
                    }
                };
                window.onunhandledrejection = function(e) {
                    if (window.parent && window.parent.__ARBORITO_GAME_BRIDGE__) {
                        window.parent.__ARBORITO_GAME_BRIDGE__.reportError(e.reason ? e.reason.message : "Unknown Promise Error");
                    }
                };
            `;
        doc.head.prepend(errorTrapScript);
    }

    for (const script of doc.querySelectorAll('script[type="module"][src]')) {
        const src = script.getAttribute('src');
        if (!src) continue;
        const scriptUrl = new URL(src, baseHref).href;
        const blobUrl = await resolveScript(scriptUrl);
        script.setAttribute('src', blobUrl);
    }

    if (opts.sdkScriptContent) {
        const sdkScript = doc.createElement('script');
        sdkScript.textContent = opts.sdkScriptContent;
        doc.body.appendChild(sdkScript);
    }

    if (opts.rewriteAssets !== false) {
        for (const tag of doc.querySelectorAll('link[href], img[src], audio[src], video[src]')) {
            const attr = tag.hasAttribute('href') ? 'href' : 'src';
            const path = tag.getAttribute(attr);
            if (!path || path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) continue;
            const resolved = resolveCartridgeAssetUrl(path, entryUrl);
            const cached = files[resolved];
            if (cached != null && tag.tagName === 'LINK') {
                const style = doc.createElement('style');
                style.textContent = cached;
                tag.replaceWith(style);
                continue;
            }
            if (cached != null) {
                const blob = URL.createObjectURL(new Blob([cached], {
                    type: resolved.endsWith('.css') ? 'text/css' : 'application/octet-stream'
                }));
                tag.setAttribute(attr, blob);
                continue;
            }
            tag.setAttribute(attr, resolved);
        }
    }

    return doc.documentElement.outerHTML;
}
