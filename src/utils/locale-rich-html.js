/**
 * Trusted locale strings (en.json / es.json) sometimes include a small HTML subset.
 * This sanitizes to that subset only (no scripts, handlers, or arbitrary tags).
 */

import { escAttr as escHtml } from './html-escape.js';

const ALLOWED = new Set([
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'BR',
    'P',
    'DIV',
    'SPAN',
    'UL',
    'OL',
    'LI',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'CODE',
    'PRE',
    'BLOCKQUOTE',
    'HR',
    'A',
    'SUB',
    'SUP',
    'SMALL'
]);

function safeHref(href) {
    const s = String(href != null ? href : '').trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^mailto:/i.test(s)) return s;
    return null;
}

function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.nodeValue);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tag = node.tagName;

    if (tag === 'BR') {
        return document.createElement('br');
    }

    if (tag === 'HR') {
        return document.createElement('hr');
    }

    if (tag === 'A') {
        const href = safeHref(node.getAttribute('href'));
        if (!href) {
            const frag = document.createDocumentFragment();
            for (const c of [...node.childNodes]) {
                const x = cleanNode(c);
                if (x) frag.appendChild(x);
            }
            return frag;
        }
        const out = document.createElement('a');
        out.setAttribute('href', href);
        out.setAttribute('rel', 'noopener noreferrer');
        out.setAttribute('target', '_blank');
        for (const c of [...node.childNodes]) {
            const x = cleanNode(c);
            if (x) out.appendChild(x);
        }
        return out;
    }

    if (!ALLOWED.has(tag)) {
        const frag = document.createDocumentFragment();
        for (const c of [...node.childNodes]) {
            const x = cleanNode(c);
            if (x) frag.appendChild(x);
        }
        return frag;
    }

    const el = document.createElement(tag.toLowerCase());
    for (const c of [...node.childNodes]) {
        const x = cleanNode(c);
        if (x) {
            el.appendChild(x);
        }
    }
    return el;
}

/**
 * @param {string} raw
 * @returns {string} safe HTML fragment
 */
export function sanitizeLocaleRichHtml(raw) {
    const s = String(raw != null ? raw : '');
    if (!s.trim()) return '';
    try {
        const doc = new DOMParser().parseFromString(`<div class="arb-locale-rich-root">${s}</div>`, 'text/html');
        const root = doc.querySelector('.arb-locale-rich-root');
        if (!root) return escHtml(s);

        const out = document.createElement('div');
        for (const c of [...root.childNodes]) {
            const x = cleanNode(c);
            if (x) out.appendChild(x);
        }
        return out.innerHTML;
    } catch {
        return escHtml(s);
    }
}
