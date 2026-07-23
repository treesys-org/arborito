/**
 * Pure markdown ↔ visual HTML serialization for the lesson editor.
 * Block templates are injected by the caller (`editor-engine` BLOCKS).
 */

import { htmlToPlainText, parseEditorHtmlFragment } from './editor-html-parse.js';
import { escHtml, escAttr } from '../../../../shared/lib/html-escape.js';
import { normalizeAuthorMarkupArtifacts } from '../../../../shared/lib/author-markup-normalize.js';
import { readQuizWizard } from '../quiz-wizard-block.js';
import {
    normalizeChallenge,
    emptyChallenge,
    parseQuizBlock,
    serializeQuizBlock,
    isQuizBlockOpen,
    isQuizBlockClose
} from '../../../learning/api/quiz-schema.js';
import {
    extractTocSectionMarkdown,
    replaceTocSectionMarkdown,
    findHeaderQuizTargetSectionIndex,
} from '../../../learning/api/lesson-section-slices.js';
import {
    isFencedBlockClose,
    matchFencedLessonOpen,
    parseKeyValueBody,
    titleFromFields,
    gameFromFields,
    mathFromFields,
    serializeSectionBlock,
    serializeSubsectionBlock,
    serializeImageBlock,
    serializeVideoBlock,
    serializeAudioBlock,
    serializeGameBlock,
    serializeMathBlock,
    isSectionFenceLine,
    isSubsectionFenceLine
} from '../../../learning/api/lesson-fenced-blocks.js';
import { safeHttpUrl, normalizeVideoEmbedUrl, validateLessonMediaUrl } from '../../../learning/api/parser-url.js';
import { tryParseGfmTable } from '../../../learning/api/lesson-table.js';
import { serializeTableBlockMarkdown } from './editor-table.js';

const QUIZ_TEXT_GUARD = '\u200B';

const INFO_FLAG_KEYS = new Set();
const INFO_TEXT_KEYS = new Set(['title', 'icon', 'description', 'discussion']);
const INFO_LIST_KEYS = new Set(['tags']);
const INFO_TRUTHY = new Set(['yes', 'true', 'on', '1']);

function renderInlineMarkdown(text) {
    const placeholders = [];
    const token = (i) => `__ARB_INLINE_${i}__`;
    let t = normalizeAuthorMarkupArtifacts(text);
    t = t.replace(/\{\{(lg|md|sm)\}\}([\s\S]+?)\{\{\/\1\}\}/g, (_, size, inner) => {
        const i = placeholders.push({ size, inner }) - 1;
        return token(i);
    });
    t = t.replace(/<br\s*\/?>/gi, () => {
        const i = placeholders.push('<br>') - 1;
        return token(i);
    });
    const safe = escHtml(t);
    let out = safe
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>');
    for (let i = 0; i < placeholders.length; i++) {
        const ph = placeholders[i];
        if (typeof ph === 'string') {
            out = out.replaceAll(escHtml(token(i)), ph);
        } else {
            const inner = renderInlineMarkdown(ph.inner);
            out = out.replaceAll(
                escHtml(token(i)),
                `<span data-arb-size="${escAttr(ph.size)}">${inner}</span>`
            );
        }
    }
    return out;
}

function lineToAuthoringGhostOutline(lines, i) {
    const trimmed = String(lines[i] || '').trim();
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
    if (isSectionFenceLine(trimmed)) return wrap('data-md-kind="section"', fencedTitleAhead(lines, i));
    if (isSubsectionFenceLine(trimmed)) return wrap('data-md-kind="subsection"', fencedTitleAhead(lines, i));
    return '';
}

function fencedTitleAhead(lines, openIndex) {
    const body = [];
    const tag = isSectionFenceLine(lines[openIndex]) ? 'section' : 'subsection';
    let j = openIndex + 1;
    while (j < lines.length && !isFencedBlockClose(lines[j], tag)) {
        body.push(lines[j]);
        j++;
    }
    return titleFromFields(parseKeyValueBody(body));
}

/** Inline markdown inside outline labels, reads label text via textContent after tag swap. */
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
    return htmlToPlainText(text);
}

