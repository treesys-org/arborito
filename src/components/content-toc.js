import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';
import { parseArboritoFile } from '../utils/editor-engine.js';
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
    const raw = String(currentNode.content);
    const parsed = parseArboritoFile(raw);
    const blocks = parseContent(parsed.body || raw);
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
    });

    return items;
}

/** How many toc rows before `tocIdx` share the same block id (for disambiguating duplicate slugs). */
export function tocIdOrdinalBefore(toc, tocIdx) {
    if (tocIdx <= 0 || !toc[tocIdx]) return 0;
    const id = toc[tocIdx].id;
    let n = 0;
    for (let i = 0; i < tocIdx; i++) {
        if (toc[i].id === id) n++;
    }
    return n;
}

/** Nth block in `blocks` with `id` (0-based), or -1 */
function findNthBlockById(blocks, id, ordinal) {
    let seen = 0;
    for (let j = 0; j < blocks.length; j++) {
        if (blocks[j].id === id) {
            if (seen === ordinal) return j;
            seen++;
        }
    }
    return -1;
}

const TOC_ANCHOR_TYPES = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'section',
    'subsection',
    'quiz',
    'quizv2'
]);

/** When ids are missing or ambiguous, align toc slots to heading blocks in order. */
function anchorBlockIndicesForToc(blocks, toc) {
    const idx = [];
    for (let i = 0; i < blocks.length; i++) {
        if (TOC_ANCHOR_TYPES.has(blocks[i].type)) idx.push(i);
    }
    return idx.length === toc.length ? idx : null;
}

/** Mark TOC rows that contain an evaluation block (quiz / quizv2). */
export function annotateTocWithQuizSections(blocks, toc) {
    if (!toc.length) return toc;
    return toc.map((item, i) => {
        const slice = getActiveBlocks(blocks, toc, i);
        const hasQuiz = slice.some((b) => b.type === 'quizv2' || b.type === 'quiz');
        return hasQuiz ? { ...item, isQuiz: true } : item;
    });
}

/** All quizv2 blocks inside one TOC section (student mini-exam). */
export function getQuizBlocksForSection(blocks, toc, sectionIndex) {
    if (!blocks.length || !toc.length || sectionIndex < 0) return [];
    return getActiveBlocks(blocks, toc, sectionIndex).filter((b) => b.type === 'quizv2');
}

/** First section index that contains a quiz (exam intro / start CTA). */
export function findFirstQuizSectionIndex(blocks, toc) {
    if (!blocks.length || !toc.length) return -1;
    const annotated = annotateTocWithQuizSections(blocks, toc);
    const flagged = annotated.findIndex((item) => item.isQuiz);
    if (flagged >= 0) return flagged;
    return findQuizSectionIndex(blocks, toc);
}

/** Index of the TOC section that owns the lesson quiz (footer), or -1 if none. */
export function findQuizSectionIndex(blocks, toc) {
    if (!blocks.length || !toc.length) return -1;
    const quizBlock = [...blocks].reverse().find((b) => b.type === 'quizv2');
    if (!quizBlock) return -1;
    const quizKey = quizBlock.id || 'quiz-v2';

    for (let i = 0; i < toc.length; i++) {
        const slice = getActiveBlocks(blocks, toc, i);
        if (slice.some((b) => b.type === 'quizv2' && (b.id || 'quiz-v2') === quizKey)) return i;
    }

    for (let i = 0; i < toc.length; i++) {
        if (getActiveBlocks(blocks, toc, i).some((b) => b.type === 'quizv2')) return i;
    }

    return toc.length - 1;
}

export function getActiveBlocks(blocks, toc, activeSectionIndex) {
    if (!blocks.length) return [];
    if (!toc.length) return blocks;
    const activeItem = toc[activeSectionIndex];
    if (!activeItem) return blocks;
    if (toc.length === 1) return blocks;

    const nextItem = toc[activeSectionIndex + 1];

    const ordStart = tocIdOrdinalBefore(toc, activeSectionIndex);
    let startIndex = findNthBlockById(blocks, activeItem.id, ordStart);

    if (startIndex === -1) {
        const anchors = anchorBlockIndicesForToc(blocks, toc);
        if (anchors) startIndex = anchors[activeSectionIndex];
    }
    if (startIndex === -1) startIndex = 0;

    let endIndex = blocks.length;
    if (nextItem) {
        const ordNext = tocIdOrdinalBefore(toc, activeSectionIndex + 1);
        let nextIndex = findNthBlockById(blocks, nextItem.id, ordNext);
        if (nextIndex === -1) {
            const anchors = anchorBlockIndicesForToc(blocks, toc);
            if (anchors && activeSectionIndex + 1 < anchors.length) nextIndex = anchors[activeSectionIndex + 1];
        }
        if (nextIndex !== -1 && nextIndex > startIndex) endIndex = nextIndex;
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
        const idx = toc.indexOf(item);
        if (idx < 0) return '';
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
        const openSectionHint = (ui.lessonTocTapSectionHint || '').trim();
        const renameViaBtn = (ui.lessonTocRenameViaPencilHint || '').trim();
        const nameTitle = canEditRow
            ? escAttr(
                  [openSectionHint, renameViaBtn ? `${renameHint}: ${renameViaBtn}` : renameHint]
                      .filter(Boolean)
                      .join(' · ')
              )
            : '';
        /* Same logic as graph nodes (`buildMobileInlineNodeToolsHTML`): inline X per row. */
        const deleteBtn = canEditRow
            ? `<button type="button" class="js-toc-construct-delete arborito-lesson-toc-del" data-idx="${idx}" aria-label="${escAttr(deleteHint)}" title="${escAttr(deleteHint)}"><span aria-hidden="true">✕</span></button>`
            : '';
        const addSubBtn = canEditRow
            ? `<button type="button" class="js-toc-row-add-sub arborito-lesson-toc-add-inline" data-idx="${idx}" aria-label="${escAttr(addSubHint)}" title="${escAttr(addSubHint)}"><span aria-hidden="true">+</span></button>`
            : '';
        const renameRowBtn = canEditRow
            ? `<button type="button" class="js-toc-rename arborito-lesson-toc-rename" data-idx="${idx}" aria-label="${escAttr(renameHint)}" title="${escAttr(renameHint)}"><span aria-hidden="true">✎</span></button>`
            : '';

        return `
            <div class="arborito-lesson-toc-row arborito-lesson-toc-row--construct ${depthCls} flex items-stretch gap-1 min-w-0 ${active ? 'is-active' : ''}" data-toc-idx="${idx}" data-toc-depth="${depthTag}" style="margin-left: ${depthIndent}px">
                ${dragHandle}
                <button type="button" class="btn-toc arborito-lesson-toc-item flex-1 min-w-0 text-left py-3 px-2 rounded-xl ${fontSize} transition-colors flex items-start gap-1 whitespace-normal border border-transparent ${active ? 'is-active' : ''} ${active ? 'bg-sky-50/80 dark:bg-sky-950/20' : ''}"
                    data-idx="${idx}" ${active ? 'aria-current="true"' : ''}>
                    <span class="leading-tight break-words min-w-0 flex-1 text-left js-toc-name-slot self-stretch flex items-center py-2 -my-1 min-h-[2.75rem] ${canEditRow ? 'cursor-pointer' : 'cursor-default opacity-90 pt-0.5'}" data-toc-renamable="${renamable}" title="${nameTitle}">${escHtml(listDisplay)}</span>
                </button>
                ${renameRowBtn}
                ${addSubBtn}
                ${deleteBtn}
            </div>`;
    }).join('');
}
