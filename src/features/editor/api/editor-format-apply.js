/**
 * Direct DOM formatting for the lesson editor (no execCommand / selection loss).
 * Used by the Aa toolbar when a pinned range is available.
 */

const BLOCK_TAGS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'DIV'];
const CONVERTIBLE_BLOCKS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'blockquote', 'li']);
const CHROME_SEL =
    '.edit-block-wrapper, .arborito-quiz-edit, .arborito-callout-edit, .arborito-game-edit, .arborito-media-edit, .arborito-math-edit, .arborito-table-edit, .arborito-authoring-outline';

function isProseBlock(el, editorEl) {
    if (!(el instanceof HTMLElement) || !editorEl.contains(el) || el === editorEl) return false;
    if (el.closest(CHROME_SEL)) return false;
    return CONVERTIBLE_BLOCKS.has(el.tagName.toLowerCase());
}

function blockContainingRange(editorEl, range) {
    let node = range.commonAncestorContainer;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (!(node instanceof Element) || !editorEl.contains(node)) return null;
    for (const tag of BLOCK_TAGS) {
        const hit = node.closest(tag);
        if (hit && isProseBlock(hit, editorEl)) return hit;
    }
    return null;
}

function convertBlockElement(block, tag, sel) {
    const t = tag.toLowerCase();
    const bt = block.tagName.toLowerCase();
    if (bt === t) {
        demoteBlock(block);
        return true;
    }
    const next = document.createElement(t);
    while (block.firstChild) next.appendChild(block.firstChild);
    if (!next.textContent?.trim() && !next.querySelector('br, img, video, audio')) {
        next.appendChild(document.createElement('br'));
    }
    block.replaceWith(next);
    sel.removeAllRanges();
    const nr = document.createRange();
    nr.selectNodeContents(next);
    nr.collapse(false);
    sel.addRange(nr);
    return true;
}

function insertEmptyProseBlock(editorEl, range) {
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    try {
        range.insertNode(p);
    } catch {
        editorEl.appendChild(p);
    }
    return p;
}

function focusEditorSelection(editorEl, rangeOrNull) {
    if (!editorEl) return;
    try {
        editorEl.focus({ preventScroll: true });
    } catch {
        /* ignore */
    }
    const sel = window.getSelection();
    if (!sel || !rangeOrNull) return;
    try {
        if (!editorEl.contains(rangeOrNull.commonAncestorContainer)) return;
        sel.removeAllRanges();
        sel.addRange(rangeOrNull.cloneRange());
    } catch {
        /* ignore */
    }
}

function restoreRange(editorEl, range) {
    if (!editorEl || !range || !editorEl.contains(range.commonAncestorContainer)) return false;
    focusEditorSelection(editorEl, range);
    return !!(window.getSelection()?.rangeCount);
}

function caretBlock(editorEl) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    let n = sel.anchorNode;
    if (n?.nodeType === Node.TEXT_NODE) n = n.parentElement;
    if (!(n instanceof Element) || !editorEl.contains(n)) return null;
    if (n.closest('.edit-block-wrapper, .arborito-quiz-edit, .arborito-callout-edit, .arborito-game-edit, .arborito-media-edit, .arborito-math-edit, .arborito-table-edit, .arborito-authoring-outline')) {
        return null;
    }
    for (const tag of BLOCK_TAGS) {
        const hit = n.closest(tag);
        if (hit && isProseBlock(hit, editorEl)) return hit;
    }
    return null;
}

function placeCaretAtEnd(el) {
    const sel = window.getSelection();
    if (!sel || !(el instanceof HTMLElement)) return;
    sel.removeAllRanges();
    const nr = document.createRange();
    nr.selectNodeContents(el);
    nr.collapse(false);
    sel.addRange(nr);
}

