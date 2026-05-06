/**
 * Visual editor pipeline (markdownToVisualHTML). Reading uses parseContent + ContentRenderer — optional future preview/block unification is a product decision.
 */

import { store } from '../store.js';
import { escAttr } from './html-escape.js';

const escHtml = escAttr;

function renderInlineMarkdown(text) {
    const safe = escHtml(text);
    // Intentionally tiny subset: bold + italic only (after escaping).
    return safe
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>');
}

/** En modo autor: el esquema solo vive en el temario; en el cuerpo son marcadores discretos. */
function lineToAuthoringGhostOutline(trimmed) {
    const wrap = (attrs, titleRaw) =>
        `<div class="arborito-authoring-outline" ${attrs} contenteditable="false" role="separator"><span class="arborito-authoring-outline__rail" aria-hidden="true"></span><span class="arborito-authoring-outline__label">${renderInlineMarkdown(
            titleRaw
        )}</span></div>`;
    if (trimmed.startsWith('###### ')) return wrap('data-md-level="6"', trimmed.slice(7));
    if (trimmed.startsWith('##### ')) return wrap('data-md-level="5"', trimmed.slice(6));
    if (trimmed.startsWith('#### ')) return wrap('data-md-level="4"', trimmed.slice(5));
    if (trimmed.startsWith('### ')) return wrap('data-md-level="3"', trimmed.slice(4));
    if (trimmed.startsWith('## ')) return wrap('data-md-level="2"', trimmed.slice(3));
    if (trimmed.startsWith('# ')) return wrap('data-md-level="1"', trimmed.slice(2));
    if (trimmed.startsWith('@section:')) return wrap('data-md-kind="section"', trimmed.slice(9).trim());
    if (trimmed.startsWith('@subsection:')) return wrap('data-md-kind="subsection"', trimmed.slice(12).trim());
    return '';
}

function outlineLabelToPlainMarkdown(labelEl) {
    if (!labelEl) return '';
    let text = labelEl.innerHTML
        .replace(/<b>/g, '**')
        .replace(/<\/b>/g, '**')
        .replace(/<strong>/g, '**')
        .replace(/<\/strong>/g, '**')
        .replace(/<i>/g, '*')
        .replace(/<\/i>/g, '*')
        .replace(/<em>/g, '*')
        .replace(/<\/em>/g, '*')
        .replace(/&nbsp;/g, ' ')
        .replace(/<br>/g, '\n');
    const tmp = document.createElement('div');
    tmp.innerHTML = text;
    return tmp.innerText.trim();
}

