


import { store } from '../store.js';

// --- VISUAL BLOCK TEMPLATES ---
export const BLOCKS = {
    quiz: (q = "", correct = "", options = []) => {
        const ui = store.ui;
        let optsHtml = options.map(o => `
            <div class="option-row flex gap-2 items-center mb-2">
                <input type="radio" class="w-4 h-4" disabled>
                <input type="text" class="quiz-input option-input w-full p-2 border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" value="${o}" placeholder="${ui.editorBlockOptions}">
            </div>
        `).join('');
        
        return `
        <div class="edit-block-wrapper arborito-quiz-edit my-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl relative group" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-0 group-hover:opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
            
            <div class="quiz-header text-green-800 dark:text-green-300 font-bold text-xs uppercase mb-2">❓ ${ui.editorBlockQuizQuestion}</div>
            <input type="text" class="quiz-input question-input w-full p-2 border border-green-300 dark:border-green-700 rounded mb-4 font-bold bg-white dark:bg-slate-800 dark:text-white" value="${q}" placeholder="${ui.editorBlockQuizQuestion}...">
            
            <div class="quiz-header text-green-800 dark:text-green-300 font-bold text-xs uppercase mb-2">${ui.editorBlockCorrect}</div>
            <div class="option-row flex gap-2 items-center mb-4">
                <input type="radio" checked class="w-4 h-4 accent-green-600" disabled>
                <input type="text" class="quiz-input correct-input w-full p-2 border border-green-300 dark:border-green-700 rounded bg-white dark:bg-slate-800 dark:text-white" value="${correct}" placeholder="${ui.editorBlockCorrect}">
            </div>

            <div class="quiz-header text-green-800 dark:text-green-300 font-bold text-xs uppercase mb-2">${ui.editorBlockOptions}</div>
            <div class="options-container">
                ${optsHtml || `
                <div class="option-row flex gap-2 items-center mb-2">
                    <input type="radio" disabled class="w-4 h-4">
                    <input type="text" class="quiz-input option-input w-full p-2 border rounded bg-white dark:bg-slate-800 dark:text-white dark:border-slate-700" placeholder="${ui.editorBlockOptions} 1">
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
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-0 group-hover:opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
            <span class="text-blue-800 dark:text-blue-300 font-bold text-xs uppercase block mb-1">${ui.editorBlockSection}</span>
            <input type="text" class="section-input w-full bg-transparent border-none text-xl font-bold text-slate-800 dark:text-white outline-none placeholder-blue-300" value="${title}" placeholder="${ui.editorBlockPlaceholder}">
        </div>
        <p><br></p>`;
    },
    subsection: (title = "") => {
        const ui = store.ui;
        // Visual block for @subsection
        return `
        <div class="edit-block-wrapper arborito-subsection-edit my-6 pl-4 border-l-4 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-r relative group" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-0 group-hover:opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
            <span class="text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase block mb-1">SUBSECTION (In-Page)</span>
            <input type="text" class="subsection-input w-full bg-transparent border-none text-lg font-bold text-slate-700 dark:text-slate-200 outline-none placeholder-slate-400" value="${title}" placeholder="${ui.editorBlockPlaceholder}">
        </div>
        <p><br></p>`;
    },
    media: (type, url = "") => {
        const ui = store.ui;
        return `
        <div class="edit-block-wrapper arborito-media-edit my-6 p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl relative group flex flex-col items-center" data-type="${type}" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-0 group-hover:opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
            <span class="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase mb-2">${type.toUpperCase()}</span>
            ${type === 'image' && url ? `<img src="${url}" class="max-h-48 rounded shadow mb-2 object-contain bg-white">` : ''}
            <div class="w-full flex gap-2">
                <span class="text-slate-400 select-none">🔗</span>
                <input type="text" class="media-url-input flex-1 p-1 text-sm border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-600" value="${url}" placeholder="${ui.editorBlockMediaUrl} ${ui.editorBlockMediaUrlHint}">
            </div>
        </div>
        <p><br></p>`;
    },
    callout: (text = "") => {
        const ui = store.ui;
        return `
        <blockquote class="arborito-callout-edit my-6 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-4 italic text-slate-600 dark:text-slate-300 rounded-r relative group" contenteditable="true">${text || ui.editorBlockCallout}</blockquote>
        <p><br></p>`;
    },
    game: (url = "", label = "", optional = true, topics = []) => {
        const ui = store.ui;
        const optChecked = optional ? 'checked' : '';
        const topicIds = Array.isArray(topics) ? topics.map((t) => String(t)).filter(Boolean) : [];
        const topicCount = topicIds.length;
        return `
        <div class="edit-block-wrapper arborito-game-edit my-6 p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/40 rounded-xl relative group flex flex-col gap-3" contenteditable="false" data-optional="${optional ? 'true' : 'false'}" data-topics="${topicIds.join(',').replace(/"/g, '&quot;')}">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-0 group-hover:opacity-100 transition-opacity z-10" onclick="this.parentElement.remove()" title="Remove">🗑️</div>
            <div class="flex items-center justify-between gap-3">
                <div class="text-orange-800 dark:text-orange-200 font-black text-xs uppercase tracking-wider flex items-center gap-2">
                    <span class="text-lg" aria-hidden="true">🎮</span>
                    <span>${ui.editorBlockGame || 'Game'}</span>
                </div>
                <label class="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2 select-none">
                    <input type="checkbox" class="game-optional-toggle accent-slate-900 dark:accent-white" ${optChecked}>
                    <span>${ui.tagOptional || 'Optional'}</span>
                </label>
            </div>
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <span class="text-slate-500 select-none">🗂️</span>
                    <select class="game-existing-select flex-1 p-2 text-xs border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-700">
                        <option value="">${ui.editorBlockGamePickExisting || 'Pick an existing game…'}</option>
                    </select>
                    <button type="button" class="game-existing-use px-3 py-2 rounded bg-orange-600 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-500">
                        ${ui.use || 'Use'}
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-slate-500 select-none">🔗</span>
                    <input type="text" class="game-url-input flex-1 p-2 text-sm border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-700 font-mono" value="${url}" placeholder="${ui.editorBlockGameUrl || 'Game URL (cartridge)'}">
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-slate-500 select-none">🏷️</span>
                    <input type="text" class="game-label-input flex-1 p-2 text-sm border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-700 font-bold" value="${label}" placeholder="${ui.editorBlockGameLabel || 'Label (optional)'}">
                </div>
            </div>
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        ${ui.editorBlockGameTopics || 'Topics'} <span class="opacity-70">(${topicCount})</span>
                    </div>
                    <button type="button" class="game-topic-clear text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-white/40 dark:hover:bg-white/10">
                        ${ui.clear || 'Clear'}
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <select class="game-topic-select flex-1 p-2 text-xs border rounded bg-white dark:bg-slate-900 dark:text-white dark:border-slate-700">
                        <option value="">${ui.editorBlockGameTopicsPick || 'Pick a topic…'}</option>
                    </select>
                    <button type="button" class="game-topic-add px-3 py-2 rounded bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:opacity-90">
                        ${ui.add || 'Add'}
                    </button>
                </div>
                <input type="hidden" class="game-topics-input" value="${topicIds.join(',').replace(/"/g, '&quot;')}">
                <div class="game-topics-list text-[11px] text-slate-600 dark:text-slate-300 font-mono break-words">${topicIds.length ? topicIds.join(', ') : (ui.editorBlockGameTopicsNone || 'No topics selected')}</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    ${ui.editorBlockGameTopicsHint || 'These topics will be sent to the cartridge as context (topics=...).'}
                </div>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                ${ui.editorBlockGameHint || 'This inserts an optional game item. Students will open the standard Game Player with this cartridge preselected.'}
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

