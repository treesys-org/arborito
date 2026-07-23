import { BLOCKS } from './editor-engine.js';
import { parseEditorHtmlFragment } from './logic/editor-html-parse.js';
import { ensureAndBindQuizWizard } from '../hooks/useQuizWizard.jsx';
import { bindGameBlockControls } from './logic/editor-game-block.js';
import { bindMediaBlockControls } from './logic/editor-media-block.js';
import { bindTableBlockControls } from './logic/editor-table.js';
import { scrollLessonEditorToInsertedBlock } from '../../learning/api/content-panel-scroll.js';

const ALIGN_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote';

function isAlignableBlock(el, editorEl) {
    if (!(el instanceof HTMLElement) || !editorEl.contains(el)) return false;
    if (el.closest('.edit-block-wrapper')) return false;
    if ((el.classList && el.classList.contains)('arborito-authoring-outline')) return false;
    return true;
}

/**
 * @param {HTMLElement} editorEl
 * @param {string} tag h1 | h2 | h3
 */
function wrapSelectionInHeading(editorEl, tag) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0).cloneRange();
    if (!editorEl.contains(range.commonAncestorContainer)) return;
    const t = tag.toLowerCase();
    if (t !== 'h1' && t !== 'h2' && t !== 'h3') return;

    if (range.collapsed) {
        const h = document.createElement(t);
        h.appendChild(document.createElement('br'));
        range.insertNode(h);
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.setStart(h, 0);
        nr.collapse(true);
        sel.addRange(nr);
        return;
    }

    try {
        const contents = range.extractContents();
        const h = document.createElement(t);
        h.appendChild(contents);
        range.insertNode(h);
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.selectNodeContents(h);
        nr.collapse(false);
        sel.addRange(nr);
    } catch {
        /* ignore */
    }
}

/**
 * Wraps the selection in a block (p / h4–h6) when formatBlock fails.
 * @param {HTMLElement} editorEl
 * @param {'p'|'h4'|'h5'|'h6'} tag
 */
function wrapSelectionInBlockTag(editorEl, tag) {
    const t = tag.toLowerCase();
    if (t !== 'p' && t !== 'h4' && t !== 'h5' && t !== 'h6') return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0).cloneRange();
    if (!editorEl.contains(range.commonAncestorContainer)) return;

    if (range.collapsed) {
        const el = document.createElement(t);
        el.appendChild(document.createElement('br'));
        range.insertNode(el);
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.setStart(el, 0);
        nr.collapse(true);
        sel.addRange(nr);
        return;
    }

    try {
        const contents = range.extractContents();
        const el = document.createElement(t);
        el.appendChild(contents);
        range.insertNode(el);
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.selectNodeContents(el);
        nr.collapse(false);
        sel.addRange(nr);
    } catch {
        /* ignore */
    }
}

function wrapInlineTag(editorEl, tag) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0).cloneRange();
    if (!editorEl.contains(range.commonAncestorContainer)) return false;
    try {
        const el = document.createElement(tag);
        el.appendChild(range.extractContents());
        range.insertNode(el);
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.selectNodeContents(el);
        sel.addRange(nr);
        return true;
    } catch {
        return false;
    }
}

function unwrapElement(el) {
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

function caretNodeInEditor(editorEl) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    let n = sel.anchorNode;
    if (n?.nodeType === Node.TEXT_NODE) n = n.parentElement;
    return n instanceof Element && editorEl.contains(n) ? n : null;
}

function selectionInClosest(editorEl, tagOrTags) {
    const tags = Array.isArray(tagOrTags) ? tagOrTags : [tagOrTags];
    const n = caretNodeInEditor(editorEl);
    if (!n) return null;
    for (const tag of tags) {
        const host = n.closest(tag);
        if (host && editorEl.contains(host)) return host;
    }
    return null;
}

function inlineTagsFor(cmd) {
    if (cmd === 'bold') return ['strong', 'b'];
    if (cmd === 'italic') return ['em', 'i'];
    if (cmd === 'underline') return ['u'];
    if (cmd === 'strikeThrough') return ['s', 'strike', 'del'];
    return ['span'];
}