// --- VISUAL BLOCK TEMPLATES ---
export const BLOCKS = {
    quiz: (q = "", correct = "", options = []) => {
        const ui = store.ui;
        let optsHtml = options.map(o => `
            <div class="option-row flex gap-2 items-center mb-2">
                <input type="radio" class="w-4 h-4" disabled>
                <input type="text" class="quiz-input option-input w-full p-2 border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" value="${escAttr(o)}" placeholder="${escAttr(ui.editorBlockOptions)}">
            </div>
        `).join('');
        
        return `
        <div class="edit-block-wrapper arborito-quiz-edit my-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl relative group" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
            
            <div class="quiz-header text-green-800 dark:text-green-300 font-bold text-xs uppercase mb-2">❓ ${escHtml(ui.editorBlockQuizQuestion)}</div>
            <input type="text" class="quiz-input question-input w-full p-2 border border-green-300 dark:border-green-700 rounded mb-4 font-bold bg-white dark:bg-slate-800 dark:text-white" value="${escAttr(q)}" placeholder="${escAttr(ui.editorBlockQuizQuestion)}...">
            
            <div class="quiz-header text-green-800 dark:text-green-300 font-bold text-xs uppercase mb-2">${escHtml(ui.editorBlockCorrect)}</div>
            <div class="option-row flex gap-2 items-center mb-4">
                <input type="radio" checked class="w-4 h-4 accent-green-600" disabled>
                <input type="text" class="quiz-input correct-input w-full p-2 border border-green-300 dark:border-green-700 rounded bg-white dark:bg-slate-800 dark:text-white" value="${escAttr(correct)}" placeholder="${escAttr(ui.editorBlockCorrect)}">
            </div>

            <div class="quiz-header text-green-800 dark:text-green-300 font-bold text-xs uppercase mb-2">${escHtml(ui.editorBlockOptions)}</div>
            <div class="options-container">
                ${optsHtml || `
                <div class="option-row flex gap-2 items-center mb-2">
                    <input type="radio" disabled class="w-4 h-4">
                    <input type="text" class="quiz-input option-input w-full p-2 border rounded bg-white dark:bg-slate-800 dark:text-white dark:border-slate-700" placeholder="${escAttr(ui.editorBlockOptions)} 1">
                </div>
                `}
            </div>
            <button class="text-xs text-green-700 dark:text-green-400 font-bold mt-2 hover:underline" onclick="const div = document.createElement('div'); div.className='option-row flex gap-2 items-center mb-2'; div.innerHTML='<input type=\\'radio\\' disabled class=\\'w-4 h-4\\'><input type=\\'text\\' class=\\'quiz-input option-input w-full p-2 border rounded bg-white dark:bg-slate-800 dark:text-white dark:border-slate-700\\' placeholder=\\'${ui.editorBlockOptions}\\'>'; this.previousElementSibling.appendChild(div);">${ui.editorBlockAddOption}</button>
        </div>
        <p><br></p>`;
    },
    section: (title = "") => {
        const ui = store.ui;
        return `
        <div class="edit-block-wrapper arborito-section-edit my-8 pl-4 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-r relative group" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
            <span class="text-blue-800 dark:text-blue-300 font-bold text-xs uppercase block mb-1">${escHtml(ui.editorBlockSection)}</span>
            <input type="text" class="section-input w-full bg-transparent border-none text-xl font-bold text-slate-800 dark:text-white outline-none placeholder-blue-300" value="${escAttr(title)}" placeholder="${escAttr(ui.editorBlockPlaceholder)}">
        </div>
        <p><br></p>`;
    },
    subsection: (title = "") => {
        const ui = store.ui;
        // Visual block for @subsection
        return `
        <div class="edit-block-wrapper arborito-subsection-edit my-6 pl-4 border-l-4 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-r relative group" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
            <span class="text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase block mb-1">${escHtml(ui.editorBlockSubsectionBadge || 'Subsection')}</span>
            <input type="text" class="subsection-input w-full bg-transparent border-none text-lg font-bold text-slate-700 dark:text-slate-200 outline-none placeholder-slate-400" value="${escAttr(title)}" placeholder="${escAttr(ui.editorBlockPlaceholder)}">
        </div>
        <p><br></p>`;
    },
    media: (type, url = "") => {
        const ui = store.ui;
        return `
        <div class="edit-block-wrapper arborito-media-edit my-6 p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl relative group flex flex-col items-center" data-type="${type}" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
            <span class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase mb-2">${escHtml(type.toUpperCase())}</span>
            ${type === 'image' && url ? `<img src="${escAttr(url)}" class="max-h-48 rounded shadow mb-2 object-contain bg-white">` : ''}
            <div class="w-full flex gap-2">
                <span class="text-slate-400 select-none">🔗</span>
                <input type="text" class="media-url-input flex-1 p-1 text-sm border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-600" value="${escAttr(url)}" placeholder="${escAttr(ui.editorBlockMediaUrl)} ${escAttr(ui.editorBlockMediaUrlHint)}">
            </div>
        </div>
        <p><br></p>`;
    },
    callout: (text = "") => {
        const ui = store.ui;
        return `
        <blockquote class="arborito-callout-edit my-6 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-4 italic text-slate-600 dark:text-slate-300 rounded-r relative group" contenteditable="true">${escHtml(text || ui.editorBlockCallout)}</blockquote>
        <p><br></p>`;
    },
    game: (url = "", label = "", optional = true, topics = []) => {
        const ui = store.ui;
        const topicIds = Array.isArray(topics) ? topics.map((t) => String(t)).filter(Boolean) : [];
        const topicCount = topicIds.length;
        const optLbl = optional ? ui.tagOptional || 'Optional' : ui.tagRequired || 'Required';
        return `
        <div class="edit-block-wrapper arborito-game-edit my-6 p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/40 rounded-xl relative group flex flex-col gap-3" contenteditable="false" data-optional="${optional ? 'true' : 'false'}" data-topics="${escAttr(topicIds.join(','))}">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
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
                    <select class="game-existing-select flex-1 p-2 text-xs border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-700">
                        <option value="">${escHtml(ui.editorBlockGamePickExisting || 'Pick an existing game…')}</option>
                    </select>
                    <button type="button" class="game-existing-use px-3 py-2 rounded bg-orange-600 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-500">
                        ${escHtml(ui.use || 'Use')}
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-slate-500 select-none">🔗</span>
                    <input type="text" class="game-url-input flex-1 p-2 text-sm border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-700 font-mono" value="${escAttr(url)}" placeholder="${escAttr(ui.editorBlockGameUrl || 'Game URL (cartridge)')}">
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-slate-500 select-none">🏷️</span>
                    <input type="text" class="game-label-input flex-1 p-2 text-sm border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-700 font-bold" value="${escAttr(label)}" placeholder="${escAttr(ui.editorBlockGameLabel || 'Label (optional)')}">
                </div>
            </div>
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        ${escHtml(ui.editorBlockGameTopics || 'Topics')} <span class="opacity-70">(${topicCount})</span>
                    </div>
                    <button type="button" class="game-topic-clear text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-white/40 dark:hover:bg-white/10">
                        ${escHtml(ui.clear || 'Clear')}
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <select class="game-topic-select flex-1 p-2 text-xs border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-700">
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

// --- UTILITIES ---

export const utf8_to_b64 = (str) => {
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
        console.error("Encoding error", e);
        return "";
    }
};

export const b64_to_utf8 = (str) => {
    try {
        const cleanStr = str.replace(/\s/g, '');
        return decodeURIComponent(escape(atob(cleanStr)));
    } catch (e) {
        console.error("Decoding error", e);
        return "";
    }
};

// --- PARSERS & GENERATORS ---

export function parseArboritoFile(content) {
    const lines = content.split('\n');
    const meta = { title: '', icon: '📄', description: '', order: '99', isExam: false, extra: [] };
    const bodyLines = [];
    let readingMeta = true;

    for (let line of lines) {
        const trim = line.trim();
        // Allow blank lines within metadata block without breaking it, unless it's clearly content
        if (readingMeta) {
            if (trim === '') continue; // Skip empty lines in header

            if (trim.startsWith('@')) {
                if (trim.toLowerCase() === '@exam') { meta.isExam = true; continue; }
                const idx = trim.indexOf(':');
                if (idx > -1) {
                    const key = trim.substring(1, idx).trim().toLowerCase();
                    const val = trim.substring(idx + 1).trim();
                    // Identify content tags that break metadata reading
                    // ADDED 'subsection' to this list
                    if (['quiz', 'image', 'img', 'video', 'audio', 'section', 'subsection', 'game', 'correct', 'option'].includes(key)) {
                        readingMeta = false; bodyLines.push(line);
                    } else {
                        // Standard metadata
                        if (['title', 'icon', 'description', 'order', 'discussion'].includes(key)) {
                             meta[key] = val;
                        } else { 
                             meta.extra.push(line); 
                        }
                    }
                } else { 
                    // Tag without colon (except exam), treat as content or extra
                     meta.extra.push(line);
                }
            } else {
                // First non-empty non-tag line ends metadata
                readingMeta = false;
                bodyLines.push(line);
            }
        } else {
            bodyLines.push(line);
        }
    }
    
    return { meta, body: bodyLines.join('\n').trim() };
}

export function markdownToVisualHTML(md, opts = {}) {
    if (!md) return '<p><br></p>';
    const lines = md.split('\n');
    let html = '';
    const ghostOutline = !!opts.authoringGhostOutline;
    let lastWasGhostOutline = false;
    let pendingAlign = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) {
            if (ghostOutline && lastWasGhostOutline) continue;
            html += '<p><br></p>';
            lastWasGhostOutline = false;
            continue;
        }

        if (line.toLowerCase().startsWith('@align:')) {
            const v = line.substring(7).trim().toLowerCase();
            pendingAlign = (v === 'center' || v === 'right' || v === 'left') ? v : null;
            continue;
        }

        if (ghostOutline) {
            const ghost = lineToAuthoringGhostOutline(line);
            if (ghost) {
                html += ghost;
                lastWasGhostOutline = true;
                continue;
            }
        }
        lastWasGhostOutline = false;

        const alignAttr = pendingAlign ? ` style="text-align:${escAttr(pendingAlign)}" data-arb-align="${escAttr(pendingAlign)}"` : '';
        pendingAlign = null;

        // Headers (classic view: PDF, etc.) — longest to shortest.
        if (line.startsWith('###### ')) {
            html += `<h6${alignAttr}>${renderInlineMarkdown(line.substring(7))}</h6>`;
            continue;
        }
        if (line.startsWith('##### ')) {
            html += `<h5${alignAttr}>${renderInlineMarkdown(line.substring(6))}</h5>`;
            continue;
        }
        if (line.startsWith('#### ')) {
            html += `<h4${alignAttr}>${renderInlineMarkdown(line.substring(5))}</h4>`;
            continue;
        }
        if (line.startsWith('### ')) {
            html += `<h3${alignAttr}>${renderInlineMarkdown(line.substring(4))}</h3>`;
            continue;
        }
        if (line.startsWith('## ')) {
            html += `<h2${alignAttr}>${renderInlineMarkdown(line.substring(3))}</h2>`;
            continue;
        }
        if (line.startsWith('# ')) {
            html += `<h1${alignAttr}>${renderInlineMarkdown(line.substring(2))}</h1>`;
            continue;
        }
        
        // Blockquote
        if (line.startsWith('> ')) { html += BLOCKS.callout(line.substring(2)); continue; }
        
        // Lists
        if (line.startsWith('- ')) { 
            html += `<ul${alignAttr}>`;
            html += `<li>${renderInlineMarkdown(line.substring(2))}</li>`;
            while(i+1 < lines.length && lines[i+1].trim().startsWith('- ')) {
                i++;
                html += `<li>${renderInlineMarkdown(lines[i].trim().substring(2))}</li>`;
            }
            html += '</ul>';
            continue;
        }

        // Custom Blocks
        if (line.startsWith('@section:')) { html += BLOCKS.section(line.substring(9).trim()); continue; }
        if (line.startsWith('@subsection:')) { html += BLOCKS.subsection(line.substring(12).trim()); continue; }
        if (line.startsWith('@image:') || line.startsWith('@img:')) { html += BLOCKS.media('image', line.substring(line.indexOf(':')+1).trim()); continue; }
        if (line.startsWith('@video:')) { html += BLOCKS.media('video', line.substring(7).trim()); continue; }
        if (line.startsWith('@audio:')) { html += BLOCKS.media('audio', line.substring(7).trim()); continue; }
        if (line.startsWith('@game:')) {
            const raw = line.substring(6).trim();
            const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
            const url = parts[0] || '';
            const label = parts[1] || '';
            const optional = parts.some((p) => String(p).toLowerCase() === 'optional') || parts.length < 3;
            let topics = [];
            for (const p of parts.slice(2)) {
                const m = String(p).match(/^topics\s*[:=]\s*(.+)$/i);
                if (m) {
                    topics = m[1]
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                }
            }
            html += BLOCKS.game(url, label, optional, topics);
            continue;
        }

        // Quiz
        if (line.startsWith('@quiz:')) {
            const q = line.substring(6).trim();
            let correct = "";
            let options = [];
            while(i+1 < lines.length) {
                const next = lines[i+1].trim();
                if(next.startsWith('@correct:')) { correct = next.substring(9).trim(); i++; }
                else if(next.startsWith('@option:')) { options.push(next.substring(8).trim()); i++; }
                else if (next === '') { i++; } // Skip empty lines in quiz block
                else { break; }
            }
            html += BLOCKS.quiz(q, correct, options);
            continue;
        }

        // Normal Paragraph (with bold/italic)
        html += `<p${alignAttr}>${renderInlineMarkdown(line)}</p>`;
    }
    return html;
}

export function visualHTMLToMarkdown(rootElement) {
    let md = "";
    
    // Recursive helper if needed, but linear loop usually sufficient for flat structure
    for (const node of rootElement.childNodes) {
        // Text Nodes (direct text)
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.trim()) md += node.textContent.trim() + "\n\n";
            continue;
        }
        
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if ((node.classList && node.classList.contains)('arborito-authoring-outline')) {
            const kind = node.getAttribute('data-md-kind');
            const lev = parseInt(node.getAttribute('data-md-level') || '0', 10);
            const lbl = node.querySelector('.arborito-authoring-outline__label');
            const title = outlineLabelToPlainMarkdown(lbl);
            if (kind === 'section') md += `@section: ${title}\n\n`;
            else if (kind === 'subsection') md += `@subsection: ${title}\n\n`;
            else if (lev >= 1 && lev <= 6) md += `${'#'.repeat(lev)} ${title}\n\n`;
            continue;
        }

        // Headers
        if (node.tagName === 'H1') {
            const a = node.getAttribute('data-arb-align') || (node.style && node.style.textAlign) || '';
            if (a === 'left' || a === 'center' || a === 'right') md += `@align: ${a}\n`;
            md += `# ${node.innerText}\n\n`;
            continue;
        }
        if (node.tagName === 'H2') {
            const a = node.getAttribute('data-arb-align') || (node.style && node.style.textAlign) || '';
            if (a === 'left' || a === 'center' || a === 'right') md += `@align: ${a}\n`;
            md += `## ${node.innerText}\n\n`;
            continue;
        }
        if (node.tagName === 'H3') {
            const a = node.getAttribute('data-arb-align') || (node.style && node.style.textAlign) || '';
            if (a === 'left' || a === 'center' || a === 'right') md += `@align: ${a}\n`;
            md += `### ${node.innerText}\n\n`;
            continue;
        }
        if (node.tagName === 'H4') {
            const a = node.getAttribute('data-arb-align') || (node.style && node.style.textAlign) || '';
            if (a === 'left' || a === 'center' || a === 'right') md += `@align: ${a}\n`;
            md += `#### ${node.innerText}\n\n`;
            continue;
        }
        if (node.tagName === 'H5') {
            const a = node.getAttribute('data-arb-align') || (node.style && node.style.textAlign) || '';
            if (a === 'left' || a === 'center' || a === 'right') md += `@align: ${a}\n`;
            md += `##### ${node.innerText}\n\n`;
            continue;
        }
        if (node.tagName === 'H6') {
            const a = node.getAttribute('data-arb-align') || (node.style && node.style.textAlign) || '';
            if (a === 'left' || a === 'center' || a === 'right') md += `@align: ${a}\n`;
            md += `###### ${node.innerText}\n\n`;
            continue;
        }
        
        // Blockquotes (Simple)
        if (node.tagName === 'BLOCKQUOTE' && !node.classList.contains('arborito-callout-edit')) { 
            md += `> ${node.innerText}\n\n`; continue; 
        }

        // Paragraphs
        if (node.tagName === 'P') { 
            const a = node.getAttribute('data-arb-align') || (node.style && node.style.textAlign) || '';
            if (a === 'left' || a === 'center' || a === 'right') md += `@align: ${a}\n`;
            // Convert HTML styling back to Markdown
            let text = node.innerHTML
                .replace(/<b>/g, '**').replace(/<\/b>/g, '**')
                .replace(/<strong>/g, '**').replace(/<\/strong>/g, '**')
                .replace(/<i>/g, '*').replace(/<\/i>/g, '*')
                .replace(/<em>/g, '*').replace(/<\/em>/g, '*')
                .replace(/&nbsp;/g, ' ')
                .replace(/<br>/g, '\n');
            
            // Strip tags
            const tmp = document.createElement("DIV");
            tmp.innerHTML = text;
            text = tmp.innerText;
            
            if (text.trim()) md += `${text}\n\n`; 
            continue; 
        }
        
        // Lists
        if (node.tagName === 'UL') {
            const a = node.getAttribute('data-arb-align') || (node.style && node.style.textAlign) || '';
            if (a === 'left' || a === 'center' || a === 'right') md += `@align: ${a}\n`;
            for (const li of node.children) md += `- ${li.innerText}\n`;
            md += "\n";
            continue;
        }

        // --- Custom Visual Blocks ---
        
        // Callout
        if (node.classList.contains('arborito-callout-edit')) { 
            md += `> ${node.innerText.trim()}\n\n`; continue; 
        }

        // Section
        if (node.classList.contains('arborito-section-edit')) { 
            const val = (node.querySelector('input') ? node.querySelector('input').value : undefined) || "";
            md += `@section: ${val}\n\n`; continue; 
        }

        // Subsection
        if (node.classList.contains('arborito-subsection-edit')) { 
            const val = (node.querySelector('input') ? node.querySelector('input').value : undefined) || "";
            md += `@subsection: ${val}\n\n`; continue; 
        }

        // Media
        if (node.classList.contains('arborito-media-edit')) {
            const type = node.dataset.type;
            const val = (node.querySelector('input') ? node.querySelector('input').value : undefined) || "";
            if (val) {
                if (type === 'image') md += `@image: ${val}\n\n`;
                else if (type === 'video') md += `@video: ${val}\n\n`;
                else if (type === 'audio') md += `@audio: ${val}\n\n`;
            }
            continue;
        }

        // Quiz
        if (node.classList.contains('arborito-quiz-edit')) {
            const q = (node.querySelector('.question-input') ? node.querySelector('.question-input').value : undefined) || "";
            const correct = (node.querySelector('.correct-input') ? node.querySelector('.correct-input').value : undefined) || "";
            const options = Array.from(node.querySelectorAll('.option-input')).map(i => i.value).filter(v => v);
            
            if (q) {
                md += `@quiz: ${q}\n`;
                if(correct) md += `@correct: ${correct}\n`;
                options.forEach(o => md += `@option: ${o}\n`);
                md += "\n";
            }
            continue;
        }

        // Game
        if (node.classList.contains('arborito-game-edit')) {
            const url = (node.querySelector('.game-url-input') ? node.querySelector('.game-url-input').value : undefined) || '';
            const label = (node.querySelector('.game-label-input') ? node.querySelector('.game-label-input').value : undefined) || '';
            const opt = node.getAttribute('data-optional') !== 'false';
            const topicsRaw = (node.querySelector('.game-topics-input') ? node.querySelector('.game-topics-input').value : undefined) || node.dataset.topics || '';
            const topics = String(topicsRaw)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            if (url.trim()) {
                const parts = [url.trim()];
                if (label.trim()) parts.push(label.trim());
                if (opt) parts.push('optional');
                if (topics.length > 0) parts.push(`topics=${topics.join(',')}`);
                md += `@game: ${parts.join(' | ')}\n\n`;
            }
            continue;
        }
    }
    return md.trim();
}

export function reconstructArboritoFile(meta, bodyMD) {
    let out = '';
    if (meta.title) out += `@title: ${meta.title}\n`;
    if (meta.icon) out += `@icon: ${meta.icon}\n`;
    if (meta.description) out += `@description: ${meta.description}\n`;
    if (meta.order) out += `@order: ${meta.order}\n`;
    if (meta.discussion) out += `@discussion: ${meta.discussion}\n`;
    if (meta.isExam) out += `@exam\n`;
    meta.extra.forEach(line => out += line + '\n');
    
    out += '\n' + bodyMD;
    return out;
}