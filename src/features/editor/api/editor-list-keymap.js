/** Enter/Backspace on empty LI — CSS list markers are not deletable as text. */

function emptyLi(li) {
    return (
        li instanceof HTMLElement &&
        !li.querySelector('img, video, audio, table, ul, ol, .edit-block-wrapper') &&
        !String(li.textContent || '')
            .replace(/[\u200B\u00A0]/g, '')
            .trim()
    );
}

function caret(el, atEnd = false) {
    const sel = window.getSelection();
    if (!sel || !(el instanceof HTMLElement)) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(!atEnd);
    sel.removeAllRanges();
    sel.addRange(r);
}

function exitEmptyLi(li, list) {
    const rest = [...li.parentElement?.children || []].filter((n) => n !== li && n.tagName === 'LI' && li.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    list.after(p);
    li.remove();
    if (rest.length) {
        const more = document.createElement(list.tagName.toLowerCase());
        rest.forEach((n) => more.appendChild(n));
        p.after(more);
    }
    if (!list.querySelector(':scope > li')) list.remove();
    caret(p);
}

/** @returns {boolean} handled */
export function handleLessonEditorListKeydown(e, editorEl) {
    if (!editorEl || e.isComposing || e.defaultPrevented) return false;
    if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) return false;
    if (e.key !== 'Enter' && e.key !== 'Backspace') return false;

    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return false;
    let n = sel.anchorNode;
    if (n?.nodeType === Node.TEXT_NODE) n = n.parentElement;
    if (!(n instanceof Element) || !editorEl.contains(n)) return false;
    if (n.closest('.edit-block-wrapper, .arborito-quiz-edit, .arborito-callout-edit, .arborito-code-input, .arborito-authoring-outline'))
        return false;

    const li = n.closest('li');
    const list = li?.parentElement;
    if (!li || !list || (list.tagName !== 'UL' && list.tagName !== 'OL') || !emptyLi(li)) return false;

    if (e.key === 'Enter') {
        e.preventDefault();
        exitEmptyLi(li, list);
        return true;
    }

    const atStart = (() => {
        try {
            const a = sel.getRangeAt(0);
            const b = document.createRange();
            b.selectNodeContents(li);
            b.collapse(true);
            return a.compareBoundaryPoints(Range.START_TO_START, b) === 0;
        } catch {
            return false;
        }
    })();
    if (!atStart) return false;

    e.preventDefault();
    const prev = li.previousElementSibling;
    if (prev?.tagName === 'LI') {
        li.remove();
        if (!list.querySelector(':scope > li')) list.remove();
        caret(prev, true);
    } else {
        exitEmptyLi(li, list);
    }
    return true;
}
