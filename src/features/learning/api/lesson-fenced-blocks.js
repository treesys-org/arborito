/**
 * Fenced lesson blocks, same pattern as @info and @quiz:
 *
 *   @section
 *   index: 1.1
 *   title: Conceptos
 *   @/section
 *
 * `index` is the temario path (same role as `#1.1}`). Nest depth = path segments.
 * Legacy title-only `@section` / `@subsection` is still read; prepare assigns index.
 */

export const FENCED_LESSON_TAGS = ['section', 'subsection', 'image', 'video', 'audio', 'game', 'math'];

const TRUTHY = new Set(['yes', 'true', 'on', '1']);

export function isFencedBlockOpen(line, tag) {
    return new RegExp(`^@${tag}\\s*$`, 'i').test(String(line || '').trim());
}

export function isFencedBlockClose(line, tag) {
    return new RegExp(`^@/${tag}\\s*$`, 'i').test(String(line || '').trim());
}

/** @returns {string|null} */
export function matchFencedLessonOpen(line) {
    const t = String(line || '').trim();
    for (const tag of FENCED_LESSON_TAGS) {
        if (isFencedBlockOpen(t, tag)) return tag;
    }
    return null;
}

/** @param {string[]} lines */
export function parseKeyValueBody(lines) {
    const fields = {};
    for (const line of lines) {
        const trimmed = String(line || '').trim();
        if (!trimmed) continue;
        const colon = trimmed.indexOf(':');
        if (colon < 0) continue;
        const key = trimmed.slice(0, colon).trim().toLowerCase();
        fields[key] = trimmed.slice(colon + 1).trim();
    }
    return fields;
}

/** Prefer stable field order for syllabus fences: index then title. */
export function serializeFencedBlock(tag, fields) {
    const lines = [`@${tag}`];
    const src = fields || {};
    const ordered = [];
    if (src.index != null && String(src.index).trim() !== '') {
        ordered.push(['index', String(src.index).trim()]);
    }
    if (src.title != null && String(src.title).trim() !== '') {
        ordered.push(['title', String(src.title).trim()]);
    }
    for (const [key, value] of Object.entries(src)) {
        if (key === 'index' || key === 'title') continue;
        if (value == null || String(value).trim() === '') continue;
        ordered.push([key, String(value).trim()]);
    }
    for (const [key, value] of ordered) {
        lines.push(`${key}: ${value}`);
    }
    lines.push(`@/${tag}`);
    return lines.join('\n');
}

/**
 * Canonical syllabus fence. Always `@section` (nesting lives in `index`).
 * @param {string|{ index?: string, title?: string }} titleOrOpts
 * @param {string} [indexMaybe]
 */
export function serializeSectionBlock(titleOrOpts, indexMaybe) {
    if (titleOrOpts && typeof titleOrOpts === 'object') {
        return serializeFencedBlock('section', {
            index: titleOrOpts.index,
            title: titleOrOpts.title,
        });
    }
    return serializeFencedBlock('section', {
        index: indexMaybe,
        title: String(titleOrOpts || '').trim(),
    });
}

/** Nesting is path-based; emit `@section` with index (same as serializeSectionBlock). */
export function serializeSubsectionBlock(titleOrOpts, indexMaybe) {
    return serializeSectionBlock(titleOrOpts, indexMaybe);
}

export function serializeImageBlock(url) {
    return serializeFencedBlock('image', { url: String(url || '').trim() });
}

export function serializeVideoBlock(url) {
    return serializeFencedBlock('video', { url: String(url || '').trim() });
}

export function serializeAudioBlock(url) {
    return serializeFencedBlock('audio', { url: String(url || '').trim() });
}

/** @param {{ url?: string, label?: string, optional?: boolean, topics?: string[] }} opts */
export function serializeGameBlock(opts = {}) {
    const fields = { url: String(opts.url || '').trim() };
    if (opts.label) fields.label = String(opts.label).trim();
    if (opts.optional !== false) fields.optional = 'yes';
    if (Array.isArray(opts.topics) && opts.topics.length) {
        fields.topics = opts.topics.map((t) => String(t).trim()).filter(Boolean).join(', ');
    }
    return serializeFencedBlock('game', fields);
}

export function titleFromFields(fields) {
    return String(fields?.title || '').trim();
}

/** Temario path from fence fields (`index: 1.1`). */
export function indexFromFields(fields) {
    return String(fields?.index || '').trim();
}

/** @param {{ latex?: string, display?: string }} opts */
export function serializeMathBlock(opts = {}) {
    const fields = { latex: String(opts.latex || '').trim() };
    const disp = String(opts.display || 'block').trim().toLowerCase();
    if (disp === 'inline') fields.display = 'inline';
    return serializeFencedBlock('math', fields);
}

/** @param {{ latex?: string, display?: string }} fields */
export function mathFromFields(fields) {
    const disp = String(fields?.display || 'block').trim().toLowerCase();
    return {
        latex: String(fields?.latex || '').trim(),
        display: disp === 'inline' ? 'inline' : 'block',
    };
}

export function gameFromFields(fields) {
    const topics = String(fields?.topics || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const optRaw = String(fields?.optional || '').toLowerCase();
    const optional = optRaw === '' ? true : TRUTHY.has(optRaw);
    return {
        url: String(fields?.url || '').trim(),
        label: String(fields?.label || '').trim(),
        optional,
        topics
    };
}

/**
 * @param {string[]} lines
 * @param {number} openLine
 * @returns {{ tag: string, fields: Record<string, string>, endLine: number }|null}
 */
export function readFencedBlockAt(lines, openLine) {
    const tag = matchFencedLessonOpen(lines[openLine]);
    if (!tag) return null;
    const body = [];
    let i = openLine + 1;
    while (i < lines.length && !isFencedBlockClose(lines[i], tag)) {
        body.push(lines[i]);
        i++;
    }
    return { tag, fields: parseKeyValueBody(body), endLine: i };
}

/** @param {string[]} lines @param {number} openLine @param {string} tag @param {Record<string, string>} fields */
export function replaceFencedBlockAt(lines, openLine, tag, fields) {
    const block = serializeFencedBlock(tag, fields).split('\n');
    const read = readFencedBlockAt(lines, openLine);
    const closeLine = read ? read.endLine : openLine;
    lines.splice(openLine, closeLine - openLine + 1, ...block);
}

export function fencedTitleAt(lines, openLine) {
    const read = readFencedBlockAt(lines, openLine);
    if (!read) return '';
    return titleFromFields(read.fields);
}

export function fencedIndexAt(lines, openLine) {
    const read = readFencedBlockAt(lines, openLine);
    if (!read) return '';
    return indexFromFields(read.fields);
}

export function isSectionFenceLine(line) {
    return isFencedBlockOpen(line, 'section');
}

export function isSubsectionFenceLine(line) {
    return isFencedBlockOpen(line, 'subsection');
}

export function isTocFenceLine(trimmed) {
    return isSectionFenceLine(trimmed) || isSubsectionFenceLine(trimmed);
}
