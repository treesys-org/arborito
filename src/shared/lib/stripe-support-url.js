/**
 * "Support the creator" links shown in the app must point at Stripe Payment Links
 * (buy.stripe.com), so arbitrary https URLs cannot be used as the public support button on a tree.
 */

const STRIPE_SUPPORT_HOSTS = new Set(['buy.stripe.com']);

/** @param {unknown} u */
export function safeStripeSupportUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    try {
        const x = new URL(s, typeof window !== 'undefined' ? window.location.href : 'https://invalid.invalid');
        if (x.protocol !== 'https:') return '';
        if (!STRIPE_SUPPORT_HOSTS.has(x.hostname.toLowerCase())) return '';
        return x.href;
    } catch {
        return '';
    }
}
