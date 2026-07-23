/**
 * Minimal YAML frontmatter parser for narrative lessons (scene_id, progress_details, …).
 * Subset only — no arbitrary YAML. Matches Python SDK content.frontmatter output shape.
 */

const FM_DELIM = /^---\s*$/;

function stripQuotes(s) {
    const t = String(s || '').trim();
    if (
        (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))
    ) {
        return t.slice(1, -1);
    }
    return t;
}

function parseScalar(raw) {
    const s = stripQuotes(raw);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null' || s === '~') return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    return s;
}

/**
 * @param {string} raw lesson markdown
 * @returns {Record<string, unknown>}
 */
export function parseLessonFrontmatter(raw) {
    const text = String(raw || '');
    const lines = text.split(/\r?\n/);
    if (!lines.length || !FM_DELIM.test(lines[0].trim())) return {};

    let end = -1;
    for (let i = 1; i < lines.length; i++) {
        if (FM_DELIM.test(lines[i].trim())) {
            end = i;
            break;
        }
    }
    if (end < 0) return {};

    const body = lines.slice(1, end);
    const out = {};
    let i = 0;

    while (i < body.length) {
        const line = body[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            i += 1;
            continue;
        }
        const colon = trimmed.indexOf(':');
        if (colon < 0) {
            i += 1;
            continue;
        }
        const key = trimmed.slice(0, colon).trim();
        const rest = trimmed.slice(colon + 1).trim();

        if (rest === '' || rest === '|' || rest === '>') {
            const items = [];
            i += 1;
            while (i < body.length) {
                const next = body[i];
                if (!/^\s/.test(next) && next.trim()) break;
                const listMatch = next.match(/^\s*-\s*(.*)$/);
                if (listMatch) {
                    const itemRest = listMatch[1].trim();
                    if (itemRest && itemRest.indexOf(':') >= 0 && !itemRest.startsWith('"')) {
                        const obj = {};
                        const firstKey = itemRest.split(':')[0].trim();
                        obj[firstKey] = parseScalar(itemRest.split(':').slice(1).join(':').trim());
                        i += 1;
                        while (i < body.length) {
                            const sub = body[i];
                            if (!/^\s{2,}/.test(sub) || /^\s*-\s/.test(sub)) break;
                            const subTrim = sub.trim();
                            const sc = subTrim.indexOf(':');
                            if (sc < 0) break;
                            obj[subTrim.slice(0, sc).trim()] = parseScalar(
                                subTrim.slice(sc + 1).trim()
                            );
                            i += 1;
                        }
                        items.push(obj);
                        continue;
                    }
                    items.push(parseScalar(itemRest));
                } else {
                    const sc = next.trim().indexOf(':');
                    if (sc >= 0 && items.length && typeof items[items.length - 1] === 'object') {
                        const obj = items[items.length - 1];
                        obj[next.trim().slice(0, sc).trim()] = parseScalar(
                            next.trim().slice(sc + 1).trim()
                        );
                    }
                }
                i += 1;
            }
            out[key] = items;
            continue;
        }

        out[key] = parseScalar(rest);
        i += 1;
    }

    return out;
}

/**
 * @param {string} raw
 * @returns {unknown[]}
 */
export function parseLessonProgressDetails(raw) {
    const fm = parseLessonFrontmatter(raw);
    const pd = fm.progress_details;
    return Array.isArray(pd) ? pd : [];
}

/**
 * @param {{ raw?: string, text?: string, meta?: { tags?: string[] }, frontmatter?: Record<string, unknown> }} lesson
 */
export function lessonIsNarrativeScene(lesson) {
    const fm = lesson?.frontmatter || parseLessonFrontmatter(lesson?.raw || lesson?.text || '');
    if (fm.scene_id || fm.progress_details || fm.initial_narration) return true;
    const tags = (lesson?.meta?.tags || []).map((t) => String(t).toLowerCase());
    return tags.some((t) =>
        ['starship', 'narrative', 'story', 'visual-novel'].includes(t)
    );
}
