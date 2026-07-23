/**
 * Which TOC section to show when a lesson opens.
 *
 * Priority:
 * 1. `lessonOpenHint`, manual bookmark from search (bookmarkIndex) or explicit recent pick.
 * 2. `recent`, last reading position (after close / section change), when content hash still matches.
 * 3. First item (index 0), even when that section is title-only with no body prose.
 */

function clampSectionIndex(index, tocLength) {
    const n = Number(index);
    if (!Number.isFinite(n)) return 0;
    const maxIdx = Math.max(0, (Number(tocLength) || 1) - 1);
    return Math.max(0, Math.min(maxIdx, Math.trunc(n)));
}

function normalizeVisited(visited, maxIdx) {
    const out = new Set();
    if (!Array.isArray(visited)) return out;
    for (const v of visited) {
        const i = Number(v);
        if (Number.isFinite(i) && i >= 0 && i <= maxIdx) out.add(i);
    }
    return out;
}

/**
 * @param {{ hint?: { index?: number, visited?: number[] }|null, recent?: { index?: number, visited?: number[] }|null, tocLength?: number }} opts
 * @returns {{ index: number, visited: Set<number> }}
 */
export function resolveLessonOpenSection({ hint, recent, tocLength = 0 }) {
    const maxIdx = Math.max(0, (Number(tocLength) || 1) - 1);

    if (hint && typeof hint.index === 'number') {
        const index = clampSectionIndex(hint.index, tocLength);
        return { index, visited: normalizeVisited(hint.visited, maxIdx) };
    }

    if (recent && typeof recent.index === 'number') {
        const index = clampSectionIndex(recent.index, tocLength);
        return { index, visited: normalizeVisited(recent.visited, maxIdx) };
    }

    return { index: 0, visited: new Set() };
}

export { clampSectionIndex };
