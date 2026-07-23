import { escHtml } from '../../../shared/lib/html-escape.js';
import { normalizeAuthorMarkupArtifacts } from '../../../shared/lib/author-markup-normalize.js';
import { safeHttpUrl, validateLessonMediaUrl } from './parser-url.js';
import {
    isFencedBlockClose,
    matchFencedLessonOpen,
    parseKeyValueBody,
    titleFromFields,
    indexFromFields,
    gameFromFields,
    mathFromFields
} from './lesson-fenced-blocks.js';
import { isOutlinePathId } from './lesson-syllabus.js';
import {
    normalizeChallenge,
    parseQuizBlock,
    isQuizBlockOpen,
    isQuizBlockClose,
    getPlayableModes,
    ALL_QUIZ_MODES,
    findQuizBlocks,
    challengeToQuizBlock,
    challengeHasQuizShape,
} from './quiz-schema.js';
import { tryParseGfmTable } from './lesson-table.js';

function processInlineStyles(text) {
    const placeholders = [];
    const token = (i) => `__ARB_SIZE_${i}__`;
    let raw = normalizeAuthorMarkupArtifacts(text);
    raw = raw.replace(/\{\{(lg|md|sm)\}\}([\s\S]+?)\{\{\/\1\}\}/g, (_, size, inner) => {
        const i = placeholders.push({ size, inner }) - 1;
        return token(i);
    });
    let parsed = escHtml(raw);
    parsed = parsed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/(^|[^\*])\*([^\*]+)\*/g, '$1<em>$2</em>');
    parsed = parsed.replace(
        /`(.+?)`/g,
        '<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">$1</code>'
    );
    for (let i = 0; i < placeholders.length; i++) {
        const ph = placeholders[i];
        const inner = processInlineStyles(ph.inner);
        parsed = parsed.replaceAll(
            escHtml(token(i)),
            `<span data-arb-size="${escHtml(ph.size)}" class="arb-inline-size arb-inline-size--${escHtml(ph.size)}">${inner}</span>`
        );
    }
    return parsed;
}

