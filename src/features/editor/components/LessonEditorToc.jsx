import { getToc, tocIdOrdinalBefore } from '../../learning/api/content-toc.js';
import { constructSectionMarkers } from '../api/logic/lesson-editor-dom.js';

/** Scroll the visual editor to a construct section marker. */
export function scrollConstructSectionIntoView(editorEl, idx, getContentForTocParse) {
    if (!editorEl) return;
    const toc = getToc({ content: getContentForTocParse() });
    const item = toc[idx];
    if (!item) return;
    if (item.id === 'intro') {
        editorEl.scrollIntoView({ block: 'start' });
        return;
    }
    const markers = constructSectionMarkers(editorEl);
    const ord = tocIdOrdinalBefore(toc, idx);
    let el = markers[idx];
    if (!el && item.id) {
        const withSameId = markers.filter(
            (m) => m.id === item.id || m.getAttribute('data-arborito-section-id') === item.id
        );
        el = withSameId[ord] || (item.id ? document.getElementById(item.id) : null);
    }
    if (!el) return;
    let target = el;
    if (target.classList?.contains('arborito-authoring-outline')) {
        let next = target.nextElementSibling;
        while (next?.classList?.contains('arborito-authoring-outline')) {
            next = next.nextElementSibling;
        }
        if (next) target = next;
    }
    target.scrollIntoView({ block: 'start' });
}
