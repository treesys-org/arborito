/**
 * Renders a QR code to a PNG data URL using the global `QRCode` (davidshimjs, MIT).
 * Requires `./src/vendor/qrcode-davidshimjs.min.js` loaded before app modules.
 *
 * @param {string} text
 * @param {{ size?: number, dark?: string, light?: string }} [opts]
 * @returns {Promise<string>} data:image/png;base64,… or '' if unavailable
 */
export async function qrTextToDataUrl(text, opts = {}) {
    if (typeof QRCode === 'undefined') return '';
    const size = Math.max(120, Math.min(480, Number(opts.size) || 240));
    const host = document.createElement('div');
    host.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';
    document.body.appendChild(host);
    const readCanvas = () => {
        const canvas = host.querySelector('canvas');
        if (!canvas) return '';
        try {
            return canvas.toDataURL('image/png');
        } catch {
            return '';
        }
    };
    try {
        // eslint-disable-next-line no-undef
        const qr = new QRCode(host, {
            text: String(text || ''),
            width: size,
            height: size,
            colorDark: opts.dark || '#0f172a',
            colorLight: opts.light || '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
        void qr;
        await new Promise((r) => requestAnimationFrame(r));
        let out = readCanvas();
        if (!out) {
            await new Promise((r) => setTimeout(r, 40));
            out = readCanvas();
        }
        if (!out) {
            const img = host.querySelector('img');
            if (((img && img.src) ? img.src.startsWith : undefined)('data:')) out = img.src;
        }
        return out || '';
    } finally {
        host.remove();
    }
}

/**
 * @returns {boolean}
 */
export function isBarcodeDetectorAvailable() {
    return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Detect QR in an ImageBitmap or HTMLVideoElement (current frame).
 * @param {ImageBitmap|HTMLVideoElement} source
 * @returns {Promise<string|null>} raw decoded text
 */
export async function detectQrOnce(source) {
    if (!isBarcodeDetectorAvailable()) return null;
    // @ts-ignore — BarcodeDetector is Chromium/Electron
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const codes = await detector.detect(source);
    if (!codes || !codes.length) return null;
    const raw = (codes[0] ? codes[0].rawValue : undefined);
    return raw != null && String(raw).trim() ? String(raw).trim() : null;
}
