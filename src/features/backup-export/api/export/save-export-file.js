import { isElectronDesktop } from '../../../learning/api/electron-bridge.js';

export const EXPORT_FILTERS = {
    pdf: [{ name: 'PDF', extensions: ['pdf'] }],
    arborito: [{ name: 'Arborito archive', extensions: ['arborito'] }],
    json: [{ name: 'JSON', extensions: ['json'] }],
    text: [{ name: 'Text', extensions: ['txt'] }],
};

/** Safe filename for export dialogs and browser downloads. */
export function sanitizeExportFileName(name, fallback = 'export.bin') {
    const raw = String(name || fallback).replace(/[^\w\s.\-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
    return raw || fallback;
}

function toUint8Array(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data instanceof Blob) return data.arrayBuffer().then((buf) => new Uint8Array(buf));
    if (typeof data === 'string') return new TextEncoder().encode(data);
    return new Uint8Array(data);
}

async function downloadInBrowser({ data, filename, mimeType }) {
    const bytes = data instanceof Blob ? data : new Blob([await toUint8Array(data)], { type: mimeType });
    const url = URL.createObjectURL(bytes);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true };
}

/**
 * Save export bytes to disk.
 * Electron: native “Save as…” dialog (same UX as branch .arborito export).
 * Browser: direct download (no print dialog).
 *
 * @param {{
 *   data: Blob | ArrayBuffer | Uint8Array | string,
 *   filename: string,
 *   mimeType?: string,
 *   filters?: Array<{ name: string, extensions: string[] }>,
 * }} opts
 * @returns {Promise<{ ok: boolean, canceled?: boolean, path?: string, error?: string }>}
 */
export async function saveExportFile(opts = {}) {
    const filename = sanitizeExportFileName(opts.filename, 'export.bin');
    const mimeType = String(opts.mimeType || 'application/octet-stream');
    const filters = Array.isArray(opts.filters) && opts.filters.length ? opts.filters : undefined;
    const data = opts.data;

    if (data == null) return { ok: false, error: 'empty_data' };
    if (typeof document === 'undefined') return { ok: false, error: 'no_document' };

    const bridge = typeof window !== 'undefined' ? window.arboritoElectron : null;
    if (isElectronDesktop() && bridge?.saveExportFile) {
        const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : await toUint8Array(data);
        const result = await bridge.saveExportFile({
            data: bytes,
            defaultFileName: filename,
            mimeType,
            filters,
        });
        if (result?.canceled) return { ok: false, canceled: true };
        if (result?.ok) return result;
        return { ok: false, error: result?.error || 'save_failed' };
    }

    try {
        return await downloadInBrowser({ data, filename, mimeType });
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
}
