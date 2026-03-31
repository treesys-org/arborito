import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';

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
    if (!currentNode?.content) return [];
    const blocks = parseContent(currentNode.content);
    const items = [];
    
    if (blocks.length > 0 && !['h1', 'section'].includes(blocks[0].type)) {
         items.push({ text: store.ui.introLabel, level: 1, id: 'intro', isQuiz: false });
    }
    
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
        if (b.type === 'quiz') {
            items.push({ text: store.ui.quizLabel, level: 1, id: b.id, isQuiz: true });
        }
    });
    
    if (items.length === 0) {
         items.push({ text: store.ui.introLabel, level: 1, id: 'intro', isQuiz: false });
    }

    return items;
}

export function getActiveBlocks(blocks, toc, activeSectionIndex) {
    if (!blocks.length) return [];
    const activeItem = toc[activeSectionIndex];
    
    if (toc.length === 1) return blocks;

    const nextItem = toc[activeSectionIndex + 1];

    let startIndex = 0;
    if (activeItem.id !== 'intro') {
        startIndex = blocks.findIndex(b => b.id === activeItem.id);
        if (startIndex === -1) startIndex = 0;
    }

    let endIndex = blocks.length;
    if (nextItem) {
        const nextIndex = blocks.findIndex(b => b.id === nextItem.id);
        if (nextIndex !== -1) endIndex = nextIndex;
    } else {
         if (activeItem.id === 'intro') {
             const firstH = blocks.findIndex(b => ['h1', 'section', 'h2', 'subsection', 'h3', 'quiz'].includes(b.type));
             if (firstH !== -1) endIndex = firstH;
         }
    }
    
    return blocks.slice(startIndex, endIndex);
}

export function getFilteredToc(toc, tocFilter) {
    if (!tocFilter) return toc;
    const q = tocFilter.toLowerCase();
    return toc.filter((item) => item.text.toLowerCase().includes(q));
}

export function buildTocListMarkup(toc, filteredToc, activeSectionIndex, visitedSections) {
    if (toc.length <= 1) return '';
    return filteredToc.map((item) => {
        const paddingLeft = 12 + (item.level - 1) * 16;
        const fontSize = item.level === 3 ? 'text-xs font-medium' : 'text-sm font-bold';
        const iconSize = item.level === 3 ? 'w-5 h-5' : 'w-6 h-6';
        const idx = toc.findIndex((t) => t.id === item.id);
        return `
            <button type="button" class="btn-toc arborito-lesson-toc-item text-left py-3 px-3 rounded-xl ${fontSize} transition-colors w-full flex items-start gap-3 whitespace-normal border border-transparent ${activeSectionIndex === idx ? 'is-active' : ''}"
                data-idx="${idx}" ${activeSectionIndex === idx ? 'aria-current="true"' : ''} style="padding-left: ${paddingLeft}px">
                <div class="js-toc-tick mt-0.5 flex-shrink-0 ${iconSize} flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                    ${visitedSections.has(idx)
            ? '<span class="text-green-500 font-bold">✓</span>'
            : `<span class="w-2 h-2 rounded-full ${activeSectionIndex === idx ? 'bg-sky-500' : 'border border-slate-300 dark:border-slate-600'}"></span>`}
                </div>
                <span class="leading-tight break-words pt-0.5">${tocLabelForDisplay(item.text)}</span>
            </button>`;
    }).join('');
}
