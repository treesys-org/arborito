/** DOM-based allowlist sanitizer for dialog HTML bodies. */
export function sanitizeDialogHtml(html) {
    const raw = String(html != null ? html : '');
    if (!raw) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'text/html');

    const allowedTags = new Set([
        'STRONG', 'BR', 'CODE', 'P', 'SPAN', 'A', 'UL', 'OL', 'LI', 'EM', 'DIV', 'BUTTON',
    ]);
    const allowedAttrsByTag = {
        A: new Set(['href', 'target', 'rel', 'class']),
        P: new Set(['class']),
        SPAN: new Set(['class']),
        CODE: new Set(['class']),
        STRONG: new Set(['class']),
        EM: new Set(['class']),
        UL: new Set(['class']),
        OL: new Set(['class']),
        LI: new Set(['class']),
        DIV: new Set(['class']),
        BUTTON: new Set(['type', 'class', 'data-copy']),
    };

    const isSafeHref = (href) => {
        const h = String(href != null ? href : '').trim();
        if (!h) return false;
        if (h.startsWith('#') || h.startsWith('/')) return true;
        try {
            const u = new URL(h, window.location.origin);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    };

    const walk = (node) => {
        const children = [...node.childNodes];
        for (const ch of children) {
            if (ch.nodeType === Node.ELEMENT_NODE) {
                const el = ch;
                const tag = el.tagName;
                if (!allowedTags.has(tag)) {
                    el.replaceWith(...[...el.childNodes]);
                    continue;
                }
                const allowedAttrs = allowedAttrsByTag[tag] || new Set();
                for (const attr of [...el.attributes]) {
                    const name = attr.name.toLowerCase();
                    if (name.startsWith('on')) {
                        el.removeAttribute(attr.name);
                        continue;
                    }
                    if (!allowedAttrs.has(attr.name)) el.removeAttribute(attr.name);
                }
                if (tag === 'A') {
                    const href = el.getAttribute('href');
                    if (!isSafeHref(href)) {
                        el.replaceWith(...[...el.childNodes]);
                        continue;
                    }
                    if (!el.getAttribute('rel')) el.setAttribute('rel', 'noopener noreferrer');
                    if (!el.getAttribute('target')) el.setAttribute('target', '_blank');
                }
                if (tag === 'BUTTON') {
                    const t = String(el.getAttribute('type') || 'button').toLowerCase();
                    if (t !== 'button') el.setAttribute('type', 'button');
                }
                walk(el);
            } else if (ch.nodeType === Node.COMMENT_NODE) {
                ch.remove();
            }
        }
    };

    walk(doc.body);
    return doc.body.innerHTML;
}
