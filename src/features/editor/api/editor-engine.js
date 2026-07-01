/**
 * Visual editor pipeline (markdownToVisualHTML). Reading uses parseContent + ContentBlock.jsx.
 * Serialization lives in logic/editor-serialize.js; this module owns block templates.
 */

import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { escAttr } from '../../../shared/lib/html-escape.js';
import { createQuizWizardMountShell } from './quiz-wizard-block.js';
import { normalizeChallenge } from '../../learning/api/quiz-schema.js';
import {
    parseArboritoFile,
    markdownToVisualHTML as markdownToVisualHTMLCore,
    visualHTMLToMarkdown,
    reconstructArboritoFile,
    replaceEditorHtml
} from './logic/editor-serialize.js';

export { parseArboritoFile, visualHTMLToMarkdown, reconstructArboritoFile, replaceEditorHtml };

const escHtml = escAttr;

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
        return `
        <div class="edit-block-wrapper arborito-media-edit my-6 p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl relative group flex flex-col items-center" data-type="${type}" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" data-editor-action="remove-block" role="button" tabindex="-1" title="${escAttr(ui.delete || ui.editorBlockRemove || 'Remove')}">🗑️</div>
            <span class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase mb-2">${escHtml(type.toUpperCase())}</span>
            ${type === 'image' && url ? `<img src="${escAttr(url)}" class="max-h-48 rounded shadow mb-2 object-contain bg-white">` : ''}
            <div class="w-full flex gap-2">
                <span class="text-slate-400 select-none">🔗</span>
                <input type="text" class="media-url-input arborito-input arborito-input--compact flex-1" value="${escAttr(url)}" placeholder="${escAttr(ui.editorBlockMediaUrl)} ${escAttr(ui.editorBlockMediaUrlHint)}">
            </div>
        </div>
        <p><br></p>`;
    },
    callout: (text = '') => {
        const ui = store.ui;
        return `
        <blockquote class="arborito-callout-edit my-6 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-4 italic text-slate-600 dark:text-slate-300 rounded-r relative group" contenteditable="true">${escHtml(text || ui.editorBlockCallout)}</blockquote>
        <p><br></p>`;
    },
    game: (url = '', label = '', optional = true, topics = []) => {
        const ui = store.ui;
        const topicIds = Array.isArray(topics) ? topics.map((t) => String(t)).filter(Boolean) : [];
        const topicCount = topicIds.length;
        const optLbl = optional ? ui.tagOptional || 'Optional' : ui.tagRequired || 'Required';
        return `
        <div class="edit-block-wrapper arborito-game-edit my-6 p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/40 rounded-xl relative group flex flex-col gap-3" contenteditable="false" data-optional="${optional ? 'true' : 'false'}" data-topics="${escAttr(topicIds.join(','))}">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" data-editor-action="remove-block" role="button" tabindex="-1" title="${escAttr(ui.delete || ui.editorBlockRemove || 'Remove')}">🗑️</div>
            <div class="flex items-center justify-between gap-3">
                <div class="text-orange-800 dark:text-orange-200 font-black text-xs uppercase tracking-wider flex items-center gap-2">
                    <span class="text-lg" aria-hidden="true">🎮</span>
                    <span>${escHtml(ui.editorBlockGame || 'Game')}</span>
                </div>
                <button type="button" class="game-optional-toggle-btn min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-slate-800/90" aria-pressed="${optional ? 'true' : 'false'}">
                    <span class="game-opt-lbl">${escHtml(optLbl)}</span>
                </button>
            </div>
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <span class="text-slate-500 select-none">🗂️</span>
                    <select class="game-existing-select arborito-select arborito-select--compact flex-1 text-xs">
                        <option value="">${escHtml(ui.editorBlockGamePickExisting || 'Pick an existing game…')}</option>
                    </select>
                    <button type="button" class="game-existing-use px-3 py-2 rounded bg-orange-600 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-500">
                        ${escHtml(ui.use || 'Use')}
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-slate-500 select-none">🔗</span>
                    <input type="text" class="game-url-input arborito-input arborito-input--compact arborito-input--mono flex-1" value="${escAttr(url)}" placeholder="${escAttr(ui.editorBlockGameUrl || 'Game URL (cartridge)')}">
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-slate-500 select-none">🏷️</span>
                    <input type="text" class="game-label-input arborito-input arborito-input--compact font-bold flex-1" value="${escAttr(label)}" placeholder="${escAttr(ui.editorBlockGameLabel || 'Label (optional)')}">
                </div>
            </div>
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="arborito-eyebrow arborito-eyebrow--sm text-slate-600 dark:text-slate-300">
                        ${escHtml(ui.editorBlockGameTopics || 'Topics')} <span class="opacity-70">(${topicCount})</span>
                    </div>
                    <button type="button" class="game-topic-clear text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-white/40 dark:hover:bg-white/10">
                        ${escHtml(ui.clear || 'Clear')}
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <select class="game-topic-select arborito-select arborito-select--compact flex-1 text-xs">
                        <option value="">${escHtml(ui.editorBlockGameTopicsPick || 'Pick a topic…')}</option>
                    </select>
                    <button type="button" class="game-topic-add px-3 py-2 rounded bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:opacity-90">
                        ${escHtml(ui.add || 'Add')}
                    </button>
                </div>
                <input type="hidden" class="game-topics-input" value="${escAttr(topicIds.join(','))}">
                <div class="game-topics-list text-[11px] text-slate-600 dark:text-slate-300 font-mono break-words">${topicIds.length ? escHtml(topicIds.join(', ')) : escHtml(ui.editorBlockGameTopicsNone || 'No topics selected')}</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    ${escHtml(ui.editorBlockGameTopicsHint || 'These topics will be sent to the cartridge as context (topics=...).')}
                </div>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                ${escHtml(ui.editorBlockGameHint || 'This inserts an optional game item. Students will open the standard Game Player with this cartridge preselected.')}
            </div>
        </div>
        <p><br></p>`;
    }
};

export function markdownToVisualHTML(md, opts = {}) {
    return markdownToVisualHTMLCore(md, BLOCKS, opts);
}
