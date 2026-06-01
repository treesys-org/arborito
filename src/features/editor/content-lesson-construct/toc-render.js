import { getToc, tocIdOrdinalBefore } from '../../learning/content-toc.js';

/** Table-of-contents rendering helpers (scrolling to the active section). */
export const tocRenderMixin = {
    _scrollConstructSectionIntoView(idx) {
        const n = this.currentNode;
        if (!n) return;
        const toc = getToc({ content: this._getContentForTocParse() });
        const item = toc[idx];
        if (!item) return;
        const root = this.querySelector('#lesson-visual-editor');
        if (!root) return;
        if (item.id === 'intro') {
            root.scrollIntoView({ block: 'start' });
            return;
        }
        const markers = this._constructSectionMarkers(root);
        const ord = tocIdOrdinalBefore(toc, idx);
        let el = markers[idx];
        if (!el && item.id) {
            const withSameId = markers.filter(
                (m) => m.id === item.id || m.getAttribute('data-arborito-section-id') === item.id
            );
            el = withSameId[ord] || root.querySelector(`#${CSS.escape(item.id)}`);
        }
        if (el) {
            let target = el;
            if (target.classList && target.classList.contains('arborito-authoring-outline')) {
                let next = target.nextElementSibling;
                while (next && next.classList && next.classList.contains('arborito-authoring-outline')) {
                    next = next.nextElementSibling;
                }
                if (next) target = next;
            }
            target.scrollIntoView({ block: 'start' });
        }
    }
};
