import { EXPORT_FILTERS, sanitizeExportFileName, saveExportFile } from './save-export-file.js';

const EXPORT_FRAME_ID = 'arborito-pdf-export-frame';
const HTML2PDF_REL = 'vendor/html2pdf/html2pdf.bundle.min.js';

/** A4 page size in CSS pixels (96 dpi) for reliable html2canvas capture. */
const PAGE_PX = {
    portrait: { width: 794, height: 1123 },
    landscape: { width: 1123, height: 794 },
};

function sanitizePdfFileName(name, fallback = 'export.pdf') {
    const base = sanitizeExportFileName(name, fallback);
    return /\.pdf$/i.test(base) ? base : `${base.replace(/\.pdf$/i, '')}.pdf`;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForImages(root) {
    const images = [...root.querySelectorAll('img')];
    if (!images.length) return Promise.resolve();
    return Promise.all(
        images.map(
            (img) =>
                new Promise((resolve) => {
                    if (img.complete) {
                        resolve();
                        return;
                    }
                    img.addEventListener('load', () => resolve(), { once: true });
                    img.addEventListener('error', () => resolve(), { once: true });
                })
        )
    );
}

function html2pdfScriptUrl() {
    const bridge = typeof window !== 'undefined' ? window.arboritoElectron : null;
    if (bridge?.resolveAsset) {
        return bridge.resolveAsset(HTML2PDF_REL);
    }
    return new URL(HTML2PDF_REL, document.baseURI).href;
}

function removeExportFrame() {
    document.getElementById(EXPORT_FRAME_ID)?.remove();
}

function exportCaptureTarget(root) {
    return root.querySelector('.cert') || root.firstElementChild || root;
}

/**
 * Load export HTML in an off-screen iframe (no UI flash, isolated from app CSS).
 */
function mountExportFrame(html, { landscape = false, singlePage = false } = {}) {
    removeExportFrame();

    const size = landscape ? PAGE_PX.landscape : PAGE_PX.portrait;
    const iframe = document.createElement('iframe');
    iframe.id = EXPORT_FRAME_ID;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.setAttribute('color-scheme', 'light');
    Object.assign(iframe.style, {
        position: 'fixed',
        left: '-20000px',
        top: '0',
        width: `${size.width}px`,
        height: `${size.height}px`,
        border: '0',
        margin: '0',
        padding: '0',
        pointerEvents: 'none',
        zIndex: '-1',
        background: '#ffffff',
    });

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
        removeExportFrame();
        throw new Error('export_frame_unavailable');
    }

    doc.open();
    doc.write(String(html || ''));
    doc.close();

    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            const root = doc.body;
            if (!root || !root.innerHTML.trim()) {
                settled = true;
                removeExportFrame();
                reject(new Error('export_frame_empty'));
                return;
            }

            const frameHeight = singlePage ? size.height : Math.max(size.height, root.scrollHeight || size.height);
            iframe.style.width = `${size.width}px`;
            iframe.style.height = `${frameHeight}px`;

            try {
                doc.documentElement.style.colorScheme = 'light';
                doc.documentElement.style.background = '#ffffff';
                root.style.background = '#ffffff';
            } catch {
                /* ignore */
            }

            settled = true;
            resolve({ iframe, root, target: exportCaptureTarget(root) });
        };

        iframe.addEventListener('load', finish, { once: true });
        iframe.addEventListener(
            'error',
            () => {
                if (settled) return;
                settled = true;
                reject(new Error('export_frame_load_failed'));
            },
            { once: true }
        );
        setTimeout(finish, 200);
    });
}

function loadHtml2Pdf() {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('no_window'));
    }
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (loadHtml2Pdf.promise) return loadHtml2Pdf.promise;

    loadHtml2Pdf.promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        try {
            script.src = html2pdfScriptUrl();
        } catch (e) {
            reject(e);
            return;
        }
        script.async = true;
        script.onload = () => {
            if (window.html2pdf) resolve(window.html2pdf);
            else reject(new Error('html2pdf_missing'));
        };
        script.onerror = () => reject(new Error('html2pdf_load_failed'));
        document.head.appendChild(script);
    });

    return loadHtml2Pdf.promise;
}

async function renderPdfBlob(target, { landscape = false, singlePage = false } = {}) {
    const html2pdf = await loadHtml2Pdf();
    const size = landscape ? PAGE_PX.landscape : PAGE_PX.portrait;
    const captureHeight = singlePage ? size.height : target.scrollHeight || size.height;

    const blob = await html2pdf()
        .set({
            margin: singlePage ? 0 : [8, 8, 8, 8],
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: size.width,
                height: captureHeight,
                windowWidth: size.width,
                windowHeight: captureHeight,
                scrollX: 0,
                scrollY: 0,
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' },
            pagebreak: singlePage ? { mode: 'avoid-all' } : { mode: ['css', 'legacy'] },
        })
        .from(target)
        .outputPdf('blob');

    if (!(blob instanceof Blob) || blob.size < 800) {
        throw new Error('pdf_empty');
    }
    return blob;
}

/**
 * Export self-contained HTML as a downloaded PDF file (never opens a print dialog).
 */
export async function savePdfExport(opts = {}) {
    const html = String(opts.html || '');
    if (!html.trim()) return { ok: false, error: 'empty_html' };
    if (typeof document === 'undefined') return { ok: false, error: 'no_document' };

    const filename = sanitizePdfFileName(opts.defaultFileName, 'export.pdf');
    const landscape = !!opts.landscape;
    const singlePage = !!opts.singlePage;
    const delay = Number.isFinite(opts.delayMs) ? opts.delayMs : 500;

    let frame;
    try {
        frame = await mountExportFrame(html, { landscape, singlePage });
        await waitForImages(frame.target);
        await wait(delay);

        const pdfData = await renderPdfBlob(frame.target, { landscape, singlePage });
        return await saveExportFile({
            data: pdfData,
            filename,
            mimeType: 'application/pdf',
            filters: EXPORT_FILTERS.pdf,
        });
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    } finally {
        removeExportFrame();
    }
}