function parseInfoBlockLine(line, meta) {
    const trimmed = line.trim();
    if (!trimmed) return;
    const colon = trimmed.indexOf(':');
    if (colon === -1) return;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const val = trimmed.slice(colon + 1).trim();
    if (INFO_LIST_KEYS.has(key)) {
        meta[key] = val.split(',').map((t) => t.trim()).filter(Boolean);
    } else if (INFO_FLAG_KEYS.has(key)) {
        meta[key] = INFO_TRUTHY.has(val.toLowerCase());
    } else if (INFO_TEXT_KEYS.has(key)) {
        meta[key] = val;
    }
}

function inlineChildrenToMarkdown(el) {
    let out = '';
    for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            out += child.textContent || '';
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName;
        if (
            child.classList?.contains('arborito-quiz-edit') ||
            child.classList?.contains('edit-block-wrapper') ||
            child.classList?.contains('arborito-game-edit') ||
            child.classList?.contains('arborito-media-edit') ||
            child.classList?.contains('arborito-callout-edit') ||
            child.classList?.contains('arborito-math-edit')
        ) {
            continue;
        }
        if (tag === 'BR') {
            out += '\n';
            continue;
        }
        if (tag === 'B' || tag === 'STRONG') {
            out += `**${inlineChildrenToMarkdown(child)}**`;
            continue;
        }
        if (tag === 'I' || tag === 'EM') {
            out += `*${inlineChildrenToMarkdown(child)}*`;
            continue;
        }
        if (tag === 'SPAN') {
            const size = child.getAttribute('data-arb-size');
            if (size === 'lg' || size === 'md' || size === 'sm') {
                out += `{{${size}}}${inlineChildrenToMarkdown(child)}{{/${size}}}`;
                continue;
            }
        }
        /* Nested lists are serialized by serializeListElement — skip here. */
        if (tag === 'UL' || tag === 'OL') continue;
        out += inlineChildrenToMarkdown(child);
    }
    return out;
}

/** Serialize UL/OL including nested lists inside LI (2-space indent). */
function serializeListElement(listEl, indent = 0) {
    if (!listEl) return '';
    const ordered = listEl.tagName === 'OL';
    const pad = '  '.repeat(indent);
    let md = '';
    let n = 1;
    for (const li of listEl.children) {
        if (!li || li.tagName !== 'LI') continue;
        const nestedLists = [];
        const clone = li.cloneNode(true);
        for (const child of [...clone.children]) {
            if (child.tagName === 'UL' || child.tagName === 'OL') {
                nestedLists.push(child);
                child.remove();
            }
        }
        const text = inlineHtmlToMarkdown(clone).replace(/\s+/g, ' ').trim();
        const marker = ordered ? `${n}.` : '-';
        md += `${pad}${marker} ${text}\n`;
        n += 1;
        for (const nested of nestedLists) {
            md += serializeListElement(nested, indent + 1);
        }
    }
    return md;
}

/**
 * Consume a contiguous markdown list starting at `start`, including indented nested items.
 * @returns {{ html: string, nextIndex: number }}
 */
function consumeMarkdownList(lines, start, alignAttr) {
    const itemRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
    const firstMatch = String(lines[start] || '').match(itemRe);
    if (!firstMatch) return { html: '', nextIndex: start };
    const firstIndent = firstMatch[1].length;
    const rootOrdered = /^\d/.test(firstMatch[2]);

    const roots = [];
    /** @type {Array<{ indent: number, item: { indent: number, ordered: boolean, text: string, children: object[] } }>} */
    const stack = [];
    let i = start;
    while (i < lines.length) {
        const raw = lines[i];
        if (!String(raw || '').trim()) break;
        const m = String(raw).match(itemRe);
        if (!m) break;
        const indent = m[1].length;
        if (indent < firstIndent) break;

        const item = {
            indent,
            ordered: /^\d/.test(m[2]),
            text: m[3],
            children: [],
        };
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
        if (!stack.length) {
            if (indent !== firstIndent) break;
            roots.push(item);
        } else {
            stack[stack.length - 1].item.children.push(item);
        }
        stack.push({ indent, item });
        i += 1;
    }

    const renderItems = (list, asOrdered) => {
        const tag = asOrdered ? 'ol' : 'ul';
        let html = `<${tag}${alignAttr}>`;
        for (const it of list) {
            html += `<li>${renderInlineMarkdown(it.text)}`;
            if (it.children.length) {
                html += renderItems(it.children, it.children[0].ordered);
            }
            html += '</li>';
        }
        html += `</${tag}>`;
        return html;
    };

    return {
        html: renderItems(roots, rootOrdered),
        nextIndex: i - 1,
    };
}

