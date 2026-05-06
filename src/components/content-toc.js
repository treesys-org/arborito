import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';
import { tocHeadingTitleForEdit } from '../utils/lesson-toc-mutations.js';
import { escHtml, escAttr } from '../utils/html-escape.js';

/** TOC row text without leading emoji (map title already has its own icon). */
function tocPlainLineForList(item) {
    if (!item || item.id === 'intro') return (item && item.text) || '';
    const lv = Math.min(6, Math.max(1, item.level || 1));
    const prefix = '#'.repeat(lv);
    return tocHeadingTitleForEdit(`${prefix} ${item.text || ''}`);
}

export function tocLabelForDisplay(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw
        .replace(/\bLPIC-?\d*\b/gi, '')
        .replace(/\b(certificación|certification)\b/gi, '')
        .replace(/\s*[\u2014\u2013\-]\s*[\u2014\u2013\-]\s*/g, ' — ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s*[—–-]\s*|\s*[—–-]\s*$/g, '')
        .trim();
    return s || raw.trim();
}

export function getToc(currentNode) {
    if (!(currentNode && currentNode.content)) return [];
    const blocks = parseContent(currentNode.content);
    const items = [];

    blocks.forEach((b) => {
        if (b.type === 'h1' || b.type === 'section') {
            items.push({ text: b.text, level: 1, id: b.id, isQuiz: false });
        }
        if (b.type === 'h2' || b.type === 'subsection') {
            items.push({ text: b.text, level: 2, id: b.id, isQuiz: false });
        }
        if (b.type === 'h3') {
            items.push({ text: b.text, level: 3, id: b.id, isQuiz: false });
        }
        if (b.type === 'h4') {
            items.push({ text: b.text, level: 4, id: b.id, isQuiz: false });
        }
        if (b.type === 'h5') {
            items.push({ text: b.text, level: 5, id: b.id, isQuiz: false });
        }
        if (b.type === 'h6') {
            items.push({ text: b.text, level: 6, id: b.id, isQuiz: false });
        }
        if (b.type === 'quiz') {
            items.push({ text: store.ui.quizLabel, level: 1, id: b.id, isQuiz: true });
        }
    });
    return items;
}

export function getActiveBlocks(blocks, toc, activeSectionIndex) {
    if (!blocks.length) return [];
    if (!toc.length) return blocks;
    const activeItem = toc[activeSectionIndex];
    if (!activeItem) return blocks;
    if (toc.length === 1) return blocks;

    const nextItem = toc[activeSectionIndex + 1];

    let startIndex = 0;
    startIndex = blocks.findIndex(b => b.id === activeItem.id);
    if (startIndex === -1) startIndex = 0;

    let endIndex = blocks.length;
    if (nextItem) {
        const nextIndex = blocks.findIndex(b => b.id === nextItem.id);
        if (nextIndex !== -1) endIndex = nextIndex;
    }
    
    return blocks.slice(startIndex, endIndex);
}

export function getFilteredToc(toc, tocFilter) {
    if (!tocFilter) return toc;
    const q = tocFilter.toLowerCase();
    return toc.filter((item) => item.text.toLowerCase().includes(q));
}

export function buildTocListMarkup(toc, filteredToc, activeSectionIndex, visitedSections, opts = {}) {
    const includeSingleSection = opts.includeSingleSection === true;
    const construct = opts.constructEdit === true;
    const ui = opts.ui || {};
    const headingRaws = opts.headingRaws || [];
    const tocInlineEditIdx = opts.tocInlineEditIdx;

    if (toc.length === 0) return '';
    if (toc.length <= 1 && !includeSingleSection) return '';
    return filteredToc.map((item) => {
        // Virtual “Intro” entry exists only to compute ranges when markdown
        // starts with paragraphs. In construction it must not appear in TOC.
        if (construct && (item && item.id) === 'intro') return '';
        const lv = Math.min(8, Math.max(1, item.level || 1));
        // Logical depth: 0 => '##'. For UI we use data-toc-depth = depth+1.
        const outlineDepth = Math.max(0, Math.min(5, lv - 2));
        // In construction the full row (drag handle, +, ✕) shifts so hierarchy reads
        // at a glance; in read mode we keep traditional inner padding.
        const depthIndent = construct ? Math.min(72, outlineDepth * 16) : 0;
        const paddingLeft = construct ? 0 : 6 + (Math.max(0, lv - 1) * 18);
        const fontSize =
            lv >= 6
                ? 'text-[10px] font-bold'
                : lv >= 5
                  ? 'text-[11px] font-bold'
                  : lv === 4
                    ? 'text-xs font-bold'
                    : lv === 3
                      ? 'text-xs font-medium'
                      : 'text-sm font-bold';
        const iconSize = lv >= 4 ? 'w-5 h-5' : 'w-6 h-6';
        const depthTag = Math.min(6, outlineDepth + 1);
        const depthCls = `arborito-lesson-toc-depth-${depthTag}`;
        const idx = toc.findIndex((t) => t.id === item.id);
        const active = activeSectionIndex === idx;
        const tickHtml = !construct
            ? `${visitedSections.has(idx)
                  ? '<span class="text-green-500 font-bold">✓</span>'
                  : `<span class="w-2 h-2 rounded-full ${active ? 'bg-sky-500' : 'border border-slate-300 dark:border-slate-600'}"></span>`}`
            : '';

        const listLine = tocPlainLineForList(item);
        const listDisplay = tocLabelForDisplay(listLine);

        if (!construct) {
            return `
            <button type="button" class="btn-toc arborito-lesson-toc-item ${depthCls} text-left py-3 px-3 rounded-xl ${fontSize} transition-colors w-full flex items-start gap-3 whitespace-normal border border-transparent ${active ? 'is-active' : ''}"
                data-idx="${idx}" data-toc-depth="${depthTag}" ${active ? 'aria-current="true"' : ''} style="padding-left: ${paddingLeft}px">
                <div class="js-toc-tick mt-0.5 flex-shrink-0 ${iconSize} flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                    ${tickHtml}
                </div>
                <span class="leading-tight break-words pt-0.5">${escHtml(listDisplay)}</span>
            </button>`;
        }

        const raw = headingRaws[idx] || '';
        const editing = tocInlineEditIdx === idx;
        const canEditRow = !item.isQuiz && item.id !== 'intro';
        const renameHint = ui.lessonTocRename || 'Rename';
        const deleteHint = ui.lessonTocDeleteSection || ui.graphDelete || 'Delete section';
        const addSubLabel = ui.lessonTocAddSubsection || 'Add sub-topic';
        const addSubHint = (ui.lessonTocAddSubsectionHint || addSubLabel).trim();
        const dragLabel = ui.lessonTocDragReorder || 'Reorder section';
        const dragHint = (ui.lessonTocDragNestHint || '').trim();
        const gutterNest = (ui.lessonTocDropGutterNest || '').trim();
        const dragTitleBits = [dragHint ? `${dragLabel} — ${dragHint}` : dragLabel, gutterNest].filter(Boolean);
        const dragTitle = escAttr(dragTitleBits.join(' · '));
        const gripSvg = `<svg class="arborito-lesson-toc-drag__svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/></svg>`;
        const dragHandle = canEditRow
            ? `<button type="button" class="js-toc-drag-handle arborito-lesson-toc-drag" draggable="true" data-idx="${idx}" aria-label="${escAttr(dragLabel)}" title="${dragTitle}">${gripSvg}</button>`
            : `<span class="arborito-lesson-toc-drag arborito-lesson-toc-drag--muted" aria-hidden="true">${gripSvg}</span>`;

        if (editing && canEditRow) {
            const titleVal = tocHeadingTitleForEdit(raw);
            const editHint = (ui.lessonTocEditHint || '').trim();
            const ph = escAttr(editHint || renameHint);
            return `
                <div class="arborito-lesson-toc-row ${depthCls} flex flex-col gap-2 py-2 px-2 rounded-xl border border-amber-300/50 dark:border-amber-600/40 bg-amber-50/80 dark:bg-amber-950/30 w-full" data-toc-idx="${idx}" data-toc-depth="${depthTag}" style="margin-left: ${depthIndent}px">
                <div class="flex items-start gap-2 w-full">
                    ${dragHandle}
                    <div class="flex flex-col gap-1 flex-1 min-w-0">
                        <input type="text" class="js-toc-edit-title w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm py-1.5 px-2 font-bold" value="${escAttr(titleVal)}" placeholder="${ph}" aria-label="${escAttr(renameHint)}" />
                    </div>
                </div>
            </div>`;
        }

        const renamable = canEditRow ? '1' : '0';
        const tapHint = (ui.lessonTocTapToRenameHint || '').trim();
        const nameTitle = canEditRow ? escAttr(tapHint ? `${renameHint} — ${tapHint}` : renameHint) : '';
        /* Same logic as graph nodes (`buildMobileInlineNodeToolsHTML`): inline X per row. */
        const deleteBtn = canEditRow
            ? `<button type="button" class="js-toc-construct-delete arborito-lesson-toc-del" data-idx="${idx}" aria-label="${escAttr(deleteHint)}" title="${escAttr(deleteHint)}"><span aria-hidden="true">✕</span></button>`
            : '';
        const addSubBtn = canEditRow
            ? `<button type="button" class="js-toc-row-add-sub arborito-lesson-toc-add-inline" data-idx="${idx}" aria-label="${escAttr(addSubHint)}" title="${escAttr(addSubHint)}"><span aria-hidden="true">+</span></button>`
            : '';

        return `
            <div class="arborito-lesson-toc-row arborito-lesson-toc-row--construct ${depthCls} flex items-stretch gap-1 min-w-0 ${active ? 'is-active' : ''}" data-toc-idx="${idx}" data-toc-depth="${depthTag}" style="margin-left: ${depthIndent}px">
                ${dragHandle}
                <button type="button" class="btn-toc arborito-lesson-toc-item flex-1 min-w-0 text-left py-3 px-2 rounded-xl ${fontSize} transition-colors flex items-start gap-1 whitespace-normal border border-transparent ${active ? 'is-active' : ''} ${active ? 'bg-sky-50/80 dark:bg-sky-950/20' : ''}"
                    data-idx="${idx}" ${active ? 'aria-current="true"' : ''}>
                    <span class="leading-tight break-words min-w-0 flex-1 text-left js-toc-name-slot self-stretch flex items-center py-2 -my-1 min-h-[2.75rem] ${canEditRow ? 'cursor-text' : 'cursor-default opacity-90 pt-0.5'}" data-toc-renamable="${renamable}" title="${nameTitle}">${escHtml(listDisplay)}</span>
                </button>
                ${addSubBtn}
                ${deleteBtn}
            </div>`;
    }).join('');
}
