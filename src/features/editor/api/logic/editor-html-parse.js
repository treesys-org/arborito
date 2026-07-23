/**
 * Parse trusted editor HTML into a DocumentFragment without host innerHTML.
 * @param {string} html
 */
export function parseEditorHtmlFragment(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString((html || '<p><br></p>').trim(), 'text/html');
    const frag = document.createDocumentFragment();
    for (const node of doc.body.childNodes) {
        frag.appendChild(node.cloneNode(true));
    }
    return frag;
}

/** Strip inline HTML to plain text for markdown round-trip. */
export function htmlToPlainText(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return doc.body.textContent.trim();
}