function inlineHtmlToMarkdown(el) {
    const text = inlineChildrenToMarkdown(el);
    return text.replace(/^@(\/?)quiz(\s*)$/gim, `${QUIZ_TEXT_GUARD}@$1quiz$2`);
}

function blockAlignPrefix(node) {
    const a = node.getAttribute('data-arb-align') || (node.style && node.style.textAlign) || '';
    return a === 'left' || a === 'center' || a === 'right' ? `@align: ${a}\n` : '';
}

export function parseArboritoFile(content) {
    const lines = String(content || '').split('\n');
    const meta = {
        title: '',
        icon: '📄',
        description: '',
        challenge: null,
        discussion: '',
        tags: []
    };

    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;

    if (i < lines.length && lines[i].trim() === '@info') {
        const inner = {};
        i++;
        while (i < lines.length && lines[i].trim() !== '@/info') {
            parseInfoBlockLine(lines[i], inner);
            i++;
        }
        if (i < lines.length) i++;
        if (inner.title) meta.title = inner.title;
        if (inner.icon) meta.icon = inner.icon;
        if (inner.description) meta.description = inner.description;
        if (inner.discussion) meta.discussion = inner.discussion;
        if (Array.isArray(inner.tags)) meta.tags = inner.tags;
    }

    while (i < lines.length && lines[i].trim() === '') i++;

    if (i < lines.length && isQuizBlockOpen(lines[i].trim())) {
        const quizBody = [];
        let j = i + 1;
        while (j < lines.length && !isQuizBlockClose(lines[j])) {
            quizBody.push(lines[j]);
            j++;
        }
        meta.challenge = parseQuizBlock(quizBody);
        i = j + 1;
    }

    while (i < lines.length && lines[i].trim() === '') i++;

    let bodyText = lines.slice(i).join('\n').trimEnd();
    if (meta.challenge) {
        const bodyHasQuiz = /^@quiz\s*$/im.test(bodyText);
        if (!bodyHasQuiz) {
            const quizMd = serializeQuizBlock(meta.challenge);
            const targetIdx = findHeaderQuizTargetSectionIndex(bodyText);
            const sectionMd = extractTocSectionMarkdown(bodyText, targetIdx);
            const nextSection = `${sectionMd.replace(/\s+$/, '')}\n\n${quizMd}\n`;
            bodyText = replaceTocSectionMarkdown(bodyText, targetIdx, nextSection);
        }
        meta.challenge = null;
    }
    return { meta, body: bodyText };
}

