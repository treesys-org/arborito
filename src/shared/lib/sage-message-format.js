/**
 * Safe markdown-ish formatting for Sage chat bubbles (Arborito / CMD-style).
 */
import { escHtml, escAttr } from './html-escape.js';

/** Remove emoji pictographs from chat text (avoids tofu / missing glyph boxes). */
function stripEmojisForChat(text) {
    return String(text || '')
        .replace(/\p{Extended_Pictographic}(\uFE0F|\uFE0E)?/gu, '')
        .replace(/\u200D/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function formatInline(text) {
    let s = escHtml(text);
    s = s.replace(/`([^`\n]+)`/g, '<code class="sage-md-code px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-900/60 text-[0.92em] font-mono">$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
    s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em class="italic">$1</em>');
    s = s.replace(/__(.+?)__/g, '<strong class="font-bold">$1</strong>');
    s = s.replace(/_([^_\n]+)_/g, '<em class="italic">$1</em>');
    s = s.replace(
        /\[(.*?)\]\((.*?)\)/g,
        (_m, label, url) =>
            `<a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer" ` +
            `class="text-blue-600 dark:text-blue-400 hover:underline font-semibold">${label}</a>`
    );
    return s;
}

function formatBlock(text) {
    const lines = text.split('\n');
    const out = [];
    let listItems = [];

    const flushList = () => {
        if (!listItems.length) return;
        out.push(`<ul class="sage-md-list my-1 pl-4 list-disc space-y-0.5">${listItems.join('')}</ul>`);
        listItems = [];
    };

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const bullet = line.match(/^[-*•]\s+(.+)$/);
        const numbered = line.match(/^\d+[.)]\s+(.+)$/);
        const heading = line.match(/^#{1,3}\s+(.+)$/);
        if (bullet) {
            listItems.push(`<li>${formatInline(bullet[1])}</li>`);
            continue;
        }
        if (numbered) {
            listItems.push(`<li>${formatInline(numbered[1])}</li>`);
            continue;
        }
        flushList();
        if (heading) {
            out.push(`<p class="sage-md-heading font-bold mt-2 mb-1">${formatInline(heading[1])}</p>`);
        } else if (line === '') {
            out.push('<br>');
        } else {
            out.push(`<span class="sage-md-line">${formatInline(line)}</span><br>`);
        }
    }
    flushList();
    let html = out.join('');
    if (html.endsWith('<br>')) html = html.slice(0, -4);
    return html;
}

export function formatSageMessage(text) {
    if (text == null || text === '') return '';
    const src = stripEmojisForChat(String(text));
    const parts = src.split(/(```[\s\S]*?```)/g);
    const chunks = [];
    for (const part of parts) {
        if (part.startsWith('```') && part.endsWith('```')) {
            const inner = part.slice(3, -3).replace(/^\w*\n?/, '');
            chunks.push(
                `<pre class="sage-md-pre my-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-900/70 ` +
                `text-xs font-mono whitespace-pre-wrap overflow-x-auto border border-slate-200 dark:border-slate-700">` +
                `${escHtml(inner.trim())}</pre>`
            );
        } else {
            chunks.push(formatBlock(part));
        }
    }
    return chunks.join('');
}
