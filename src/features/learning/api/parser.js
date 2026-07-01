import { escAttr as escHtml } from '../../../shared/lib/html-escape.js';
import { normalizeAuthorMarkupArtifacts } from '../../../shared/lib/author-markup-normalize.js';
import { safeHttpUrl } from './parser-url.js';
import {
    isFencedBlockClose,
    matchFencedLessonOpen,
    parseKeyValueBody,
    titleFromFields,
    gameFromFields
} from './lesson-fenced-blocks.js';
import {
    isQuizChallengeComplete,
    parseAllChallengesFromLessonContent
} from './quiz-status.js';
import {
    normalizeChallenge,
    parseQuizBlock,
    isQuizBlockOpen,
    isQuizBlockClose,
    getPlayableModes,
    ALL_QUIZ_MODES
} from './quiz-schema.js';

function processInlineStyles(text) {
    let parsed = escHtml(normalizeAuthorMarkupArtifacts(text));
    parsed = parsed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/(^|[^\*])\*([^\*]+)\*/g, '$1<em>$2</em>');
    parsed = parsed.replace(/`(.+?)`/g, '<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">$1</code>');
    return parsed;
}

export function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeVideoUrl(raw) {
    let safeSrc = safeHttpUrl(raw);
    if (safeSrc.includes('watch?v=')) safeSrc = safeSrc.replace('watch?v=', 'embed/');
    if (safeSrc.includes('youtu.be/')) safeSrc = safeSrc.replace('youtu.be/', 'youtube.com/embed/');
    return safeSrc;
}

export function parseContent(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const blocks = [];
    const slugUseCount = Object.create(null);
    const headingId = (rawTitle) => {
        const base = slugify(String(rawTitle || '')) || 'section';
        const n = (slugUseCount[base] || 0) + 1;
        slugUseCount[base] = n;
        if (n === 1) return base;
        return `${base}-${n}`;
    };

    let currentTextBuffer = [];
    let pendingAlign = null;
    let currentChallenge = null;
    let challengeOrdinal = 0;

    const flushChallenge = () => {
        if (currentChallenge && isQuizChallengeComplete(currentChallenge)) {
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
                traps: Array.isArray(currentChallenge.traps) ? [...currentChallenge.traps] : []
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

        if (line.startsWith('# ')) {
            flushText();
            const t = line.substring(2);
            const b = { type: 'h1', text: t, id: headingId(t) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('## ')) {
            flushText();
            const t = line.substring(3);
            const b = { type: 'h2', text: t, id: headingId(t) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('###### ')) {
            flushText();
            const t = line.substring(7);
            const b = { type: 'h6', text: t, id: headingId(t) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('##### ')) {
            flushText();
            const t = line.substring(6);
            const b = { type: 'h5', text: t, id: headingId(t) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('#### ')) {
            flushText();
            const t = line.substring(5);
            const b = { type: 'h4', text: t, id: headingId(t) };
            if (pendingAlign) {
                b.align = pendingAlign;
                pendingAlign = null;
            }
            blocks.push(b);
            continue;
        }
        if (line.startsWith('### ')) {
            flushText();
            const t = line.substring(4);
            const b = { type: 'h3', text: t, id: headingId(t) };
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
            if (fencedTag === 'section') {
                const t = titleFromFields(fields);
                const b = { type: 'section', text: t, id: headingId(t) };
                if (pendingAlign) {
                    b.align = pendingAlign;
                    pendingAlign = null;
                }
                blocks.push(b);
            } else if (fencedTag === 'subsection') {
                const t = titleFromFields(fields);
                const b = { type: 'subsection', text: t, id: headingId(t) };
                if (pendingAlign) {
                    b.align = pendingAlign;
                    pendingAlign = null;
                }
                blocks.push(b);
            } else if (fencedTag === 'image') {
                blocks.push({ type: 'image', src: safeHttpUrl(fields.url) });
            } else if (fencedTag === 'video') {
                blocks.push({ type: 'video', src: normalizeVideoUrl(fields.url) });
            } else if (fencedTag === 'audio') {
                blocks.push({ type: 'audio', src: safeHttpUrl(fields.url) });
            } else if (fencedTag === 'game') {
                const g = gameFromFields(fields);
                blocks.push({
                    type: 'game',
                    url: safeHttpUrl(g.url),
                    label: g.label,
                    optional: g.optional,
                    topics: g.topics
                });
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
        for (const qb of parseAllChallengesFromLessonContent(text)) {
            blocks.push({ ...qb, id: qb.id || 'quiz-body' });
        }
    }

    return blocks;
}
