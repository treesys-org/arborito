import { escAttr } from '../../../../shared/lib/html-escape.js';
import { normalizeAuthorMarkupArtifacts } from '../../../../shared/lib/author-markup-normalize.js';
import { injectEmojiImagesInText } from '../../../../shared/lib/emoji-display.js';

const escHtml = escAttr;

function escInlineHtml(s) {
    const raw = normalizeAuthorMarkupArtifacts(String(s != null ? s : ''));
    const placeholders = [];
    const token = (i) => `__ARB_TOK_${i}__`;

    let t = raw.replace(/<br\s*\/?>/gi, () => {
        const i = placeholders.push('<br>') - 1;
        return token(i);
    });

    t = t.replace(/<\/?(strong|em)>/gi, (m) => {
        const i = placeholders.push(m.toLowerCase()) - 1;
        return token(i);
    });

    t = t.replace(
        /<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">([\s\S]*?)<\/code>/gi,
        (_m, inner) => {
            const safeInner = escHtml(inner);
            const i = placeholders.push(
                `<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">${safeInner}</code>`
            ) - 1;
            return token(i);
        }
    );

    t = escHtml(t);

    for (let i = 0; i < placeholders.length; i++) {
        t = t.replaceAll(escHtml(token(i)), placeholders[i]);
    }
    return injectEmojiImagesInText(t);
}

function printAlignAttr(b) {
    if (b?.align === 'center') return ' style="text-align:center"';
    if (b?.align === 'right') return ' style="text-align:right"';
    return '';
}

const PRINT_HEADING_TYPES = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'subsection']);
const PRINT_MERGE_AFTER = new Set(['p', 'list', 'blockquote']);

function renderPrintOneBlock(b, skipped) {
    const al = printAlignAttr(b);
    switch (b.type) {
        case 'h1':
        case 'section':
            return `<h2 class="print-section"${al}>${escInlineHtml(b.text)}</h2>`;
        case 'h2':
        case 'subsection':
            return `<h3 class="print-subsection"${al}>${escInlineHtml(b.text)}</h3>`;
        case 'h3':
            return `<h3${al}>${escInlineHtml(b.text)}</h3>`;
        case 'h4':
            return `<h4${al}>${escInlineHtml(b.text)}</h4>`;
        case 'h5':
            return `<h5${al}>${escInlineHtml(b.text)}</h5>`;
        case 'h6':
            return `<h6${al}>${escInlineHtml(b.text)}</h6>`;
        case 'p':
            return `<p${al}>${escInlineHtml(b.text)}</p>`;
        case 'blockquote':
            return `<blockquote${al}>${escInlineHtml(b.text)}</blockquote>`;
        case 'code':
            return `<pre><code>${escHtml(b.text)}</code></pre>`;
        case 'image':
            return b.src
                ? `<figure><img src="${escAttr(b.src)}" alt="">${b.caption ? `<figcaption>${escInlineHtml(b.caption)}</figcaption>` : ''}</figure>`
                : '';
        case 'list':
            return `<ul>${(b.items || []).map((i) => `<li>${escInlineHtml(i)}</li>`).join('')}</ul>`;
        case 'quiz':
        case 'game':
        case 'video':
        case 'audio':
            return `<p class="print-skipped"><em>${skipped}</em></p>`;
        default:
            return '';
    }
}

/** Semantic HTML for PDF/print, mirrors student-view blocks without app chrome classes. */
export function renderPrintBlocks(blocks, ui = {}) {
    const skipped = escHtml(ui.pdfSkippedBlock || '[Interactive content omitted from print]');
    const parts = [];
    const list = blocks || [];
    for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const html = renderPrintOneBlock(b, skipped);
        if (!html) continue;
        if (PRINT_HEADING_TYPES.has(b.type)) {
            const group = [html];
            let j = i + 1;
            while (j < list.length) {
                const nb = list[j];
                if (PRINT_HEADING_TYPES.has(nb.type)) break;
                if (!PRINT_MERGE_AFTER.has(nb.type)) break;
                const nh = renderPrintOneBlock(nb, skipped);
                if (!nh) {
                    j++;
                    continue;
                }
                group.push(nh);
                j++;
                break;
            }
            if (group.length > 1) {
                parts.push(`<div class="print-flow">${group.join('')}</div>`);
                i = j - 1;
                continue;
            }
        }
        parts.push(html);
    }
    return parts.join('\n');
}
