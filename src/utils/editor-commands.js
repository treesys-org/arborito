import { BLOCKS } from './editor-engine.js';

const ALIGN_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote';

function isAlignableBlock(el, editorEl) {
    if (!(el instanceof HTMLElement) || !editorEl.contains(el)) return false;
    if (el.closest('.edit-block-wrapper')) return false;
    if ((el.classList && el.classList.contains)('arborito-authoring-outline')) return false;
    return true;
}

/**
 * Applies alignment only to blocks that intersect the selection (not the whole editor).
 * @param {HTMLElement} editorEl
 * @param {'left'|'center'|'right'} align
 */
function alignBlocksForSelection(editorEl, align) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
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

    const applyTo = (el) => {
        el.style.textAlign = align;
        el.setAttribute('data-arb-align', align);
    };

    if (touched.length) {
        for (const el of touched) applyTo(el);
        return;
    }

    /* Collapsed selection or intersectsNode unavailable: single block under caret */
    let n = range.startContainer;
    if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
    let el = n instanceof Element ? n : null;
    while (el && editorEl.contains(el)) {
        if ((el.matches && el.matches(ALIGN_BLOCK_SELECTOR)) && isAlignableBlock(el, editorEl)) {
            applyTo(el);
            return;
        }
        el = el.parentElement;
    }
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

/**
 * Runs document.execCommand on a contenteditable (same contract as the editor panel).
 * formatBlock tries compatible variants and, if needed, wraps the selection in the heading.
 */
export function execCmdOnEditor(editorEl, cmd, val = null) {
    if (!editorEl) return;
    editorEl.focus();

    if (cmd === 'align' && val) {
        const mode = String(val).toLowerCase().trim();
        const align = mode === 'center' ? 'center' : mode === 'right' ? 'right' : 'left';
        alignBlocksForSelection(editorEl, align);
        return;
    }

    if (cmd === 'formatBlock' && val) {
        const raw = String(val).replace(/[<>]/g, '').trim();
        const tag = raw.toLowerCase();
        if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6' || tag === 'p') {
            const bracket = `<${tag}>`;
            const tries = [bracket, tag];
            for (const v of tries) {
                try {
                    document.execCommand('formatBlock', false, v);
                } catch {
                    /* ignore */
                }
                const sel = window.getSelection();
                if ((sel && sel.anchorNode)) {
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

/**
 * Inserts a template block at the caret inside the editor, or at the end if focus is invalid.
 */
export function insertBlockInEditor(editorEl, type) {
    if (!editorEl) return;
    let html = '';
    if (type === 'section') html = BLOCKS.section();
    if (type === 'subsection') html = BLOCKS.subsection();
    if (type === 'quiz') html = BLOCKS.quiz();
    if (type === 'callout') html = BLOCKS.callout();
    if (type === 'image') html = BLOCKS.media('image');
    if (type === 'video') html = BLOCKS.media('video');
    if (type === 'game') html = BLOCKS.game('', '', true);
    if (!html) return;

    editorEl.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (editorEl.contains(range.commonAncestorContainer)) {
            try {
                const tpl = document.createElement('template');
                tpl.innerHTML = html.trim();
                const frag = tpl.content;
                const last = frag.lastChild;
                range.deleteContents();
                range.insertNode(frag);
                if (last && editorEl.contains(last)) {
                    sel.removeAllRanges();
                    const nr = document.createRange();
                    nr.setStartAfter(last);
                    nr.collapse(true);
                    sel.addRange(nr);
                }
                if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                return;
            } catch {
                /* fall through */
            }
        }
    }
    editorEl.insertAdjacentHTML('beforeend', html);
    editorEl.scrollTop = editorEl.scrollHeight;
}