function toggleInlineFormat(editorEl, cmd, tag) {
    const tags = inlineTagsFor(cmd);
    const existing = selectionInClosest(editorEl, tags);
    if (existing) {
        const bounds = unwrapElement(existing);
        restoreUnwrappedSelection(bounds);
        try {
            editorEl.focus({ preventScroll: true });
        } catch {
            /* ignore */
        }
        return;
    }
    try {
        if (document.queryCommandState(cmd)) {
            document.execCommand(cmd, false, null);
            const stillWrapped = selectionInClosest(editorEl, tags);
            if (!stillWrapped) {
                try {
                    editorEl.focus({ preventScroll: true });
                } catch {
                    /* ignore */
                }
                return;
            }
            const bounds = unwrapElement(stillWrapped);
            restoreUnwrappedSelection(bounds);
            try {
                editorEl.focus({ preventScroll: true });
            } catch {
                /* ignore */
            }
            return;
        }
    } catch {
        /* ignore */
    }
    try {
        document.execCommand(cmd, false, null);
    } catch {
        /* ignore */
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed && !selectionInClosest(editorEl, tags)) {
        wrapInlineTag(editorEl, tags[0]);
    }
    try {
        editorEl.focus({ preventScroll: true });
    } catch {
        /* ignore */
    }
}

function demoteBlockToParagraph(block) {
    if (!(block instanceof HTMLElement)) return;
    const p = document.createElement('p');
    if (block.innerHTML.trim()) {
        p.innerHTML = block.innerHTML;
    } else {
        p.appendChild(document.createElement('br'));
    }
    block.replaceWith(p);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    const nr = document.createRange();
    nr.selectNodeContents(p);
    nr.collapse(false);
    sel.addRange(nr);
}

function toggleBlockFormat(editorEl, tag) {
    const t = tag.toLowerCase();
    const existing = selectionInClosest(editorEl, t);
    if (existing) {
        demoteBlockToParagraph(existing);
        return true;
    }
    return false;
}

function toggleList(editorEl, ordered) {
    const listTag = ordered ? 'ol' : 'ul';
    const existing = selectionInClosest(editorEl, listTag);
    if (existing) {
        const parent = existing.parentNode;
        if (!parent) return;
        const items = [...existing.querySelectorAll(':scope > li')];
        for (const li of items) {
            const p = document.createElement('p');
            p.innerHTML = li.innerHTML.trim() || '<br>';
            parent.insertBefore(p, existing);
        }
        existing.remove();
        return;
    }
    /* Opposite list type under caret → convert instead of nesting. */
    const otherTag = ordered ? 'ul' : 'ol';
    const other = selectionInClosest(editorEl, otherTag);
    if (other) {
        const replacement = document.createElement(listTag);
        replacement.innerHTML = other.innerHTML;
        other.replaceWith(replacement);
        return;
    }
    const cmd = ordered ? 'insertOrderedList' : 'insertUnorderedList';
    try {
        document.execCommand(cmd, false, null);
    } catch {
        /* ignore */
    }
}

function toggleAlign(editorEl, align) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0).cloneRange();
    if (!editorEl.contains(range.commonAncestorContainer)) return;

    const touched = [];
    for (const el of editorEl.querySelectorAll(ALIGN_BLOCK_SELECTOR)) {
        if (!isAlignableBlock(el, editorEl)) continue;
        try {
            if (range.intersectsNode(el)) touched.push(el);
        } catch {
            /* ignore */
        }
    }

    const applyTo = (el, nextAlign) => {
        if (nextAlign === 'left') {
            el.style.textAlign = '';
            el.removeAttribute('data-arb-align');
        } else {
            el.style.textAlign = nextAlign;
            el.setAttribute('data-arb-align', nextAlign);
        }
    };

    let blocks = touched;
    if (!blocks.length) {
        let n = caretNodeInEditor(editorEl);
        while (n && editorEl.contains(n)) {
            if (n.matches?.(ALIGN_BLOCK_SELECTOR) && isAlignableBlock(n, editorEl)) {
                blocks = [n];
                break;
            }
            n = n.parentElement;
        }
    }

    for (const el of blocks) {
        const cur = (el.getAttribute('data-arb-align') || el.style.textAlign || 'left').toLowerCase();
        applyTo(el, cur === align ? 'left' : align);
    }
}

/**
 * Runs document.execCommand on a contenteditable (same contract as the editor panel).
 * formatBlock tries compatible variants and, if needed, wraps the selection in the heading.
 */
