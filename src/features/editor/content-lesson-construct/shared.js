import { parseContent } from '../../learning/parser.js';

/** Small utilities shared across lesson-construct partials. */
export const sharedMixin = {
    _setLessonSaveButtonSavedVisual(btn, saved) {
        if (!btn) return;
        if (saved) {
            btn.classList.add('arborito-lesson-save-btn--saved');
            btn.disabled = true;
            btn.style.transform = 'translateY(1px)';
            btn.style.background = 'linear-gradient(180deg, rgb(226 232 240) 0%, rgb(203 213 225) 100%)';
            btn.style.borderColor = 'rgb(148 163 184 / 0.65)';
            btn.style.color = 'rgb(30 41 59)';
            btn.style.boxShadow =
                'inset 0 2px 6px rgb(0 0 0 / 0.14), inset 0 1px 0 rgb(255 255 255 / 0.85)';
            btn.style.filter = 'none';
        } else {
            btn.classList.remove('arborito-lesson-save-btn--saved');
            btn.disabled = false;
            btn.style.transform = '';
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
            btn.style.boxShadow = '';
            btn.style.filter = '';
        }
    },

    _constructSectionMarkers(editorEl) {
        if (!editorEl) return [];
        return Array.from(
            editorEl.querySelectorAll('.arborito-authoring-outline, h1, h2, h3, h4, h5, h6')
        );
    },

    _assignHeadingIdsFromBlocks(editorEl, markdownBody) {
        const blocks = parseContent(markdownBody || '');
        const ids = [];
        for (const b of blocks) {
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'subsection'].includes(b.type)) {
                ids.push(b.id);
            }
        }
        const markers = this._constructSectionMarkers(editorEl);
        markers.forEach((marker, i) => {
            if (ids[i]) {
                marker.id = ids[i];
                marker.setAttribute('data-arborito-section-id', ids[i]);
            } else {
                marker.removeAttribute('id');
                marker.removeAttribute('data-arborito-section-id');
            }
        });
    }
};