export function markdownToVisualHTML(md) {
    if (!md) return '<p><br></p>';
    const lines = md.split('\n');
    let html = '';
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if(!line) { html += '<p><br></p>'; continue; }

        // Headers
        if (line.startsWith('# ')) { html += `<h1>${line.substring(2)}</h1>`; continue; }
        if (line.startsWith('## ')) { html += `<h2>${line.substring(3)}</h2>`; continue; }
        if (line.startsWith('### ')) { html += `<h3>${line.substring(4)}</h3>`; continue; }
        
        // Blockquote
        if (line.startsWith('> ')) { html += BLOCKS.callout(line.substring(2)); continue; }
        
        // Lists
        if (line.startsWith('- ')) { 
            html += '<ul>';
            html += `<li>${line.substring(2)}</li>`;
            while(i+1 < lines.length && lines[i+1].trim().startsWith('- ')) {
                i++;
                html += `<li>${lines[i].trim().substring(2)}</li>`;
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
        let text = line
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>');
        html += `<p>${text}</p>`;
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

        // Headers
        if (node.tagName === 'H1') { md += `# ${node.innerText}\n\n`; continue; }
        if (node.tagName === 'H2') { md += `## ${node.innerText}\n\n`; continue; }
        if (node.tagName === 'H3') { md += `### ${node.innerText}\n\n`; continue; }
        
        // Blockquotes (Simple)
        if (node.tagName === 'BLOCKQUOTE' && !node.classList.contains('arborito-callout-edit')) { 
            md += `> ${node.innerText}\n\n`; continue; 
        }

        // Paragraphs
        if (node.tagName === 'P') { 
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
            const val = node.querySelector('input')?.value || "";
            md += `@section: ${val}\n\n`; continue; 
        }

        // Subsection
        if (node.classList.contains('arborito-subsection-edit')) { 
            const val = node.querySelector('input')?.value || "";
            md += `@subsection: ${val}\n\n`; continue; 
        }

        // Media
        if (node.classList.contains('arborito-media-edit')) {
            const type = node.dataset.type;
            const val = node.querySelector('input')?.value || "";
            if (val) {
                if (type === 'image') md += `@image: ${val}\n\n`;
                else if (type === 'video') md += `@video: ${val}\n\n`;
                else if (type === 'audio') md += `@audio: ${val}\n\n`;
            }
            continue;
        }

        // Quiz
        if (node.classList.contains('arborito-quiz-edit')) {
            const q = node.querySelector('.question-input')?.value || "";
            const correct = node.querySelector('.correct-input')?.value || "";
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
            const url = node.querySelector('.game-url-input')?.value || '';
            const label = node.querySelector('.game-label-input')?.value || '';
            const opt = !!node.querySelector('.game-optional-toggle')?.checked;
            const topicsRaw = node.querySelector('.game-topics-input')?.value || node.dataset.topics || '';
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