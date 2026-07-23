import { createElement, Fragment, useMemo } from 'react';
import { sanitizeLocaleRichHtml } from '../lib/locale-rich-html.js';

function safeHref(href) {
    const s = String(href != null ? href : '').trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^mailto:/i.test(s)) return s;
    return null;
}

function nodeToReact(node, key) {
    if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent;
        return t ? t : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return createElement('br', { key });
    const children = [...node.childNodes]
        .map((c, i) => nodeToReact(c, `${key}-${i}`))
        .filter(Boolean);
    const props = { key };
    if (tag === 'a') {
        const href = safeHref(node.getAttribute('href'));
        if (href) {
            props.href = href;
            props.target = '_blank';
            props.rel = 'noopener noreferrer';
        }
    }
    if (tag === 'code') props.className = node.className || undefined;
    return createElement(tag, props, ...children);
}

function parseLocaleRichHtml(html) {
    const safe = sanitizeLocaleRichHtml(html);
    if (!safe) return [];
    try {
        const doc = new DOMParser().parseFromString(`<div class="arb-locale-rich-root">${safe}</div>`, 'text/html');
        const root = doc.querySelector('.arb-locale-rich-root');
        if (!root) return [safe];
        return [...root.childNodes].map((n, i) => nodeToReact(n, i)).filter(Boolean);
    } catch {
        return [safe];
    }
}

/** Locale strings with a small trusted HTML subset → React nodes (no innerHTML). */
export function LocaleRichText({ html, className, as: Tag = 'span' }) {
    const nodes = useMemo(() => parseLocaleRichHtml(html), [html]);
    if (!nodes.length) return null;
    if (Tag === Fragment) return createElement(Fragment, null, ...nodes);
    return createElement(Tag, className ? { className } : null, ...nodes);
}