export function markdownToVisualHTML(md, blocks, opts = {}) {
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
            pendingAlign = v === 'center' || v === 'right' || v === 'left' ? v : null;
            continue;
        }

        if (ghostOutline) {
            const ghost = lineToAuthoringGhostOutline(lines, i);
            if (ghost) {
                html += ghost;
                lastWasGhostOutline = true;
                let j = i + 1;
                const tag = isSectionFenceLine(line)
                    ? 'section'
                    : isSubsectionFenceLine(line)
                      ? 'subsection'
                      : null;
                if (tag) {
                    while (j < lines.length && !isFencedBlockClose(lines[j], tag)) j++;
                    i = j;
                }
                continue;
            }
        }
        lastWasGhostOutline = false;

        const alignAttr = pendingAlign
            ? ` style="text-align:${escAttr(pendingAlign)}" data-arb-align="${escAttr(pendingAlign)}"`
            : '';
        pendingAlign = null;

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

        if (line.startsWith('> ')) {
            html += blocks.callout(renderInlineMarkdown(line.substring(2)), { html: true });
            continue;
        }

        if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
            const { html: listHtml, nextIndex } = consumeMarkdownList(lines, i, alignAttr);
            if (listHtml) {
                html += listHtml;
                i = nextIndex;
                continue;
            }
        }

        const fencedTag = matchFencedLessonOpen(line);
        if (fencedTag) {
            const body = [];
            let j = i + 1;
            while (j < lines.length && !isFencedBlockClose(lines[j], fencedTag)) {
                body.push(lines[j]);
                j++;
            }
            const fields = parseKeyValueBody(body);
            if (fencedTag === 'section') html += blocks.section(titleFromFields(fields));
            else if (fencedTag === 'subsection') html += blocks.subsection(titleFromFields(fields));
            else if (fencedTag === 'image') html += blocks.media('image', validateLessonMediaUrl('image', fields.url || ''));
            else if (fencedTag === 'video') {
                const url = validateLessonMediaUrl('video', fields.url || '');
                html += blocks.media('video', url);
            } else if (fencedTag === 'audio') {
                html += blocks.media('audio', validateLessonMediaUrl('audio', fields.url || ''));
            } else if (fencedTag === 'game') {
                const g = gameFromFields(fields);
                html += blocks.game(g.url, g.label, g.optional, g.topics);
            } else if (fencedTag === 'math') {
                const m = mathFromFields(fields);
                html += blocks.math(m.latex, m.display);
            }
            i = j;
            continue;
        }

        if (isQuizBlockOpen(line)) {
            const body = [];
            let j = i + 1;
            while (j < lines.length && !isQuizBlockClose(lines[j].trim())) {
                body.push(lines[j]);
                j++;
            }
            html += blocks.quiz(parseQuizBlock(body));
            i = j;
            continue;
        }

        if (line.startsWith('```')) {
            const open = lines[i].trim();
            const lang = open.length > 3 ? open.slice(3).trim() || 'bash' : 'bash';
            const bodyLines = [];
            let j = i + 1;
            while (j < lines.length && !lines[j].trim().startsWith('```')) {
                bodyLines.push(lines[j]);
                j++;
            }
            html += blocks.code(lang, bodyLines.join('\n'));
            i = j;
            continue;
        }

        const gfmTable = tryParseGfmTable(lines, i);
        if (gfmTable && typeof blocks.table === 'function') {
            html += blocks.table({
                headers: gfmTable.headers.map((c) => renderInlineMarkdown(c)),
                rows: gfmTable.rows.map((r) => r.map((c) => renderInlineMarkdown(c))),
                htmlCells: true,
            });
            i = gfmTable.nextIndex;
            continue;
        }

        html += `<p${alignAttr}>${renderInlineMarkdown(line)}</p>`;
    }
    return html;
}

function isEditorStructuralBlock(el) {
    if (!(el instanceof HTMLElement)) return false;
    return (
        el.classList.contains('edit-block-wrapper') ||
        el.classList.contains('arborito-quiz-edit') ||
        el.classList.contains('arborito-game-edit') ||
        el.classList.contains('arborito-media-edit') ||
        el.classList.contains('arborito-callout-edit') ||
        el.classList.contains('arborito-math-edit') ||
        el.classList.contains('arborito-table-edit') ||
        el.classList.contains('arborito-section-edit') ||
        el.classList.contains('arborito-subsection-edit') ||
        el.classList.contains('arborito-authoring-outline') ||
        /^H[1-6]$/.test(el.tagName) ||
        el.tagName === 'P' ||
        el.tagName === 'PRE' ||
        el.tagName === 'UL' ||
        el.tagName === 'OL' ||
        el.tagName === 'TABLE' ||
        el.tagName === 'BLOCKQUOTE'
    );
}

