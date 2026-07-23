/**
 * Copy plain text to the system clipboard.
 * Electron Linux often rejects `navigator.clipboard.writeText` under file://;
 * the preload bridge uses the native clipboard module as the first path.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    if (!value) return false;

    try {
        const bridge = typeof window !== 'undefined' ? window.arboritoElectron : null;
        if (bridge?.copyText && bridge.copyText(value)) return true;
    } catch {
        /* fall through */
    }

    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {
        /* fall through */
    }

    try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, value.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) return true;
    } catch {
        /* ignore */
    }

    return false;
}
