
export function processInlineStyles(text) {
    let parsed = text;
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/(^|[^\*])\*([^\*]+)\*/g, '$1<em>$2</em>');
    parsed = parsed.replace(/`(.*?)`/g, '<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">$1</code>');
    return parsed;
}

function slugify(text) {
    return text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function parseContent(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const blocks = [];
    
    let currentQuizQuestions = [];
    let currentQuizId = '';
    let currentTextBuffer = [];

    const flushText = () => {
        if (currentTextBuffer.length > 0) {
            blocks.push({ type: 'p', text: processInlineStyles(currentTextBuffer.join('<br>')) });
            currentTextBuffer = [];
        }
    };

    const finalizeQuiz = () => {
        if (currentQuizQuestions.length > 0) {
            blocks.push({ 
                type: 'quiz', 
                id: currentQuizId || 'quiz-' + blocks.length, 
                questions: [...currentQuizQuestions] 
            });
            currentQuizQuestions = [];
            currentQuizId = '';
        }
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) { flushText(); continue; }

        // Headers (Standard Markdown)
        if (line.startsWith('# ')) {
            flushText();
            const t = line.substring(2);
            blocks.push({ type: 'h1', text: t, id: slugify(t) });
            continue;
        }
        if (line.startsWith('## ')) {
            flushText();
            const t = line.substring(3);
            blocks.push({ type: 'h2', text: t, id: slugify(t) });
            continue;
        }
        if (line.startsWith('### ')) {
            flushText();
            const t = line.substring(4);
            blocks.push({ type: 'h3', text: t, id: slugify(t) });
            continue;
        }

        // Headers (Arborito semantic tags)
        if (line.startsWith('@section:')) {
            flushText();
            const t = line.substring(9).trim();
            // Maps to Structural Section (Page Splitter)
            blocks.push({ type: 'section', text: t, id: slugify(t) });
            continue;
        }
        if (line.startsWith('@subsection:')) {
            flushText();
            const t = line.substring(12).trim();
            // Maps to Sub-topic (In-page anchor)
            blocks.push({ type: 'subsection', text: t, id: slugify(t) });
            continue;
        }

        // Images
        if (line.startsWith('@image:') || line.startsWith('@img:')) {
            flushText();
            const src = line.substring(line.indexOf(':')+1).trim();
            blocks.push({ type: 'image', src });
            continue;
        }

        // Video
        if (line.startsWith('@video:')) {
            flushText();
            const src = line.substring(7).trim();
            let safeSrc = src;
            // Convert simple YT links to embed
            if (src.includes('watch?v=')) safeSrc = src.replace('watch?v=', 'embed/');
            if (src.includes('youtu.be/')) safeSrc = src.replace('youtu.be/', 'youtube.com/embed/');
            blocks.push({ type: 'video', src: safeSrc });
            continue;
        }
        
        // Audio
        if (line.startsWith('@audio:')) {
            flushText();
            const src = line.substring(7).trim();
            blocks.push({ type: 'audio', src });
            continue;
        }

        // Quiz
        if (line.startsWith('@quiz:')) {
            flushText();
            if (currentQuizQuestions.length === 0) currentQuizId = 'q-' + i;
            
            const qText = line.substring(6).trim();
            const options = [];
            
            // Look ahead for options
            while(i + 1 < lines.length) {
                const next = lines[i+1].trim();
                if (next.startsWith('@correct:')) {
                    options.push({ text: next.substring(9).trim(), correct: true });
                    i++;
                } else if (next.startsWith('@option:')) {
                    options.push({ text: next.substring(8).trim(), correct: false });
                    i++;
                } else if (next === '') { i++; } 
                else { break; }
            }
            if (options.length) currentQuizQuestions.push({ question: qText, options });
            continue;
        }

        // Game recommendation / optional curriculum item
        // Format: @game: <url> | <label?> | optional? | topics=<id1,id2,...>?
        if (line.startsWith('@game:')) {
            flushText();
            const raw = line.substring(6).trim();
            const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
            const url = parts[0] || '';
            const label = parts[1] || '';
            const optional = parts.some((p) => String(p).toLowerCase() === 'optional');
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
            blocks.push({ type: 'game', url, label, optional, topics });
            continue;
        }
        
        // Code Block
        if (line.startsWith('```')) {
             flushText();
             let codeContent = '';
             i++;
             while(i < lines.length && !lines[i].trim().startsWith('```')) {
                 codeContent += lines[i] + '\n';
                 i++;
             }
             blocks.push({ type: 'code', text: codeContent.trim() });
             continue;
        }
        
        // List
        if (line.startsWith('- ')) {
             flushText();
             const items = [];
             items.push(processInlineStyles(line.substring(2)));
             while(i + 1 < lines.length && lines[i+1].trim().startsWith('- ')) {
                 i++;
                 items.push(processInlineStyles(lines[i].trim().substring(2)));
             }
             blocks.push({ type: 'list', items });
             continue;
        }

        finalizeQuiz();

        // Ignore metadata lines in body (anything starting with @ that wasn't caught above)
        if (!line.startsWith('@')) {
            currentTextBuffer.push(line);
        }
    }
    
    flushText();
    finalizeQuiz();
    return blocks;
}