/** Unwrap contentEditable DIV wrappers; pull nested blocks out of paragraphs. */
function segmentInlineContainer(el) {
    const segments = [];
    let inlineNodes = [];
    let extractedNestedBlock = false;

    const hasMeaningfulInline = (nodes) =>
        nodes.some((n) => {
            if (n.nodeType === Node.TEXT_NODE) return (n.textContent || '').trim().length > 0;
            if (n.nodeType === Node.ELEMENT_NODE) {
                const tag = n.tagName;
                if (tag === 'BR') return true;
                if (tag === 'SPAN' || tag === 'B' || tag === 'STRONG' || tag === 'I' || tag === 'EM') {
                    return (n.textContent || '').trim().length > 0;
                }
            }
            return false;
        });

    const flushInline = () => {
        if (!hasMeaningfulInline(inlineNodes)) {
            inlineNodes = [];
            return;
        }
        const clone = el.cloneNode(false);
        for (const n of inlineNodes) clone.appendChild(n.cloneNode(true));
        segments.push(clone);
        inlineNodes = [];
    };

    const walk = (node) => {
        if (node === el) {
            for (const child of el.childNodes) walk(child);
            return;
        }
        if (node.nodeType === Node.ELEMENT_NODE && isEditorStructuralBlock(node)) {
            extractedNestedBlock = true;
            flushInline();
            segments.push(node);
            return;
        }
        if (node.nodeType === Node.TEXT_NODE) {
            inlineNodes.push(node);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        /* contentEditable often wraps lines in DIV — unwrap those only. */
        if (node.tagName === 'DIV') {
            for (const child of node.childNodes) walk(child);
            return;
        }
        /* Keep inline markup intact ({{lg}} / bold / italic). Never flatten into text. */
        inlineNodes.push(node);
    };

    for (const child of el.childNodes) walk(child);
    flushInline();
    return { segments, extractedNestedBlock };
}

function flattenEditorNodes(root) {
    const out = [];
    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.trim()) out.push(node);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node;
        if (isEditorStructuralBlock(el)) {
            if (el.tagName === 'P' || el.tagName === 'BLOCKQUOTE' || /^H[1-6]$/.test(el.tagName)) {
                const { segments, extractedNestedBlock } = segmentInlineContainer(el);
                /* Only replace the host when a nested quiz/media/etc. was hoisted out.
                 * Pure inline (`{{lg}}`, bold) must keep the original node — a single
                 * clone used to strip size spans on every section-switch flush. */
                if (extractedNestedBlock || segments.length > 1) {
                    for (const seg of segments) {
                        if (isEditorStructuralBlock(seg) && seg !== el) out.push(seg);
                        else if (seg instanceof HTMLElement) out.push(seg);
                    }
                    return;
                }
            }
            out.push(el);
            return;
        }
        if (el.tagName === 'DIV') {
            for (const child of el.childNodes) walk(child);
            return;
        }
        for (const child of el.childNodes) walk(child);
    };
    for (const child of root.childNodes) walk(child);
    return out;
}

function readMediaBlockUrl(node) {
    if (!(node instanceof HTMLElement)) return '';
    const fromInput = String(node.querySelector('.media-url-input')?.value || '').trim();
    const raw = fromInput || String(node.dataset.mediaUrl || '').trim();
    return raw;
}

