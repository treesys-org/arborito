/**
 * Visual editor pipeline (markdownToVisualHTML). Reading uses parseContent + ContentBlock.jsx.
 * Serialization lives in logic/editor-serialize.js; this module owns block templates.
 */

import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { escHtml, escAttr } from '../../../shared/lib/html-escape.js';
import { chromeEmojiHtml } from '../../../shared/lib/emoji-display.js';
import { createQuizWizardMountShell } from './quiz-wizard-block.js';
import { normalizeChallenge } from '../../learning/api/quiz-schema.js';
import { mediaProviderSelectHtml } from './logic/editor-media-block.js';
import { buildTableBlockHtml } from './logic/editor-table.js';
import {
    parseArboritoFile,
    markdownToVisualHTML as markdownToVisualHTMLCore,
    visualHTMLToMarkdown,
    reconstructArboritoFile,
    replaceEditorHtml
} from './logic/editor-serialize.js';

export { parseArboritoFile, visualHTMLToMarkdown, reconstructArboritoFile, replaceEditorHtml };

export const BLOCKS = {
    quiz: (coreConcept = '', shortDef = '', question = '', correct = '', traps = []) => {
        let ch;
        if (coreConcept && typeof coreConcept === 'object' && !Array.isArray(coreConcept)) {
            ch = normalizeChallenge(coreConcept);
        } else {
            ch = normalizeChallenge({
                core_concept: coreConcept,
                short_definition: shortDef,
                main_question: question,
                correct_answer: correct,
                traps: Array.isArray(traps) ? traps : []
            });
        }
        return createQuizWizardMountShell(ch);
    },
    section: (title = '') => {
        const ui = store.ui;
        return `
        <div class="edit-block-wrapper arborito-section-edit my-8 pl-4 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-r relative group" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" data-editor-action="remove-block" role="button" tabindex="-1" title="${escAttr(ui.delete || ui.editorBlockRemove || 'Remove')}">🗑️</div>
            <span class="text-blue-800 dark:text-blue-300 font-bold text-xs uppercase block mb-1">${escHtml(ui.editorBlockSection)}</span>
            <input type="text" class="section-input w-full bg-transparent border-none text-xl font-bold text-slate-800 dark:text-white outline-none placeholder-blue-300" value="${escAttr(title)}" placeholder="${escAttr(ui.editorBlockPlaceholder)}">
        </div>
        <p><br></p>`;
    },
    subsection: (title = '') => {
        const ui = store.ui;
        return `
        <div class="edit-block-wrapper arborito-subsection-edit my-6 pl-4 border-l-4 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-r relative group" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" data-editor-action="remove-block" role="button" tabindex="-1" title="${escAttr(ui.delete || ui.editorBlockRemove || 'Remove')}">🗑️</div>
            <span class="text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase block mb-1">${escHtml(ui.editorBlockSubsectionBadge || 'Subsection')}</span>
            <input type="text" class="subsection-input w-full bg-transparent border-none text-lg font-bold text-slate-700 dark:text-slate-200 outline-none placeholder-slate-400" value="${escAttr(title)}" placeholder="${escAttr(ui.editorBlockPlaceholder)}">
        </div>
        <p><br></p>`;
    },
    media: (type, url = '') => {
        const ui = store.ui;
        const previewEmpty = ui.editorBlockMediaPreviewEmpty || 'Paste a link to preview';
        const typeLabel =
            type === 'video'
                ? ui.mediaPlaceholderVideo || 'Video'
                : type === 'audio'
                  ? ui.mediaPlaceholderAudio || 'Audio'
                  : ui.mediaPlaceholderImage || 'Image';
        const initialPreview =
            type === 'image' && url
                ? `<img src="${escAttr(url)}" class="media-preview__image max-h-56 w-auto max-w-full rounded-lg shadow object-contain" alt="">`
                : `<span class="media-preview__placeholder">${escHtml(previewEmpty)}</span>`;
        const placeholder = escAttr(ui.editorBlockMediaUrlPlaceholder || 'Paste HTTPS link');
        const providerLabel = escAttr(ui.editorBlockMediaProviderLabel || 'Platform');
        const whyLink = escHtml(ui.editorBlockMediaWhyLink || "Why can't I paste any link?");
        const whyBody = escHtml(
            ui.editorBlockMediaWhyBody ||
                "We're a small team and, by law, must not host unmoderated uploads. We only allow platforms that already moderate. We'll add more over time."
        );
        const localWarn = escHtml(
            ui.editorBlockMediaLocalDisclaimer ||
                'Local files do not travel on the network and cannot be published online. If you want to publish this content, replace it with one of the platforms.'
        );
        const localBtn = escHtml(ui.editorBlockMediaLocalChoose || 'Choose file…');
        const accept =
            type === 'video' ? 'video/mp4,video/webm,video/*' : type === 'audio' ? 'audio/*' : 'image/*';
        const detectedProvider =
            (url && /(?:^|\/)media\//i.test(url) ? 'local' : '') ||
            (url ? '' : type === 'video' ? 'youtube' : type === 'audio' ? 'archive' : 'imgur');
        const isLocal = detectedProvider === 'local';
        const localFileLabel = isLocal && url ? escHtml(String(url).replace(/^.*\//, '')) : '';
        return `
        <div class="edit-block-wrapper arborito-media-edit my-6 p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl relative group flex flex-col items-stretch max-w-full" data-type="${type}"${url ? ` data-media-url="${escAttr(url)}"` : ''} data-media-provider="${detectedProvider}" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" data-editor-action="remove-block" role="button" tabindex="-1" title="${escAttr(ui.delete || ui.editorBlockRemove || 'Remove')}">🗑️</div>
            <span class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase mb-2">${escHtml(typeLabel)}</span>
            <div class="media-preview-wrap w-full mb-3 min-h-[5rem] flex items-center justify-center rounded-lg bg-white/60 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/60 overflow-hidden p-2">
                <div class="media-preview w-full flex items-center justify-center">${initialPreview}</div>
            </div>
            <div class="w-full flex flex-col gap-2">
                <select class="media-provider-select arborito-select arborito-select--compact w-full sm:max-w-[12rem]" aria-label="${providerLabel}">
                    ${mediaProviderSelectHtml(type, url, escHtml, escAttr)}
                </select>
                <div class="media-url-row w-full${isLocal ? ' hidden' : ''}"${isLocal ? ' hidden style="display:none"' : ''}>
                    <input type="text" inputmode="url" autocomplete="off" spellcheck="false" class="media-url-input arborito-input arborito-input--compact w-full" value="${escAttr(url)}" placeholder="${placeholder}">
                </div>
                <div class="media-local-row w-full flex flex-col gap-2${isLocal ? '' : ' hidden'}"${isLocal ? '' : ' hidden style="display:none"'}>
                    <label class="arborito-cta-sky btn px-3 py-2 rounded-lg text-xs font-bold cursor-pointer inline-flex items-center justify-center self-start">
                        ${localBtn}
                        <input type="file" class="media-local-file sr-only" accept="${escAttr(accept)}">
                    </label>
                    <p class="media-local-filename m-0 text-[11px] font-mono text-slate-600 dark:text-slate-300${localFileLabel ? '' : ' hidden'}">${localFileLabel}</p>
                    <div class="media-local-warn m-0 rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/50 dark:border-red-400 px-3 py-2.5 text-[12px] leading-snug text-red-800 dark:text-red-200 font-semibold flex flex-col items-start gap-2" role="alert">
                        <span class="media-local-warn-text">${localWarn}</span>
                        <span class="media-local-warn-icon shrink-0 inline-flex" aria-hidden="true">${chromeEmojiHtml('⚠️', 18)}</span>
                    </div>
                </div>
            </div>
            <div class="media-network-foot mt-5 pt-1${isLocal ? ' hidden' : ''}"${isLocal ? ' hidden style="display:none"' : ''}>
                <p class="media-url-foot mb-0 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                    <button type="button" class="media-url-why-toggle underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200 bg-transparent border-0 p-0 cursor-pointer text-[10px] text-inherit font-medium" aria-expanded="false">${whyLink}</button>
                </p>
                <p class="media-url-why-panel mt-1.5 mb-0 text-[10px] leading-snug text-slate-500 dark:text-slate-400" hidden>${whyBody}</p>
            </div>
        </div>
        <p><br></p>`;
    },
    callout: (text = '', opts = {}) => {
        const ui = store.ui;
        const inner = opts.html
            ? text || escHtml(ui.editorBlockCallout)
            : escHtml(text || ui.editorBlockCallout);
        return `
        <blockquote class="arborito-callout-edit my-6 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-4 italic text-slate-600 dark:text-slate-300 rounded-r relative group" contenteditable="true">${inner}</blockquote>
        <p><br></p>`;
    },
    game: (url = '', label = '', optional = true, topics = []) => {
        const ui = store.ui;
        const topicIds = Array.isArray(topics) ? topics.map((t) => String(t)).filter(Boolean) : [];
        const topicCount = topicIds.length;
        const noneSelected = ui.editorBlockGameNoneSelected || 'No game selected';
        const selectedLabel = label.trim() || (url.trim() ? url.trim() : noneSelected);
        const selectedClass = url.trim() ? '' : ' game-selected-display--empty';
        const topicsRequiredClass = topicCount ? '' : ' game-topics-section--missing';
        return `
        <div class="edit-block-wrapper arborito-game-edit my-6 p-4 sm:p-5 bg-orange-50/80 dark:bg-orange-950/20 border border-orange-200/70 dark:border-orange-800/35 rounded-2xl relative group flex flex-col gap-3 max-w-full" contenteditable="false" data-optional="${optional ? 'true' : 'false'}" data-topics="${escAttr(topicIds.join(','))}">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" data-editor-action="remove-block" role="button" tabindex="-1" title="${escAttr(ui.delete || ui.editorBlockRemove || 'Remove')}">🗑️</div>
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="text-orange-800 dark:text-orange-200 font-black text-xs uppercase tracking-wider flex items-center gap-2">
                    <span class="text-lg" aria-hidden="true">🎮</span>
                    <span>${escHtml(ui.editorBlockGame || 'Game')}</span>
                </div>
                <span class="text-[10px] font-black uppercase tracking-wider text-orange-700 dark:text-orange-300">${escHtml(ui.editorBlockGameOfficialOnly || 'Official arcade only')}</span>
            </div>
            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                <div class="game-selected-display flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-900/50 border border-orange-100 dark:border-orange-900/40${selectedClass}">${escHtml(selectedLabel)}</div>
                <button type="button" class="game-browse-btn shrink-0 min-h-[40px] px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-500">
                    ${escHtml(ui.editorBlockGameBrowse || 'Browse arcade')}
                </button>
            </div>
            <div class="game-picker-panel hidden flex flex-col gap-2 p-3 rounded-xl border border-orange-200/80 dark:border-orange-800/50 bg-white dark:bg-slate-900/90 shadow-lg" role="dialog" aria-label="${escAttr(ui.editorBlockGameBrowse || 'Browse arcade')}">
                <div class="flex items-center gap-2">
                    <input type="search" class="game-search-input arborito-input arborito-input--compact arborito-input--search flex-1" placeholder="${escAttr(ui.editorBlockGameSearch || 'Search games…')}" autocomplete="off">
                    <button type="button" class="game-picker-close shrink-0 min-h-[36px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold" aria-label="${escAttr(ui.close || 'Close')}">✕</button>
                </div>
                <p class="game-picker-loading hidden m-0 text-xs text-slate-500 dark:text-slate-400">${escHtml(ui.editorBlockGameLoading || 'Loading games…')}</p>
                <p class="game-picker-empty hidden m-0 text-xs text-slate-500 dark:text-slate-400">${escHtml(ui.editorBlockGameNoResults || 'No games match your search.')}</p>
                <div class="game-picker-results arborito-picker-panel max-h-52 overflow-y-auto" role="listbox"></div>
            </div>
            <input type="hidden" class="game-url-input" value="${escAttr(url)}">
            <input type="hidden" class="game-label-input" value="${escAttr(label)}">
            <div class="game-topics-section flex flex-col gap-2 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/40${topicsRequiredClass}">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                        ${escHtml(ui.editorBlockGameTopics || 'Topics')} <span class="text-red-500">*</span>
                        <span class="game-topics-count opacity-70">(${topicCount})</span>
                    </div>
                    <button type="button" class="game-topic-browse-btn shrink-0 min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:opacity-90">
                        ${escHtml(ui.editorBlockGameTopicsBrowse || 'Choose topics')}
                    </button>
                </div>
                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed m-0">${escHtml(ui.editorBlockGameTopicsRequired || 'Pick at least one lesson topic for this game.')}</p>
                <div class="game-topics-picker-panel hidden flex flex-col gap-2">
                    <input type="search" class="game-topic-search-input arborito-input arborito-input--compact arborito-input--search w-full" placeholder="${escAttr(ui.editorBlockGameTopicsSearch || 'Search lesson topics…')}" autocomplete="off">
                    <p class="game-topic-picker-empty hidden m-0 text-xs text-slate-500 dark:text-slate-400">${escHtml(ui.editorBlockGameTopicsNoResults || 'No topics match your search.')}</p>
                    <div class="game-topic-picker-results arborito-picker-panel max-h-44 overflow-y-auto" role="listbox"></div>
                </div>
                <input type="hidden" class="game-topics-input" value="${escAttr(topicIds.join(','))}">
                <div class="game-topics-chips flex flex-wrap gap-1.5">${topicIds.length ? topicIds.map((id) => `<span class="game-topic-chip inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-[11px] font-bold text-orange-900 dark:text-orange-100" data-topic-id="${escAttr(id)}"><span class="game-topic-chip__label">${escHtml(id)}</span><button type="button" class="game-topic-chip-remove text-orange-700 dark:text-orange-200" aria-label="${escAttr(ui.remove || 'Remove')}">×</button></span>`).join('') : `<span class="game-topics-list text-[11px] text-slate-500 dark:text-slate-400 italic">${escHtml(ui.editorBlockGameTopicsNone || 'No topics selected')}</span>`}</div>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed m-0">${escHtml(ui.editorBlockGameHint || 'This inserts an optional game item. Students will open the standard Game Player with this cartridge preselected.')}</p>
        </div>
        <p><br></p>`;
    },
    math: (latex = '', display = 'block') => {
        const ui = store.ui;
        const disp = display === 'inline' ? 'inline' : 'block';
        const preview = latex.trim() || ui.editorBlockMathPlaceholder || 'E = mc^2';
        return `
        <div class="edit-block-wrapper arborito-math-edit my-6 p-4 bg-indigo-50 dark:bg-indigo-900/15 border border-indigo-200 dark:border-indigo-800/40 rounded-xl relative group flex flex-col gap-3" contenteditable="false" data-display="${escAttr(disp)}">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" data-editor-action="remove-block" role="button" tabindex="-1" title="${escAttr(ui.delete || ui.editorBlockRemove || 'Remove')}">🗑️</div>
            <div class="text-indigo-800 dark:text-indigo-200 font-black text-xs uppercase tracking-wider flex items-center gap-2">
                <span class="text-lg" aria-hidden="true">∑</span>
                <span>${escHtml(ui.editorBlockMath || 'Math formula')}</span>
            </div>
            <div class="flex flex-col gap-2">
                <textarea class="math-latex-input arborito-input arborito-input--compact arborito-input--mono w-full min-h-[3rem] resize-y" placeholder="${escAttr(ui.editorBlockMathPlaceholder || 'E = mc^2, \\\\frac{a}{b}, x^2')}">${escHtml(latex)}</textarea>
                <div class="flex items-center gap-2">
                    <span class="text-slate-500 select-none text-xs">${escHtml(ui.editorBlockMathDisplay || 'Display')}</span>
                    <select class="math-display-select arborito-select arborito-select--compact text-xs">
                        <option value="block"${disp === 'block' ? ' selected' : ''}>${escHtml(ui.editorBlockMathDisplayBlock || 'Centered block')}</option>
                        <option value="inline"${disp === 'inline' ? ' selected' : ''}>${escHtml(ui.editorBlockMathDisplayInline || 'Inline')}</option>
                    </select>
                </div>
            </div>
            <div class="math-preview arborito-math arborito-math--block text-center text-base text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-900/40 border border-indigo-100 dark:border-indigo-900/50" data-math-preview>${escHtml(preview)}</div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                ${escHtml(ui.editorBlockMathHint || 'Use LaTeX-style notation: \\\\frac{a}{b}, x^2, \\\\sqrt{x}, \\\\pi, \\\\sum')}
            </div>
        </div>
        <p><br></p>`;
    },
    code: (lang = 'bash', body = '') => {
        const ui = store.ui;
        let language = String(lang || 'bash').trim() || 'bash';
        let inner = String(body ?? '').replace(/\s+$/, '');
        const fenced = inner.match(/^```([^\n]*)\n([\s\S]*?)```\s*$/);
        if (fenced) {
            language = fenced[1].trim() || language;
            inner = fenced[2].trimEnd();
        }
        return `
        <pre class="edit-block-wrapper arborito-code-edit not-prose my-6 p-4 bg-slate-950 border border-slate-700 rounded-xl relative group font-mono text-sm leading-relaxed text-emerald-300 overflow-x-auto max-w-full" data-arborito-code="1" data-code-lang="${escAttr(language)}" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" data-editor-action="remove-block" role="button" tabindex="-1" title="${escAttr(ui.delete || ui.editorBlockRemove || 'Remove')}">🗑️</div>
            <div class="flex items-center gap-2 mb-2">
                <span class="text-slate-400 font-black text-[10px] uppercase tracking-wider">${escHtml(ui.codeTerminalLabel || 'Terminal')}</span>
                <span class="text-slate-500 text-[9px] uppercase tracking-wider font-bold">${escHtml(language)}</span>
            </div>
            <code class="arborito-code-input block whitespace-pre-wrap break-words outline-none min-h-[4rem] text-emerald-300" contenteditable="true" spellcheck="false">${escHtml(inner)}</code>
        </pre>
        <p><br></p>`;
    },
    table: (headersOrData = null, rows = null, opts = {}) => {
        const ui = store.ui;
        let headers;
        let bodyRows;
        let htmlCells = false;
        if (headersOrData && typeof headersOrData === 'object' && !Array.isArray(headersOrData)) {
            headers = headersOrData.headers;
            bodyRows = headersOrData.rows;
            htmlCells = !!headersOrData.htmlCells || !!opts.html;
        } else {
            headers = headersOrData;
            bodyRows = rows;
            htmlCells = !!opts.html;
        }
        return buildTableBlockHtml(
            ui,
            { headers, rows: bodyRows, htmlCells },
            htmlCells ? (c) => c : undefined
        );
    }
};

export function markdownToVisualHTML(md, opts = {}) {
    return markdownToVisualHTMLCore(md, BLOCKS, opts);
}