export function execCmdOnEditor(editorEl, cmd, val = null) {
    if (!editorEl) return;

    if (cmd === 'insertBr') {
        try {
            document.execCommand('insertHTML', false, '<br>');
        } catch {
            /* ignore */
        }
        return;
    }

    if (cmd === 'align' && val) {
        const mode = String(val).toLowerCase().trim();
        const align = mode === 'center' ? 'center' : mode === 'right' ? 'right' : 'left';
        toggleAlign(editorEl, align);
        return;
    }

    if (cmd === 'insertUnorderedList') {
        toggleList(editorEl, false);
        return;
    }

    if (cmd === 'insertOrderedList') {
        toggleList(editorEl, true);
        return;
    }

    if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline' || cmd === 'strikeThrough') {
        const tag =
            cmd === 'bold' ? 'strong' : cmd === 'italic' ? 'em' : cmd === 'underline' ? 'u' : 's';
        toggleInlineFormat(editorEl, cmd, tag);
        return;
    }

    if (cmd === 'formatBlock' && val) {
        const raw = String(val).replace(/[<>]/g, '').trim();
        const tag = raw.toLowerCase();
        if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6' || tag === 'p') {
            if (toggleBlockFormat(editorEl, tag)) return;
            const bracket = `<${tag}>`;
            const tries = [bracket, tag];
            for (const v of tries) {
                try {
                    document.execCommand('formatBlock', false, v);
                } catch {
                    /* ignore */
                }
                const sel = window.getSelection();
                if (sel && sel.anchorNode) {
                    let n = sel.anchorNode;
                    if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
                    const host = n && editorEl.contains(n) ? n.closest(tag) : null;
                    if (host && editorEl.contains(host)) return;
                }
            }
            if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
                wrapSelectionInHeading(editorEl, tag);
            } else {
                wrapSelectionInBlockTag(editorEl, /** @type {'p'|'h4'|'h5'|'h6'} */ (tag));
            }
            return;
        }
    }

    document.execCommand(cmd, false, val);
}

const BLOCK_HOST_SELECTOR =
    '.edit-block-wrapper, .arborito-quiz-edit, .arborito-callout-edit, .arborito-game-edit, .arborito-media-edit, .arborito-math-edit, .arborito-table-edit';

function isInsertRangeBlocked(range, editorEl) {
    if (!range || !editorEl?.contains(range.commonAncestorContainer)) return true;
    let n = range.commonAncestorContainer;
    if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
    if (!(n instanceof Element)) return true;
    if (n.closest('input, textarea, select, button, option')) return true;
    const host = n.closest(BLOCK_HOST_SELECTOR);
    if (host && editorEl.contains(host)) return true;
    let el = n;
    while (el && el !== editorEl) {
        if (el instanceof HTMLElement && el.getAttribute('contenteditable') === 'false') return true;
        el = el.parentElement;
    }
    return false;
}

/** Caret inside quiz fields / block chrome → insert after that block, or at editor end. */
function resolveEditorInsertRange(editorEl) {
    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (range && editorEl.contains(range.commonAncestorContainer) && !isInsertRangeBlocked(range, editorEl)) {
        return range;
    }
    if (range && editorEl.contains(range.commonAncestorContainer)) {
        let n = range.commonAncestorContainer;
        if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
        const host = n instanceof Element ? n.closest(BLOCK_HOST_SELECTOR) : null;
        if (host && editorEl.contains(host)) {
            const afterBlock = document.createRange();
            afterBlock.setStartAfter(host);
            afterBlock.collapse(true);
            return afterBlock;
        }
    }
    const end = document.createRange();
    end.selectNodeContents(editorEl);
    end.collapse(false);
    return end;
}

/** Block templates must not land inside a paragraph or inline size span. */
function hoistRangeForBlockInsert(editorEl, range) {
    if (!range || !editorEl?.contains(range.commonAncestorContainer)) return range;
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const host = node instanceof Element ? node.closest('P, H1, H2, H3, H4, H5, H6, BLOCKQUOTE, SPAN[data-arb-size]') : null;
    if (!host || !editorEl.contains(host) || host === editorEl) return range;
    const outer =
        host.tagName === 'SPAN'
            ? host.parentElement?.closest('P, H1, H2, H3, H4, H5, H6, BLOCKQUOTE') || host
            : host;
    const next = document.createRange();
    next.setStartAfter(outer);
    next.collapse(true);
    return next;
}

function insertHtmlLooksLikeBlock(html) {
    return /edit-block-wrapper|arborito-quiz-edit|arborito-game-edit|arborito-media-edit|arborito-callout-edit|arborito-math-edit|arborito-table-edit|data-quiz-block/i.test(
        String(html || '')
    );
}

function placeCaretInParagraph(p, atEnd = false) {
    const sel = window.getSelection();
    if (!sel || !(p instanceof HTMLParagraphElement)) return false;
    sel.removeAllRanges();
    const nr = document.createRange();
    if (atEnd && p.lastChild) {
        nr.setStartAfter(p.lastChild);
    } else {
        nr.setStart(p, 0);
    }
    nr.collapse(true);
    sel.addRange(nr);
    return true;
}