export function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function parseContent(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const blocks = [];
    const slugUseCount = Object.create(null);
    const headingId = (rawTitle) => {
        let base = slugify(String(rawTitle || '')) || 'section';
        /* Never collide with the reserved synthetic whole-body id. */
        if (base === '__arborito_synthetic_intro__') base = 'section';
        const n = (slugUseCount[base] || 0) + 1;
        slugUseCount[base] = n;
        if (n === 1) return base;
        return `${base}-${n}`;
    };
    const headingText = (rawTitle) => String(rawTitle != null ? rawTitle : '');

    let currentTextBuffer = [];
    let pendingAlign = null;
    let currentChallenge = null;
    let challengeOrdinal = 0;

    const flushChallenge = () => {
        if (currentChallenge && challengeHasQuizShape(currentChallenge)) {
            challengeOrdinal += 1;
            const n = normalizeChallenge(currentChallenge);
            blocks.push({
                type: 'quiz',
                id: `quiz-${challengeOrdinal}`,
                ...n,
                modes:
                    n.modes?.length && n.modes.length < ALL_QUIZ_MODES.length
                        ? [...n.modes]
                        : getPlayableModes(n),
                traps: Array.isArray(currentChallenge.traps) ? [...currentChallenge.traps] : [],
                items: Array.isArray(currentChallenge.items) ? currentChallenge.items.map((item) => normalizeChallenge(item)) : []
            });
        }
        currentChallenge = null;
    };

    const flushText = () => {
        if (currentTextBuffer.length > 0) {
            const b = { type: 'p', text: processInlineStyles(currentTextBuffer.join('<br>')) };
            if (pendingAlign) b.align = pendingAlign;
            blocks.push(b);
            currentTextBuffer = [];
            pendingAlign = null;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) {
            flushText();
            continue;
        }

        if (line.toLowerCase().startsWith('@align:')) {
            flushText();
            const v = line.substring(7).trim().toLowerCase();
            pendingAlign = v === 'center' || v === 'right' || v === 'left' ? v : null;
            continue;
        }

        /* Syllabus: `#1.1} Title` — before normal `# ` ATX (no space after #). */
        {
            const syl = line.match(/^#(\d+(?:\.\d+)*)\}\s+(.*)$/);
            if (syl) {
                flushText();
                const path = String(syl[1] || '').trim();
                const raw = String(syl[2] || '');
                const depth = path.split('.').length;
                const type =
                    depth <= 1 ? 'h2' : depth === 2 ? 'h3' : depth === 3 ? 'h4' : depth === 4 ? 'h5' : 'h6';
                const b = { type, text: headingText(raw), id: path };
                if (pendingAlign) {
                    b.align = pendingAlign;
                    pendingAlign = null;
                }
                blocks.push(b);
                continue;
            }
        }

        if (line.startsWith('# ')) {
            flushText();
            const raw = line.substring(2);
            const b = { type: 'h1', text: headingText(raw), id: headingId(raw) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('## ')) {
            flushText();
            const raw = line.substring(3);
            const b = { type: 'h2', text: headingText(raw), id: headingId(raw) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('###### ')) {
            flushText();
            const raw = line.substring(7);
            const b = { type: 'h6', text: headingText(raw), id: headingId(raw) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('##### ')) {
            flushText();
            const raw = line.substring(6);
            const b = { type: 'h5', text: headingText(raw), id: headingId(raw) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('#### ')) {
            flushText();
            const raw = line.substring(5);
            const b = { type: 'h4', text: headingText(raw), id: headingId(raw) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('### ')) {
            flushText();
            const raw = line.substring(4);
            const b = { type: 'h3', text: headingText(raw), id: headingId(raw) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }

        const fencedTag = matchFencedLessonOpen(line);
        if (fencedTag) {
            flushText();
            const body = [];
            i++;
            while (i < lines.length && !isFencedBlockClose(lines[i], fencedTag)) {
                body.push(lines[i]);
                i++;
            }
            const fields = parseKeyValueBody(body);
            if (fencedTag === 'section' || fencedTag === 'subsection') {
                const raw = titleFromFields(fields);
                const index = indexFromFields(fields);
                const id = isOutlinePathId(index) ? index : headingId(raw);
                const b = {
                    type: fencedTag === 'subsection' ? 'subsection' : 'section',
                    text: headingText(raw),
                    id,
                };
                if (pendingAlign) {
                    b.align = pendingAlign;
                    pendingAlign = null;
                }
                blocks.push(b);
            } else if (fencedTag === 'image') {
                const src = validateLessonMediaUrl('image', fields.url);
                if (src) {
                    const img = { type: 'image', src };
                    const caption = String(fields.caption || '').trim();
                    if (caption) img.caption = caption;
                    blocks.push(img);
                }
            } else if (fencedTag === 'video') {
                const src = validateLessonMediaUrl('video', fields.url);
                if (src) blocks.push({ type: 'video', src });
            } else if (fencedTag === 'audio') {
                const src = validateLessonMediaUrl('audio', fields.url);
                if (src) blocks.push({ type: 'audio', src });
            } else if (fencedTag === 'game') {
                const g = gameFromFields(fields);
                blocks.push({
                    type: 'game',
                    url: safeHttpUrl(g.url),
                    label: g.label,
                    optional: g.optional,
                    topics: g.topics
                });
            } else if (fencedTag === 'math') {
                const m = mathFromFields(fields);
                if (m.latex) blocks.push({ type: 'math', latex: m.latex, display: m.display });
            }
            continue;
        }

        if (line.startsWith('```')) {
            flushText();
            let codeContent = '';
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeContent += lines[i] + '\n';
                i++;
            }
            blocks.push({ type: 'code', text: codeContent.trim() });
            continue;
        }

        const gfmTable = tryParseGfmTable(lines, i);
        if (gfmTable) {
            flushText();
            blocks.push({
                type: 'table',
                headers: gfmTable.headers.map((c) => processInlineStyles(c)),
                rows: gfmTable.rows.map((r) => r.map((c) => processInlineStyles(c))),
            });
            i = gfmTable.nextIndex;
            continue;
        }

        if (line.startsWith('- ')) {
            flushText();
            const items = [];
            items.push(processInlineStyles(line.substring(2)));
            while (i + 1 < lines.length && lines[i + 1].trim().startsWith('- ')) {
                i++;
                items.push(processInlineStyles(lines[i].trim().substring(2)));
            }
            const b = { type: 'list', items };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }

        const orderedItem = line.match(/^(\d+)\.\s+(.+)$/);
        if (orderedItem) {
            flushText();
            const items = [processInlineStyles(orderedItem[2])];
            while (i + 1 < lines.length) {
                const next = lines[i + 1].trim();
                const m = next.match(/^(\d+)\.\s+(.+)$/);
                if (!m) break;
                i++;
                items.push(processInlineStyles(m[2]));
            }
            const b = { type: 'list', items, ordered: true };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }

        if (isQuizBlockOpen(line)) {
            flushText();
            flushChallenge();
            const body = [];
            i++;
            while (i < lines.length && !isQuizBlockClose(lines[i])) {
                body.push(lines[i]);
                i++;
            }
            currentChallenge = parseQuizBlock(body);
            flushChallenge();
            continue;
        }

        if (!line.startsWith('@')) {
            currentTextBuffer.push(line);
        }
    }

    flushText();
    flushChallenge();

    if (!blocks.some((b) => b.type === 'quiz')) {
        let ordinal = 0;
        for (const fenced of findQuizBlocks(text)) {
            if (!challengeHasQuizShape(fenced.challenge)) continue;
            ordinal += 1;
            blocks.push(challengeToQuizBlock(fenced.challenge, `quiz-${ordinal}`));
        }
    }

    return blocks;
}
