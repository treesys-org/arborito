const STORAGE_KEY = 'arborito-trust-graph-v1';

function nowIso() {
    return new Date().toISOString();
}

function safeJsonParse(raw) {
    try {
        return JSON.parse(String(raw || ''));
    } catch {
        return null;
    }
}

function normalizePub(pub) {
    const p = String(pub || '').trim();
    // SEA pub keys are generally long base64-ish strings; we keep validation permissive.
    if (!p) return '';
    if (p.length < 8) return '';
    return p;
}

/**
 * @typedef {{ pub: string, label?: string, addedAt: string, source?: 'manual'|'import'|'wot' }} TrustedAuthor
 * @typedef {{ v: 1, trustedAuthors: TrustedAuthor[], updatedAt: string }} TrustGraphState
 */

/**
 * @returns {TrustGraphState}
 */
export function loadTrustGraph() {
    const fallback = { v: 1, trustedAuthors: [], updatedAt: nowIso() };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return fallback;
        const parsed = safeJsonParse(raw);
        if (!parsed || typeof parsed !== 'object') return fallback;
        if (Number(parsed.v) !== 1) return fallback;
        const list = Array.isArray(parsed.trustedAuthors) ? parsed.trustedAuthors : [];
        const trustedAuthors = list
            .filter((x) => x && typeof x === 'object')
            .map((x) => {
                const pub = normalizePub(x.pub);
                if (!pub) return null;
                const label = String(x.label || '').trim().slice(0, 48);
                const sourceRaw = String(x.source || '').trim();
                const source =
                    sourceRaw === 'import' || sourceRaw === 'wot' || sourceRaw === 'manual'
                        ? sourceRaw
                        : 'manual';
                const addedAt = String(x.addedAt || '').trim() || nowIso();
                return { pub, label, source, addedAt };
            })
            .filter(Boolean)
            .slice(0, 400);
        return {
            v: 1,
            trustedAuthors,
            updatedAt: String(parsed.updatedAt || '').trim() || nowIso()
        };
    } catch {
        return fallback;
    }
}

/**
 * @param {TrustGraphState} state
 */
export function saveTrustGraph(state) {
    const v = state && typeof state === 'object' ? Number(state.v) : 1;
    const list = state && typeof state === 'object' && Array.isArray(state.trustedAuthors) ? state.trustedAuthors : [];
    const cleaned = {
        v: v === 1 ? 1 : 1,
        trustedAuthors: list
            .map((x) => {
                const pub = normalizePub((x && x.pub));
                if (!pub) return null;
                const label = String((x && x.label) || '').trim().slice(0, 48);
                const sourceRaw = String((x && x.source) || '').trim();
                const source =
                    sourceRaw === 'import' || sourceRaw === 'wot' || sourceRaw === 'manual'
                        ? sourceRaw
                        : 'manual';
                const addedAt = String((x && x.addedAt) || '').trim() || nowIso();
                return { pub, label, source, addedAt };
            })
            .filter(Boolean)
            .slice(0, 400),
        updatedAt: nowIso()
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {string} pub
 */
export function isTrustedAuthorPub(pub) {
    const p = normalizePub(pub);
    if (!p) return false;
    const g = loadTrustGraph();
    return g.trustedAuthors.some((a) => a.pub === p);
}

/**
 * @param {{ pub: string, label?: string, source?: 'manual'|'import'|'wot' }} author
 */
export function upsertTrustedAuthor(author) {
    const pub = normalizePub((author && author.pub));
    if (!pub) return { ok: false, reason: 'bad_pub' };
    const label = String((author && author.label) || '').trim().slice(0, 48);
    const source = (author && author.source) === 'import' || (author && author.source) === 'wot' || (author && author.source) === 'manual'
        ? author.source
        : 'manual';

    const g = loadTrustGraph();
    const next = g.trustedAuthors.filter((x) => x.pub !== pub);
    next.unshift({ pub, label, source, addedAt: nowIso() });
    const ok = saveTrustGraph({ ...g, trustedAuthors: next });
    return ok ? { ok: true } : { ok: false, reason: 'save_failed' };
}

/**
 * @param {string} pub
 */
export function removeTrustedAuthor(pub) {
    const p = normalizePub(pub);
    if (!p) return { ok: false, reason: 'bad_pub' };
    const g = loadTrustGraph();
    const next = g.trustedAuthors.filter((x) => x.pub !== p);
    const ok = saveTrustGraph({ ...g, trustedAuthors: next });
    return ok ? { ok: true } : { ok: false, reason: 'save_failed' };
}

/**
 * @param {{ includeMeta?: boolean }} [opts]
 */
export function exportTrustGraphJson(opts = {}) {
    const includeMeta = (opts && opts.includeMeta) !== false;
    const g = loadTrustGraph();
    const payload = {
        v: 1,
        k: 'arborito.trustGraph',
        exportedAt: nowIso(),
        trustedAuthors: g.trustedAuthors.map((a) => ({
            pub: a.pub,
            label: a.label || '',
            source: a.source || 'manual',
            addedAt: a.addedAt
        }))
    };
    if (!includeMeta) {
        delete payload.exportedAt;
    }
    return JSON.stringify(payload, null, 2);
}

/**
 * Merge import JSON into current graph.
 * @param {string} jsonText
 */
export function importTrustGraphJson(jsonText) {
    const parsed = safeJsonParse(String(jsonText || '').trim());
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'invalid_json' };
    if (Number(parsed.v) !== 1) return { ok: false, reason: 'bad_version' };
    if (String(parsed.k || '') !== 'arborito.trustGraph') return { ok: false, reason: 'bad_kind' };
    const list = Array.isArray(parsed.trustedAuthors) ? parsed.trustedAuthors : [];
    const incoming = list
        .map((x) => {
            const pub = normalizePub((x && x.pub));
            if (!pub) return null;
            const label = String((x && x.label) || '').trim().slice(0, 48);
            return { pub, label, source: 'import', addedAt: nowIso() };
        })
        .filter(Boolean);

    const g = loadTrustGraph();
    const seen = new Set();
    const merged = [];
    // Prefer incoming first, then existing.
    for (const a of incoming) {
        if (seen.has(a.pub)) continue;
        seen.add(a.pub);
        merged.push(a);
    }
    for (const a of g.trustedAuthors) {
        if (!(a && a.pub)) continue;
        if (seen.has(a.pub)) continue;
        seen.add(a.pub);
        merged.push(a);
    }
    const ok = saveTrustGraph({ ...g, trustedAuthors: merged });
    return ok ? { ok: true, added: incoming.length } : { ok: false, reason: 'save_failed' };
}