export function visualHTMLToMarkdown(rootElement) {
    let md = '';

    for (const node of flattenEditorNodes(rootElement)) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.trim()) md += `${node.textContent.trim()}\n\n`;
            continue;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.classList && node.classList.contains('arborito-authoring-outline')) {
            const kind = node.getAttribute('data-md-kind');
            const lev = parseInt(node.getAttribute('data-md-level') || '0', 10);
            const lbl = node.querySelector('.arborito-authoring-outline__label');
            const title = outlineLabelToPlainMarkdown(lbl);
            if (kind === 'section') md += `${serializeSectionBlock(title)}\n\n`;
            else if (kind === 'subsection') md += `${serializeSubsectionBlock(title)}\n\n`;
            else if (lev >= 1 && lev <= 6) md += `${'#'.repeat(lev)} ${title}\n\n`;
            continue;
        }

        if (/^H[1-6]$/.test(node.tagName)) {
            const level = parseInt(node.tagName.slice(1), 10);
            md += blockAlignPrefix(node);
            md += `${'#'.repeat(level)} ${inlineHtmlToMarkdown(node)}\n\n`;
            continue;
        }

        if (
            node.tagName === 'BLOCKQUOTE' &&
            (!node.classList || !node.classList.contains('arborito-callout-edit'))
        ) {
            md += `> ${inlineHtmlToMarkdown(node)}\n\n`;
            continue;
        }

        if (node.tagName === 'P') {
            md += blockAlignPrefix(node);
            const text = inlineHtmlToMarkdown(node);
            if (text.trim()) md += `${text}\n\n`;
            continue;
        }

        if (
            node.tagName === 'PRE' &&
            (node.getAttribute('data-arborito-code') === '1' ||
                node.classList?.contains('arborito-code-edit'))
        ) {
            const code = node.querySelector('code');
            const raw = String((code ? code.textContent : node.textContent) || '').trimEnd();
            if (!raw) continue;
            if (raw.startsWith('```')) {
                md += `${raw}\n\n`;
            } else {
                const lang = node.getAttribute('data-code-lang') || 'bash';
                md += `\`\`\`${lang}\n${raw}\n\`\`\`\n\n`;
            }
            continue;
        }

        if (node.tagName === 'UL' || node.tagName === 'OL') {
            md += blockAlignPrefix(node);
            md += `${serializeListElement(node)}\n`;
            continue;
        }

        if (node.classList && node.classList.contains('arborito-callout-edit')) {
            md += `> ${inlineHtmlToMarkdown(node).trim()}\n\n`;
            continue;
        }

        if (node.classList && node.classList.contains('arborito-section-edit')) {
            const val = node.querySelector('input')?.value || '';
            md += `${serializeSectionBlock(val)}\n\n`;
            continue;
        }

        if (node.classList && node.classList.contains('arborito-subsection-edit')) {
            const val = node.querySelector('input')?.value || '';
            md += `${serializeSubsectionBlock(val)}\n\n`;
            continue;
        }

        if (node.classList && node.classList.contains('arborito-media-edit')) {
            const type = node.dataset.type;
            const rawUrl = readMediaBlockUrl(node);
            /* Keep author URL even when invalid — dropping the block lost in-progress edits. */
            const val = validateLessonMediaUrl(type, rawUrl) || String(rawUrl || '').trim();
            /* Always persist the fence (quiz pattern) so empty placeholders survive flush/save. */
            if (type === 'image') md += `${serializeImageBlock(val)}\n\n`;
            else if (type === 'video') md += `${serializeVideoBlock(val)}\n\n`;
            else if (type === 'audio') md += `${serializeAudioBlock(val)}\n\n`;
            continue;
        }

        if (node.classList && node.classList.contains('arborito-quiz-edit')) {
            /* Always persist the block — dropping incomplete quizzes hid in-progress edits. */
            const ch = readQuizWizard(node);
            md += `${serializeQuizBlock(ch)}\n\n`;
            continue;
        }

        if (node.classList && node.classList.contains('arborito-game-edit')) {
            const url = node.querySelector('.game-url-input')?.value || '';
            const label = node.querySelector('.game-label-input')?.value || '';
            const opt = node.getAttribute('data-optional') !== 'false';
            const topicsRaw =
                node.querySelector('.game-topics-input')?.value || node.dataset.topics || '';
            const topics = String(topicsRaw)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const trimmedUrl = url.trim();
            const safe = trimmedUrl ? safeHttpUrl(trimmedUrl) || trimmedUrl : '';
            md += `${serializeGameBlock({ url: safe, label: label.trim(), optional: opt, topics })}\n\n`;
            continue;
        }

        if (node.classList && node.classList.contains('arborito-math-edit')) {
            const latex = node.querySelector('.math-latex-input')?.value || '';
            const display = node.querySelector('.math-display-select')?.value || 'block';
            const trimmedLatex = String(latex || '').trim();
            md += `${serializeMathBlock({ latex: trimmedLatex, display })}\n\n`;
            continue;
        }

        if (node.classList && node.classList.contains('arborito-table-edit')) {
            md += `${serializeTableBlockMarkdown(node, inlineHtmlToMarkdown)}\n\n`;
            continue;
        }
    }
    return md.trim();
}

export function reconstructArboritoFile(meta, bodyMD) {
    const fields = [];
    /* Always persist title when set (safe filenames used to be omitted). */
    if (meta.title != null && String(meta.title).trim() !== '') {
        fields.push(`title: ${String(meta.title).trim()}`);
    }
    if (meta.icon && meta.icon !== '📄') fields.push(`icon: ${meta.icon}`);
    if (meta.description) fields.push(`description: ${meta.description}`);
    if (meta.discussion) fields.push(`discussion: ${meta.discussion}`);
    if (meta.tags && meta.tags.length) fields.push(`tags: ${meta.tags.join(', ')}`);

    let out = '';
    if (fields.length) out += `@info\n${fields.join('\n')}\n@/info\n`;

    const trimmedBody = String(bodyMD || '').replace(/^\s+|\s+$/g, '');
    if (trimmedBody) {
        if (out) out += '\n';
        out += `${trimmedBody}\n`;
    }
    return out;
}

/** Populate a contentEditable host from an HTML string without assigning host.innerHTML. */
export function replaceEditorHtml(host, html) {
    if (!host) return;
    host.replaceChildren(...parseEditorHtmlFragment(html).childNodes);
}

export { emptyChallenge, normalizeChallenge };
