/**
 * HTTP(S) text fetch that works from Electron `file://` pages (no renderer CORS).
 * In the browser, uses global fetch.
 */

function hasElectronBridge() {
    return typeof window !== 'undefined' && (window.arboritoElectron && window.arboritoElectron.fetchUrl);
}

/**
 * @param {string} url
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function fetchHttpText(url, opts = {}) {
    const timeoutMs = (opts.timeoutMs != null ? opts.timeoutMs : 20000);
    const signal = opts.signal;

    if (hasElectronBridge()) {
        const r = await window.arboritoElectron.fetchUrl(url, { timeoutMs });
        if ((signal && signal.aborted)) {
            throw new DOMException('The user aborted a request.', 'AbortError');
        }
        if (!r.ok) {
            throw new Error(r.error || 'Fetch failed');
        }
        return r.text;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) {
            clearTimeout(timer);
            throw new DOMException('The user aborted a request.', 'AbortError');
        }
        signal.addEventListener('abort', onAbort);
    }
    try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
        clearTimeout(timer);
        if (!res.ok) {
            throw new Error(`Failed to fetch data (Status ${res.status}).`);
        }
        return await res.text();
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
    }
}

/**
 * Try several URLs in order (e.g. CDN mirrors); throws the last error if all fail.
 * @param {string[]} urls
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [opts]
 */
export async function fetchHttpTextTryUrls(urls, opts = {}) {
    const list = (urls || []).filter(Boolean);
    if (!list.length) throw new Error('No URL to fetch');
    let lastErr;
    for (const url of list) {
        try {
            return await fetchHttpText(url, opts);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}