/** Visible caret after insert; media blocks focus the URL field. */
function placeSelectionAfter(node, editorEl) {
    if (!(node instanceof Node) || !editorEl?.contains(node)) return;

    if (node instanceof HTMLParagraphElement) {
        placeCaretInParagraph(node, false);
        return;
    }

    const next = node.nextElementSibling;
    if (next instanceof HTMLParagraphElement && editorEl.contains(next)) {
        placeCaretInParagraph(next, false);
        return;
    }

    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    const nr = document.createRange();
    nr.setStartAfter(node);
    nr.collapse(true);
    sel.addRange(nr);
}

function focusInsertedBlockField(insertedTail, editorEl) {
    if (!(insertedTail instanceof Node) || !editorEl?.contains(insertedTail)) return;
    let block =
        insertedTail instanceof HTMLElement && insertedTail.classList?.contains('edit-block-wrapper')
            ? insertedTail
            : insertedTail.previousElementSibling;
    if (!(block instanceof HTMLElement) || !editorEl.contains(block)) return;
    const urlInput = block.querySelector('.media-url-input, .game-url-input');
    if (urlInput instanceof HTMLInputElement) {
        urlInput.focus({ preventScroll: true });
        if (block.querySelector('.media-url-input')) urlInput.select();
        return;
    }
    const codeInput = block.querySelector('.arborito-code-input');
    if (codeInput instanceof HTMLElement) {
        codeInput.focus({ preventScroll: true });
        const sel = window.getSelection();
        if (sel && codeInput.firstChild) {
            sel.removeAllRanges();
            const nr = document.createRange();
            nr.setStart(codeInput.firstChild, 0);
            nr.collapse(true);
            sel.addRange(nr);
        }
        return;
    }
    const tableCell = block.querySelector('.arborito-table-edit__cell');
    if (tableCell instanceof HTMLElement) {
        tableCell.focus({ preventScroll: true });
    }
}

function resolveInsertedBlockEl(tail, editorEl) {
    if (!(tail instanceof Node) || !editorEl?.contains(tail)) return null;
    if (tail instanceof HTMLElement) {
        if (
            tail.classList.contains('edit-block-wrapper') ||
            tail.classList.contains('arborito-quiz-edit')
        ) {
            return tail;
        }
        const prev = tail.previousElementSibling;
        if (
            prev instanceof HTMLElement &&
            (prev.classList.contains('edit-block-wrapper') ||
                prev.classList.contains('arborito-quiz-edit'))
        ) {
            return prev;
        }
    }
    return tail instanceof HTMLElement ? tail : null;
}

function bindInsertedBlock(insertedEl) {
    if (!(insertedEl instanceof HTMLElement)) return;
    if (insertedEl.classList.contains('arborito-quiz-edit')) {
        ensureAndBindQuizWizard(insertedEl);
        return;
    }
    if (insertedEl.classList.contains('arborito-game-edit')) {
        bindGameBlockControls(insertedEl);
        return;
    }
    if (insertedEl.classList.contains('arborito-media-edit')) {
        bindMediaBlockControls(insertedEl);
        return;
    }
    if (insertedEl.classList.contains('arborito-table-edit')) {
        bindTableBlockControls(insertedEl);
    }
}

function scrollToInsertedBlock(blockEl) {
    if (!(blockEl instanceof HTMLElement)) return;
    scrollLessonEditorToInsertedBlock(blockEl, { behavior: 'smooth' });
}

function insertHtmlIntoEditor(editorEl, html) {
    const trimmed = (html || '').trim();
    if (!trimmed) return null;
    editorEl.focus();
    let range = resolveEditorInsertRange(editorEl);
    const isBlock = insertHtmlLooksLikeBlock(trimmed);
    if (isBlock) {
        range = hoistRangeForBlockInsert(editorEl, range);
        /* Never delete neighboring content when inserting a block widget. */
        if (!range.collapsed) {
            const collapsed = range.cloneRange();
            collapsed.collapse(false);
            range = collapsed;
        }
    }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const frag = parseEditorHtmlFragment(trimmed);
    const last = frag.lastChild;
    if (!isBlock) range.deleteContents();
    range.insertNode(frag);
    if (last && editorEl.contains(last)) {
        const blockEl = resolveInsertedBlockEl(last, editorEl);
        placeSelectionAfter(last, editorEl);
        focusInsertedBlockField(last, editorEl);
        if (blockEl) scrollToInsertedBlock(blockEl);
        return blockEl || last;
    }
    return editorEl.lastElementChild;
}

