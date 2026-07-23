/**
 * Temario (syllabus / TOC outline) — separate from lesson prose.
 *
 * Canonical on-disk row:
 *
 *   @section
 *   index: 1.1
 *   title: Conceptos
 *   @/section
 *
 * Nest depth = segments of `index` (`1` → root, `1.1` → child). Construct
 * moves/renumber read and write `index:` on those fences. Old `#path} Title`
 * lines are accepted on ingest and converted. Lesson writing (prose, `{{lg}}`,
 * quizzes) lives under each fence — see `lesson-section-slices.js`.
 */

import { isTocFenceLine } from './lesson-fenced-blocks.js';

/** Reserved id for the no-heading whole-body range. Never a slugify target. */
export const SYNTHETIC_INTRO_ID = '__arborito_synthetic_intro__';

/**
 * Internal construct path line (prepare math only): `#1.1} Conceptos`
 */
export const SYLLABUS_PATH_LINE_RE = /^#(\d+(?:\.\d+)*)\}\s+(.*)$/;

export function isSyntheticIntroItem(item) {
    return !!(item && (item.synthetic || item.id === SYNTHETIC_INTRO_ID));
}

export function parseSyllabusPathLine(line) {
    const m = String(line != null ? line : '').trim().match(SYLLABUS_PATH_LINE_RE);
    if (!m) return null;
    return {
        path: String(m[1] || '').trim(),
        title: String(m[2] || '').replace(/\s+$/u, ''),
    };
}

export function formatSyllabusPathLine(pathId, titleText) {
    const id = String(pathId != null ? pathId : '').trim();
    const title = String(titleText != null ? titleText : '').trim();
    if (!id) return title ? `# ${title}` : '#';
    return `#${id}} ${title}`.trimEnd();
}

export function outlinePathIdFromHeadingLine(line) {
    const syl = parseSyllabusPathLine(line);
    if (syl && isOutlinePathId(syl.path)) return syl.path;
    return null;
}

/** Human syllabus coordinates: `1`, `1.2`, `1.2.3`. */
export function isOutlinePathId(id) {
    return /^\d+(?:\.\d+)*$/.test(String(id != null ? id : '').trim());
}

/** True when the body already has temario paths (`#1}` or `index: 1`). */
export function bodyHasOutlinePathIds(body) {
    const s = String(body != null ? body : '');
    if (/(?:^|\n)#\d+(?:\.\d+)*\}/.test(s)) return true;
    if (/(?:^|\n)index:\s*\d+(?:\.\d+)*\s*$/im.test(s)) return true;
    return false;
}

export function isAtxHeadingLine(trimmed) {
    if (!trimmed) return false;
    if (parseSyllabusPathLine(trimmed)) return true;
    return (
        trimmed.startsWith('# ') ||
        trimmed.startsWith('## ') ||
        trimmed.startsWith('### ') ||
        trimmed.startsWith('#### ') ||
        trimmed.startsWith('##### ') ||
        trimmed.startsWith('###### ')
    );
}

/**
 * True when the line is a temario (syllabus) row — not in-lesson content.
 * Fences (`@section` / `@subsection`) and ingest `#path}` lines count.
 * Docs without path markers yet: every ATX heading counts as TOC until prepare.
 */
export function isOutlineHeadingLine(trimmed, bodyText = '') {
    if (!trimmed) return false;
    if (/^@\/?quiz\b/i.test(trimmed)) return false;
    if (isTocFenceLine(trimmed)) return true;
    if (parseSyllabusPathLine(trimmed)) return true;
    if (!isAtxHeadingLine(trimmed)) return false;
    const path = outlinePathIdFromHeadingLine(trimmed);
    if (path && isOutlinePathId(path)) return true;
    if (!bodyHasOutlinePathIds(bodyText)) return true;
    return false;
}

/**
 * ATX / outline-fence lines that must not sit in construct WYSIWYG prose
 * (they would invent TOC rows). Distinct from `isOutlineHeadingLine`: that
 * asks “is this temario?”; this asks “would this invent temario if saved?”
 */
export function isForbiddenConstructProseHeadingLine(trimmed) {
    if (!trimmed) return false;
    if (/^@\/?quiz\b/i.test(trimmed)) return false;
    return isAtxHeadingLine(trimmed) || isTocFenceLine(trimmed);
}

/** Nest level for a parsed heading block (UI indent = level − 2 for construct). */
export function syllabusOutlineLevelForBlock(b) {
    let level = 2;
    if (b.type === 'h1') level = 1;
    else if (b.type === 'h2' || b.type === 'section') level = 2;
    else if (b.type === 'h3' || b.type === 'subsection') level = 3;
    else if (b.type === 'h4') level = 4;
    else if (b.type === 'h5') level = 5;
    else if (b.type === 'h6') level = 6;
    if (isOutlinePathId(b.id)) {
        level = Math.min(6, String(b.id).split('.').length + 1);
    }
    return level;
}

/**
 * Syllabus TOC items from parsed blocks. Pathless content headings are
 * excluded once the body has temario paths (`#path}` or `index:`).
 */
export function collectSyllabusTocItems(blocks, { bodyHasPaths = false } = {}) {
    const items = [];
    for (const b of blocks || []) {
        const isHeading =
            b.type === 'h1' ||
            b.type === 'h2' ||
            b.type === 'h3' ||
            b.type === 'h4' ||
            b.type === 'h5' ||
            b.type === 'h6' ||
            b.type === 'section' ||
            b.type === 'subsection';
        if (!isHeading) continue;
        if (bodyHasPaths && !isOutlinePathId(b.id)) {
            if (b.type !== 'section' && b.type !== 'subsection') {
                /* Content title inside a section — not a syllabus row. */
                continue;
            }
            /* Legacy title-only @section — still TOC until prepare assigns index. */
        }
        items.push({
            text: b.text,
            level: syllabusOutlineLevelForBlock(b),
            id: b.id,
            isQuiz: false,
        });
    }
    return items;
}
