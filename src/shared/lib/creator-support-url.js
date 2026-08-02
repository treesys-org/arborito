/**
 * Creator support links on a tree must use known tip/checkout hosts so arbitrary
 * https URLs cannot be used as the public support button.
 */

const CREATOR_SUPPORT_HOSTS = new Set([
    'buy.stripe.com',
    'mpago.la',
    'paypal.me',
    'www.paypal.me',
    'ko-fi.com',
    'www.ko-fi.com',
    'buymeacoffee.com',
    'www.buymeacoffee.com',
    // Chile uses mercadopago.cl (not mercadopago.com.cl)
    'mercadopago.cl',
    'www.mercadopago.cl',
    'link.mercadopago.cl',
]);

/** @param {string} hostname */
function isAllowedCreatorSupportHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (CREATOR_SUPPORT_HOSTS.has(h)) return true;
    // mercadopago.com / mercadopago.com.XX / www.… — not api.* / sandbox.*
    if (/^(?:www\.)?mercadopago\.com(?:\.[a-z]{2})?$/.test(h)) return true;
    if (/^link\.mercadopago\.com(?:\.[a-z]{2})?$/.test(h)) return true;
    return false;
}

/**
 * @param {unknown} u
 * @returns {string} normalized https href, or '' if empty/invalid/not allowlisted
 */
export function normalizeCreatorSupportUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    try {
        const x = new URL(s, typeof window !== 'undefined' ? window.location.href : 'https://invalid.invalid');
        if (x.protocol !== 'https:') return '';
        if (!isAllowedCreatorSupportHost(x.hostname)) return '';
        return x.href;
    } catch {
        return '';
    }
}