function wrapRangeInTag(range, tag) {
    const t = tag.toLowerCase();
    if (!['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(t)) return false;
    try {
        if (range.collapsed) {
            const el = document.createElement(t);
            el.appendChild(document.createElement('br'));
            range.insertNode(el);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            const nr = document.createRange();
            nr.setStart(el, 0);
            nr.collapse(true);
            sel?.addRange(nr);
            return true;
        }
        const contents = range.extractContents();
        const el = document.createElement(t);
        el.appendChild(contents);
        range.insertNode(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        const nr = document.createRange();
        nr.selectNodeContents(el);
        nr.collapse(false);
        sel?.addRange(nr);
        return true;
    } catch {
        return false;
    }
}

function demoteBlock(block) {
    if (!(block instanceof HTMLElement)) return;
    const p = document.createElement('p');
    if (block.innerHTML.trim()) p.innerHTML = block.innerHTML;
    else p.appendChild(document.createElement('br'));
    block.replaceWith(p);
}

function expandRangeToWord(range) {
    if (!range.collapsed) return range;
    const node = range.startContainer;
    if (node?.nodeType !== Node.TEXT_NODE) return range;
    const text = node.textContent || '';
    let start = range.startOffset;
    let end = range.startOffset;
    while (start > 0 && /\S/.test(text[start - 1])) start -= 1;
    while (end < text.length && /\S/.test(text[end])) end += 1;
    if (start === end) return range;
    const next = range.cloneRange();
    next.setStart(node, start);
    next.setEnd(node, end);
    return next;
}

function unwrapInlineSizeSpans(root) {
    for (const span of [...root.querySelectorAll('span[data-arb-size]')]) {
        const parent = span.parentNode;
        if (!parent) continue;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        span.remove();
    }
}

function rangeIntersectsProtectedBlock(editorEl, range) {
    if (!editorEl || !range) return false;
    for (const el of editorEl.querySelectorAll(CHROME_SEL)) {
        try {
            if (range.intersectsNode(el)) return true;
        } catch {
            /* ignore */
        }
    }
    return false;
}

function applyInlineSize(editorEl, range, sizeKey) {
    if (!restoreRange(editorEl, range)) return false;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    let live = sel.getRangeAt(0);
    if (rangeIntersectsProtectedBlock(editorEl, live)) return false;

    if (sizeKey === 'normal') {
        const sizeSpanAround = (rangeLike) => {
            let node = rangeLike?.commonAncestorContainer;
            if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
            if (!(node instanceof Element) || !editorEl.contains(node)) return null;
            const span = node.closest('span[data-arb-size]');
            return span && editorEl.contains(span) ? span : null;
        };

        let host = sizeSpanAround(live);
        if (!host && live.collapsed) {
            live = expandRangeToWord(live);
            host = sizeSpanAround(live);
        }

        if (host) {
            const bounds = unwrapInlineElement(host);
            if (bounds) {
                try {
                    const nr = document.createRange();
                    nr.setStart(bounds.startContainer, bounds.startOffset);
                    nr.setEnd(bounds.endContainer, bounds.endOffset);
                    focusEditorSelection(editorEl, nr);
                } catch {
                    focusEditorSelection(editorEl, null);
                }
                return true;
            }
            return false;
        }

        const spans = [...editorEl.querySelectorAll('span[data-arb-size]')].filter((span) => {
            try {
                return live.intersectsNode(span);
            } catch {
                return false;
            }
        });
        if (!spans.length) {
            /* Already normal body text. */
            return true;
        }
        for (const span of spans) unwrapInlineElement(span);
        focusEditorSelection(editorEl, null);
        return true;
    }

    const size = String(sizeKey || '').toLowerCase();
    if (!['lg', 'md', 'sm'].includes(size)) return false;

    if (live.collapsed) live = expandRangeToWord(live);
    if (live.collapsed) {
        /* Last resort: size the whole prose block under the caret. */
        const block = blockContainingRange(editorEl, live) || caretBlock(editorEl);
        if (!block) return false;
        live = document.createRange();
        live.selectNodeContents(block);
    }
    if (live.collapsed) return false;

    try {
        const contents = live.extractContents();
        unwrapInlineSizeSpans(contents);
        const span = document.createElement('span');
        span.setAttribute('data-arb-size', size);
        span.className = `arb-inline-size arb-inline-size--${size}`;
        span.appendChild(contents);
        live.insertNode(span);
        const nr = document.createRange();
        nr.selectNodeContents(span);
        focusEditorSelection(editorEl, nr);
        return true;
    } catch {
        try {
            const span = document.createElement('span');
            span.setAttribute('data-arb-size', size);
            span.className = `arb-inline-size arb-inline-size--${size}`;
            live.surroundContents(span);
            const nr = document.createRange();
            nr.selectNodeContents(span);
            focusEditorSelection(editorEl, nr);
            return true;
        } catch {
            return false;
        }
    }
}

function applyBlockTag(editorEl, range, tag) {
    if (!restoreRange(editorEl, range)) return false;
    const t = tag.toLowerCase();
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const live = sel.getRangeAt(0);

    if (!live.collapsed) {
        return wrapRangeInTag(live, t);
    }

    const block = blockContainingRange(editorEl, live) || caretBlock(editorEl);
    if (block && isProseBlock(block, editorEl)) {
        return convertBlockElement(block, t, sel);
    }

    const emptyBlock = insertEmptyProseBlock(editorEl, live);
    return convertBlockElement(emptyBlock, t, sel);
}

function applyAlign(editorEl, range, align) {
    if (!restoreRange(editorEl, range)) return false;
    const mode = String(align || 'left').toLowerCase();
    const next = mode === 'center' ? 'center' : mode === 'right' ? 'right' : 'left';
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const live = sel.getRangeAt(0);
    const blocks = new Set();
    const block = caretBlock(editorEl);
    if (block) blocks.add(block);
    if (!live.collapsed) {
        for (const el of editorEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote')) {
            if (!editorEl.contains(el)) continue;
            try {
                if (live.intersectsNode(el)) blocks.add(el);
            } catch {
                /* ignore */
            }
        }
    }
    for (const el of blocks) {
        if (next === 'left') {
            el.style.textAlign = '';
            el.removeAttribute('data-arb-align');
        } else {
            el.style.textAlign = next;
            el.setAttribute('data-arb-align', next);
        }
    }
    return blocks.size > 0;
}

function unwrapList(listEl) {
    const parent = listEl?.parentNode;
    if (!parent) return false;
    for (const li of [...listEl.querySelectorAll(':scope > li')]) {
        const p = document.createElement('p');
        const html = li.innerHTML.trim();
        if (html) p.innerHTML = html;
        else p.appendChild(document.createElement('br'));
        parent.insertBefore(p, listEl);
    }
    listEl.remove();
    return true;
}

function blocksInRange(editorEl, range) {
    const blocks = [];
    for (const el of editorEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')) {
        if (!editorEl.contains(el)) continue;
        try {
            if (range.intersectsNode(el)) blocks.push(el);
        } catch {
            /* ignore */
        }
    }
    return blocks.filter((block) => !blocks.some((other) => other !== block && other.contains(block)));
}

/** Drop typed `1.` / `-` so CSS list markers are not doubled. */
function stripLeadingListMarkerFromElement(el) {
    if (!(el instanceof HTMLElement)) return;
    const t = el.firstChild;
    if (t?.nodeType !== Node.TEXT_NODE || typeof t.textContent !== 'string') return;
    const next = t.textContent.replace(/^(?:\d+\.|[-*•])\s+/, '');
    if (next === t.textContent) return;
    t.textContent = next;
    if (!String(el.textContent || '').trim() && !el.querySelector('br, img')) el.appendChild(document.createElement('br'));
}

function blockToListItemContent(block) {
    const li = document.createElement('li');
    const html = block.innerHTML.trim();
    if (html) li.innerHTML = html;
    else li.appendChild(document.createElement('br'));
    stripLeadingListMarkerFromElement(li);
    return li;
}

function convertBlocksToList(blocks, ordered) {
    if (!blocks.length) return null;
    const first = blocks[0];
    const parent = first.parentNode;
    if (!parent) return null;
    const list = document.createElement(ordered ? 'ol' : 'ul');
    parent.insertBefore(list, first);
    for (const block of blocks) {
        list.appendChild(blockToListItemContent(block));
        block.remove();
    }
    return list;
}

function applyList(editorEl, range, ordered) {
    if (!restoreRange(editorEl, range)) return false;
    const listTag = ordered ? 'OL' : 'UL';
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const live = sel.getRangeAt(0);
    const block = caretBlock(editorEl);
    let existing = block?.closest('ul, ol');
    if (!existing) {
        let node = live.commonAncestorContainer;
        if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
        if (node instanceof Element && editorEl.contains(node)) {
            existing = node.closest('ul, ol');
        }
    }

    if (existing && editorEl.contains(existing)) {
        if (existing.tagName === listTag) {
            unwrapList(existing);
            return true;
        }
        const replacement = document.createElement(ordered ? 'ol' : 'ul');
        replacement.innerHTML = existing.innerHTML;
        existing.replaceWith(replacement);
        const activeLi = replacement.querySelector('li');
        if (activeLi) placeCaretAtEnd(activeLi);
        return true;
    }

    if (!live.collapsed) {
        const blocks = blocksInRange(editorEl, live);
        if (blocks.length > 1) {
            const list = convertBlocksToList(blocks, ordered);
            if (list?.lastElementChild) {
                placeCaretAtEnd(list.lastElementChild);
                return true;
            }
        }
        try {
            const list = document.createElement(ordered ? 'ol' : 'ul');
            const li = document.createElement('li');
            li.appendChild(live.extractContents());
            if (!li.innerHTML.trim()) li.appendChild(document.createElement('br'));
            stripLeadingListMarkerFromElement(li);
            list.appendChild(li);
            live.insertNode(list);
            placeCaretAtEnd(li);
            return true;
        } catch {
            /* fall through */
        }
    }

    if (block && block.tagName === 'LI') {
        const host = block.closest('ul, ol');
        if (host && editorEl.contains(host)) {
            if (host.tagName === listTag) {
                unwrapList(host);
                return true;
            }
            const replacement = document.createElement(ordered ? 'ol' : 'ul');
            replacement.innerHTML = host.innerHTML;
            host.replaceWith(replacement);
            const activeLi = replacement.querySelector('li');
            if (activeLi) placeCaretAtEnd(activeLi);
            return true;
        }
    }

    if (block && BLOCK_TAGS.includes(block.tagName) && block.tagName !== 'LI') {
        const list = document.createElement(ordered ? 'ol' : 'ul');
        const li = blockToListItemContent(block);
        list.appendChild(li);
        block.replaceWith(list);
        placeCaretAtEnd(li);
        return true;
    }

    const list = document.createElement(ordered ? 'ol' : 'ul');
    const li = document.createElement('li');
    li.appendChild(document.createElement('br'));
    list.appendChild(li);
    live.insertNode(list);
    placeCaretAtEnd(li);
    return true;
}

function applyLineBreak(editorEl, range) {
    if (!restoreRange(editorEl, range)) return false;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const live = sel.getRangeAt(0);
    try {
        const br = document.createElement('br');
        live.insertNode(br);
        live.setStartAfter(br);
        live.collapse(true);
        sel.removeAllRanges();
        sel.addRange(live);
        return true;
    } catch {
        return false;
    }
}

function unwrapInlineElement(el) {
    const parent = el.parentNode;
    if (!parent) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    return { startContainer, startOffset, endContainer, endOffset };
}

function restoreUnwrappedSelection(bounds) {
    if (!bounds) return;
    const sel = window.getSelection();
    if (!sel) return;
    try {
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.setStart(bounds.startContainer, bounds.startOffset);
        nr.setEnd(bounds.endContainer, bounds.endOffset);
        sel.addRange(nr);
    } catch {
        /* ignore */
    }
}

function wrapRangeInInlineTag(range, tag) {
    const t = tag.toLowerCase();
    if (!['strong', 'b', 'em', 'i', 'u', 's'].includes(t)) return false;
    if (range.collapsed) return false;
    try {
        const contents = range.extractContents();
        const el = document.createElement(t);
        el.appendChild(contents);
        range.insertNode(el);
        const nr = document.createRange();
        nr.selectNodeContents(el);
        const editorEl =
            el.closest('#lesson-visual-editor') ||
            el.closest('[contenteditable="true"]');
        if (editorEl instanceof HTMLElement) focusEditorSelection(editorEl, nr);
        else {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(nr);
        }
        return true;
    } catch {
        return false;
    }
}

function selectionInClosestFromRange(editorEl, range, tagOrTags) {
    const tags = Array.isArray(tagOrTags) ? tagOrTags : [tagOrTags];
    let node = range?.commonAncestorContainer;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (!(node instanceof Element) || !editorEl.contains(node)) return null;
    for (const tag of tags) {
        const host = node.closest(tag);
        if (host && editorEl.contains(host)) return host;
    }
    return null;
}

function applyInlineFormat(editorEl, range, cmd) {
    if (!restoreRange(editorEl, range)) return false;
    const tags =
        cmd === 'bold'
            ? ['strong', 'b']
            : cmd === 'italic'
              ? ['em', 'i']
              : cmd === 'underline'
                ? ['u']
                : cmd === 'strikeThrough'
                  ? ['s', 'strike', 'del']
                  : [];
    if (!tags.length) return false;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    let live = sel.getRangeAt(0);
    if (rangeIntersectsProtectedBlock(editorEl, live)) return false;

    /* Caret in a word → format that word (same as size toolbar). */
    if (live.collapsed) live = expandRangeToWord(live);
    if (live.collapsed) return false;

    const existing = selectionInClosestFromRange(editorEl, live, tags);
    if (existing) {
        const bounds = unwrapInlineElement(existing);
        if (bounds) {
            try {
                const nr = document.createRange();
                nr.setStart(bounds.startContainer, bounds.startOffset);
                nr.setEnd(bounds.endContainer, bounds.endOffset);
                focusEditorSelection(editorEl, nr);
            } catch {
                focusEditorSelection(editorEl, null);
            }
        } else {
            focusEditorSelection(editorEl, null);
        }
        return true;
    }

    try {
        sel.removeAllRanges();
        sel.addRange(live.cloneRange());
    } catch {
        /* ignore */
    }
    const ok = wrapRangeInInlineTag(sel.getRangeAt(0), tags[0]);
    if (ok) {
        const after = window.getSelection()?.rangeCount
            ? window.getSelection().getRangeAt(0)
            : null;
        focusEditorSelection(editorEl, after);
    }
    return ok;
}

/**
 * @param {HTMLElement} editorEl
 * @param {Range | null | undefined} pinnedRange
 * @param {string} cmd
 * @param {string | null} val
 */
export function applyLessonFormatCommand(editorEl, pinnedRange, cmd, val) {
    if (!editorEl || !pinnedRange) return false;
    const c = String(cmd || '');
    if (c === 'bold' || c === 'italic' || c === 'underline' || c === 'strikeThrough') {
        return applyInlineFormat(editorEl, pinnedRange, c);
    }
    if (c === 'formatBlock' && val) {
        const tag = String(val).replace(/[<>]/g, '').trim().toLowerCase();
        return applyBlockTag(editorEl, pinnedRange, tag);
    }
    if (c === 'inlineSize' && val) return applyInlineSize(editorEl, pinnedRange, val);
    if (c === 'align' && val) return applyAlign(editorEl, pinnedRange, val);
    if (c === 'insertUnorderedList') return applyList(editorEl, pinnedRange, false);
    if (c === 'insertOrderedList') return applyList(editorEl, pinnedRange, true);
    if (c === 'insertBr') return applyLineBreak(editorEl, pinnedRange);
    return false;
}
