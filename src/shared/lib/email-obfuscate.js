/**
 * Email obfuscation against naive bot harvesting.
 *
 * Layered defenses (none cryptographic — humans always see the right address):
 *   1. The character sequence is REVERSED in the DOM source. A scraper that
 *      reads `textContent` or grabs a regex over the HTML gets garbage like
 *      `gro.elpmaxe@resu` instead of `user@example.org`.
 *   2. The visible rendering is corrected with CSS: `direction: rtl` plus
 *      `unicode-bidi: bidi-override` flips the visual order back.
 *   3. The plain address is also placed in a Base64 `data-eml-b64` attribute
 *      so JS can rebuild it on demand for click-to-copy and lazy `mailto:`.
 *      No `mailto:` lives in the rendered DOM at idle time.
 *   4. `user-select: text` keeps copy-paste working from the visible text on
 *      modern browsers; for guaranteed correctness, the click handler always
 *      copies the decoded address from the data attribute.
 *
 * Defeats: regex grep / `view-source:` harvest, naive headless scrapers that
 * read text content, and most static crawlers. Does not defeat full browser
 * automation that runs CSS — but the payoff for spammers becomes much lower
 * than scraping a plain `mailto:` link.
 */

import { escHtml } from './html-escape.js';
import {
    resolveAnyOperatorEmailForDisplay,
    getBuiltInOperatorName,
    getBuiltInOperatorPhone,
    getBuiltInOperatorAddress,
} from './default-operator-email.js';

function _b64Encode(s) {
    try {
        if (typeof btoa === 'function') {
            // Use the encodeURIComponent trick to handle non-ASCII safely
            return btoa(unescape(encodeURIComponent(String(s || ''))));
        }
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(String(s || ''), 'utf8').toString('base64');
        }
    } catch {
        /* ignore */
    }
    return '';
}

/**
 * Returns an HTML snippet that visually displays `email` correctly while
 * keeping the source-readable text reversed and the original address only in
 * a Base64 data attribute. The element acts as a button (click / Enter copies
 * the decoded address to the clipboard).
 *
 * @param {string} email
 * @param {{ copyLabel?: string, copiedLabel?: string, className?: string }} [opts]
 */
function obfuscatedEmailHtml(email, opts = {}) {
    const e = String(email || '');
    if (!e || !e.includes('@')) return escHtml(e);

    const reversed = e.split('').reverse().join('');
    const b64 = _b64Encode(e);
    const cls = String(opts.className || 'arb-obf-email');
    const copyLabel = String(opts.copyLabel || 'Copy email address');

    return (
        `<span class="${escHtml(cls)}" ` +
        `data-eml-b64="${escHtml(b64)}" ` +
        `role="button" tabindex="0" ` +
        `aria-label="${escHtml(copyLabel)}" title="${escHtml(copyLabel)}">` +
        escHtml(reversed) +
        `</span>`
    );
}

/**
 * Replace operator tokens (`{operatorEmail}`, `{operatorName}`, `{operatorPhone}`,
 * `{operatorAddress}`) inside `text` and return an HTML string suitable for
 * `innerHTML`. Plain text around the tokens is HTML-escaped; the email is
 * rendered through {@link obfuscatedEmailHtml}.
 */
export function injectOperatorTokensAsHtml(text, ui, opts = {}) {
    const tpl = String(text || '');
    const e = resolveAnyOperatorEmailForDisplay(ui);
    const n = ui?.operatorName || getBuiltInOperatorName();
    const p = ui?.operatorPhone || getBuiltInOperatorPhone();
    const a = ui?.operatorAddress || getBuiltInOperatorAddress();

    const replaced = tpl
        .replace(/\{operatorName\}/g, n)
        .replace(/\{operatorPhone\}/g, p)
        .replace(/\{operatorAddress\}/g, a);

    const parts = replaced.split('{operatorEmail}');
    if (parts.length === 1) return escHtml(replaced);

    const obf = obfuscatedEmailHtml(e, opts);
    return parts.map((piece) => escHtml(piece)).join(obf);
}

/**
 * Wire click / Enter handlers on every `.arb-obf-email` (or matching custom
 * class) inside `root`. Clicking copies the decoded email to the clipboard and
 * temporarily updates the visible text to a "copied" hint. Idempotent: a flag
 * on the element prevents double-binding when the modal re-renders.
 *
 * @param {Element|Document} root
 * @param {{ selector?: string, copiedLabel?: string }} [opts]
 */
export function bindObfuscatedEmailHandlers(root, opts = {}) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const selector = String(opts.selector || '.arb-obf-email');
    const copiedLabel = String(opts.copiedLabel || '✓ Copied');

    const nodes = root.querySelectorAll(selector);
    nodes.forEach((el) => {
        if (el.__obfBound) return;
        el.__obfBound = true;

        const decode = () => {
            const b64 = el.getAttribute('data-eml-b64') || '';
            try {
                if (typeof atob === 'function') {
                    return decodeURIComponent(escape(atob(b64)));
                }
                if (typeof Buffer !== 'undefined') {
                    return Buffer.from(b64, 'base64').toString('utf8');
                }
            } catch {
                /* ignore */
            }
            return '';
        };

        const copy = async () => {
            const eml = decode();
            if (!eml) return;
            let ok = false;
            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(eml);
                    ok = true;
                }
            } catch {
                /* fall through to legacy path */
            }
            if (!ok) {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = eml;
                    ta.setAttribute('readonly', '');
                    ta.style.position = 'absolute';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    ok = true;
                } catch {
                    /* ignore */
                }
            }
            if (!ok) {
                /* Last resort: open a mailto in a new tab so the user can still reach us. */
                try {
                    window.open('mailto:' + eml, '_blank', 'noopener');
                } catch {
                    /* ignore */
                }
                return;
            }
            // Brief visual confirmation, then restore the reversed source text.
            const original = el.textContent;
            el.textContent = copiedLabel;
            el.classList.add('is-copied');
            setTimeout(() => {
                if (el.classList.contains('is-copied')) {
                    el.textContent = original;
                    el.classList.remove('is-copied');
                }
            }, 1400);
        };

        el.addEventListener('click', (ev) => {
            ev.preventDefault();
            copy();
        });
        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                copy();
            }
        });
    });
}