/**
 * Inserts a template block at the caret inside the editor, or at the end if focus is invalid.
 */
export function insertBlockInEditor(editorEl, type) {
    if (!editorEl) return;
    let html = '';
    try {
        if (type === 'section') html = BLOCKS.section();
        if (type === 'subsection') html = BLOCKS.subsection();
        if (type === 'quiz') html = BLOCKS.quiz();
        if (type === 'callout') html = BLOCKS.callout();
        if (type === 'image') html = BLOCKS.media('image');
        if (type === 'video') html = BLOCKS.media('video');
        if (type === 'audio') html = BLOCKS.media('audio');
        if (type === 'game') html = BLOCKS.game('', '', true);
        if (type === 'math') html = BLOCKS.math('', 'block');
        if (type === 'code') html = BLOCKS.code('bash');
        if (type === 'table') html = BLOCKS.table();
    } catch (e) {
        console.warn('[Arborito] insert block template failed', type, e);
    }
    if (!html) return;

    let insertedBlock = null;
    try {
        insertedBlock = insertHtmlIntoEditor(editorEl, html);
        if (!insertedBlock) {
            editorEl.insertAdjacentHTML('beforeend', html);
            const lastChild = editorEl.lastElementChild;
            if (lastChild) {
                insertedBlock = resolveInsertedBlockEl(lastChild, editorEl) || lastChild;
                placeSelectionAfter(lastChild, editorEl);
                focusInsertedBlockField(lastChild, editorEl);
                if (insertedBlock instanceof HTMLElement) scrollToInsertedBlock(insertedBlock);
            }
        }
    } catch {
        editorEl.insertAdjacentHTML('beforeend', html);
        const lastChild = editorEl.lastElementChild;
        if (lastChild) {
            insertedBlock = resolveInsertedBlockEl(lastChild, editorEl) || lastChild;
            placeSelectionAfter(lastChild, editorEl);
            focusInsertedBlockField(lastChild, editorEl);
            if (insertedBlock instanceof HTMLElement) scrollToInsertedBlock(insertedBlock);
        }
    }
    if (insertedBlock instanceof HTMLElement) bindInsertedBlock(insertedBlock);
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Last focused formula textarea per lesson editor (survives toolbar clicks). */
/** @type {WeakMap<HTMLElement, HTMLTextAreaElement>} */
const lastMathLatexByEditor = new WeakMap();

export function rememberMathLatexInput(editorEl, textarea) {
    if (!(editorEl instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) return;
    if (!editorEl.contains(textarea) || !textarea.classList.contains('math-latex-input')) return;
    lastMathLatexByEditor.set(editorEl, textarea);
}

function resolveMathLatexTarget(editorEl) {
    if (!(editorEl instanceof HTMLElement)) return null;
    const active = document.activeElement;
    if (
        active instanceof HTMLTextAreaElement &&
        editorEl.contains(active) &&
        active.classList.contains('math-latex-input')
    ) {
        return active;
    }
    const remembered = lastMathLatexByEditor.get(editorEl);
    if (
        remembered instanceof HTMLTextAreaElement &&
        remembered.isConnected &&
        editorEl.contains(remembered)
    ) {
        return remembered;
    }
    const within = editorEl.querySelector('.arborito-math-edit:focus-within .math-latex-input');
    return within instanceof HTMLTextAreaElement ? within : null;
}

function insertIntoMathLatex(textarea, ch) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const next = `${textarea.value.slice(0, start)}${ch}${textarea.value.slice(end)}`;
    textarea.value = next;
    const caret = start + ch.length;
    try {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(caret, caret);
    } catch {
        /* ignore */
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function insertMathSymbolInEditor(editorEl, symbol) {
    const ch = String(symbol || '');
    if (!editorEl || !ch) return;

    let mathInput = resolveMathLatexTarget(editorEl);
    if (!mathInput) {
        /* Insert menu may steal focus — fall back to the newest formula in the editor. */
        const all = editorEl.querySelectorAll('textarea.math-latex-input');
        mathInput = all.length ? all[all.length - 1] : null;
    }
    if (mathInput) {
        insertIntoMathLatex(mathInput, ch);
        rememberMathLatexInput(editorEl, mathInput);
        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    editorEl.focus();
    const range = resolveEditorInsertRange(editorEl);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    try {
        document.execCommand('insertText', false, ch);
    } catch {
        range.insertNode(document.createTextNode(ch));
        range.collapse(false);
    }
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
}
