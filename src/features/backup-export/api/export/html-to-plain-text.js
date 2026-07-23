import { normalizeAuthorMarkupArtifacts } from '../../../../shared/lib/author-markup-normalize.js';

function decodeEntities(text) {
    if (typeof document === 'undefined') {
        return String(text || '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'");
    }
    const doc = new DOMParser().parseFromString(String(text || ''), 'text/html');
    return doc.documentElement.textContent || '';
}

function formatMarkdownTableLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed.includes('|')) return null;
    const cells = trimmed
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
    if (cells.length < 2) return null;
    if (cells.every((cell) => /^[\s\-:]+$/.test(cell))) return null;
    return cells.join(' · ');
}

function normalizePlainLines(text) {
    const lines = String(text || '').split('\n');
    const out = [];
    for (const line of lines) {
        const tableLine = formatMarkdownTableLine(line);
        if (tableLine) {
            out.push(tableLine);
            continue;
        }
        const trimmed = line.replace(/[ \t]+/g, ' ').trimEnd();
        if (!trimmed && out.length && out[out.length - 1] === '') continue;
        out.push(trimmed);
    }
    while (out.length && out[0] === '') out.shift();
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n');
}

/** Convert lesson/PDF HTML fragments to readable plain text. */
export function htmlToPlainText(html) {
    let t = normalizeAuthorMarkupArtifacts(String(html ?? ''));
    t = t.replace(/<br\s*\/?>/gi, '\n');
    t = t.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
    if (typeof document !== 'undefined') {
        const doc = new DOMParser().parseFromString(t, 'text/html');
        t = doc.body.textContent || '';
    } else {
        t = t.replace(/<[^>]+>/g, ' ');
    }
    t = decodeEntities(t);
    return normalizePlainLines(t);
}
