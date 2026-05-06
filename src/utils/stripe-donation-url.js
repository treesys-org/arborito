/**
 * Donation links shown in the app must point at Stripe-hosted checkout only,
 * so arbitrary https URLs cannot be used as donation buttons.
 */

const STRIPE_DONATION_HOSTS = new Set(['buy.stripe.com', 'donate.stripe.com']);

/** @param {unknown} u */
export function safeStripeDonationUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    try {
        const x = new URL(s, typeof window !== 'undefined' ? window.location.href : 'https://invalid.invalid');
        if (x.protocol !== 'https:') return '';
        if (!STRIPE_DONATION_HOSTS.has(x.hostname.toLowerCase())) return '';
        return x.href;
    } catch {
        return '';
    }
}
