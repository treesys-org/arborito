const JSPDF_REL = 'vendor/jspdf/jspdf.umd.min.js';

export function vendorScriptUrl(relativePath) {
    const bridge = typeof window !== 'undefined' ? window.arboritoElectron : null;
    if (bridge?.resolveAsset) {
        return bridge.resolveAsset(relativePath);
    }
    return new URL(relativePath, document.baseURI).href;
}

function loadScriptOnce(src, globalCheck) {
    if (globalCheck()) return Promise.resolve();
    loadScriptOnce.cache = loadScriptOnce.cache || new Map();
    if (loadScriptOnce.cache.has(src)) return loadScriptOnce.cache.get(src);

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
            if (globalCheck()) resolve();
            else reject(new Error('pdf_lib_missing'));
        };
        script.onerror = () => reject(new Error('pdf_lib_load_failed'));
        document.head.appendChild(script);
    });

    loadScriptOnce.cache.set(src, promise);
    return promise;
}

/** Load jsPDF constructor from vendored UMD bundle. */
export async function loadJsPdf() {
    if (typeof window === 'undefined') throw new Error('no_window');
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;

    await loadScriptOnce(vendorScriptUrl(JSPDF_REL), () => !!window.jspdf?.jsPDF);
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    throw new Error('jspdf_missing');
}
