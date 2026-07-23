/**
 * Product-label matching for Sage intent + demo RAG.
 *
 * 1) Prefix against vocabulary from demo lesson paths / tree labels (content).
 * 2) Reliable expand for truncated UI labels (arcad→arcade) so APP_HELP works
 *    even before the demo tree finishes loading — these are product names in
 *    the bundled demo, not author create-verb synonyms.
 */

import { tokenizeForSearch } from '../../search/api/search-index-core.js';

/**
 * Vite rewrites `import.meta.glob(...)` to a module map. Do NOT guard with
 * `typeof import.meta.glob === 'function'` — after transform that check is
 * false and the seed would stay empty in the browser.
 */
const DEMO_LESSON_PATH_KEYS = (() => {
    try {
        return Object.keys(import.meta.glob('../../../demo/arborito-demo/lessons/**/*.md'));
    } catch (_) {
        return [];
    }
})();

/** @type {Set<string>|null} */
let cachedProductVocab = null;

/** Common Spanish/English function words — never treat as product hits. */
const VOCAB_STOP = new Set([
    'que', 'qué', 'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
    'por', 'para', 'con', 'una', 'uno', 'los', 'las', 'del', 'como', 'este', 'esta',
    'eso', 'esa', 'hay', 'sin', 'sobre', 'tal', 'muy', 'mas', 'más', 'también',
    'hola', 'hello', 'hey', 'hol', 'buen', 'buena', 'buenas', 'dias', 'día', 'dia',
    'todo', 'bien', 'como', 'estas', 'está', 'how', 'are', 'you', 'what', 'who',
]);

function normalizeVocabToken(w) {
    return String(w || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\w-]+/g, ' ')
        .trim();
}

/**
 * Truncated product labels → full names that appear in the Arborito demo.
 * @param {string} q
 */
export function expandKnownAppStems(q) {
    let out = String(q || '');
    if (!out.trim()) return out;
    const rules = [
        { re: /\barbor/i, add: 'arborito', have: /\barborito\b/i },
        /* arc / arcad / arcade — whole-word so “archivo” does not match. */
        { re: /\barc(?:ade?)?\b/i, add: 'arcade', have: /\barcade\b/i },
        { re: /\bbosq/i, add: 'bosque forest', have: /\b(bosque|forest)\b/i },
        { re: /\bbosque?\b/i, add: 'bosque forest', have: /\b(bosque|forest)\b/i },
        { re: /\bforest/i, add: 'forest bosque', have: /\b(bosque|forest)\b/i },
        { re: /\bconstruc/i, add: 'construcción construction', have: /\bconstrucci/i },
        { re: /\bmochil/i, add: 'mochila backpack', have: /\b(mochila|backpack)\b/i },
    ];
    for (const { re, add, have } of rules) {
        if (re.test(out) && !have.test(out)) out = `${out} ${add}`;
    }
    /* Typos like .arbprto / arbprto → arborito (+ file hint when dotted). */
    out = expandArboritoTypos(out);
    out = expandBosqueTypos(out);
    return out.trim();
}

/**
 * Near-miss spellings of bosque / forest (bosqe, bosq, etc.).
 * @param {string} q
 */
function expandBosqueTypos(q) {
    let out = String(q || '');
    if (/\b(bosque|forest)\b/i.test(out)) return out;
    if (/\bbosq[a-z]{0,3}\b/i.test(out) || /\bbosc[a-z]{0,3}\b/i.test(out)) {
        out += ' bosque forest';
    }
    return out;
}

/**
 * Near-miss spellings of “arborito” / “.arborito” (arb…o, length close to 8).
 * @param {string} q
 */
function expandArboritoTypos(q) {
    let out = String(q || '');
    const re = /\.?arb[a-z0-9]{3,10}\b/gi;
    let m;
    const seen = new Set();
    while ((m = re.exec(String(q || ''))) !== null) {
        const raw = m[0];
        const dotted = raw.startsWith('.');
        const core = raw.replace(/^\./, '').toLowerCase();
        if (core === 'arborito' || core === 'arcade' || seen.has(core)) continue;
        seen.add(core);
        /* Must look like the product name, not arbitrary arb* words. */
        if (!core.startsWith('arb') || core.length < 5 || core.length > 10) continue;
        if (!/o$/.test(core)) continue;
        if (!/\barborito\b/i.test(out)) out += ' arborito';
        if (dotted && !/\.arborito\b/i.test(out)) out += ' .arborito archivo';
    }
    return out;
}

/**
 * @param {Iterable<string>|null|undefined} words
 * @param {{ merge?: boolean }} [opts]
 */
export function setProductVocab(words, opts = {}) {
    const next = opts.merge && cachedProductVocab ? new Set(cachedProductVocab) : new Set();
    for (const w of words || []) {
        const t = normalizeVocabToken(w);
        if (!t) continue;
        for (const part of t.split(/\s+/)) {
            if (part.length < 3 || VOCAB_STOP.has(part)) continue;
            next.add(part);
        }
    }
    cachedProductVocab = next;
}

/** @returns {Set<string>} */
export function getProductVocab() {
    if (!cachedProductVocab || !cachedProductVocab.size) {
        warmProductVocabFromDemoPaths();
    }
    return cachedProductVocab || new Set();
}

/** Seed vocab from bundled demo filenames (product labels in the tree). */
export function warmProductVocabFromDemoPaths() {
    if (DEMO_LESSON_PATH_KEYS.length) {
        setProductVocab(DEMO_LESSON_PATH_KEYS);
        return;
    }
    /* Node tests / non-Vite: seed the same labels the demo filenames carry. */
    setProductVocab([
        'Arborito',
        'Arcade',
        'Bosque',
        'Forest',
        'Sage',
        'construccion',
        'construction',
        'jardin',
        'garden',
        'mochila',
        'backpack',
    ]);
}

/**
 * Labels only (name / path / description / title) — not full lesson bodies
 * (bodies flood stopwords like “que”/“tal” and break greetings).
 * @param {object|null} root
 * @returns {string[]}
 */
export function collectVocabFromTreeRoot(root) {
    const out = [];
    const walk = (n) => {
        if (!n) return;
        if (n.name) out.push(String(n.name));
        if (n.path) out.push(String(n.path));
        if (n.description) out.push(String(n.description));
        const raw = String(n.content || '');
        if (raw) {
            const titleM = raw.match(/^title:\s*(.+)$/m);
            if (titleM) out.push(titleM[1]);
        }
        for (const c of n.children || []) walk(c);
    };
    walk(root);
    return out;
}

function queryTermsLoose(query) {
    return tokenizeForSearch(String(query || '').toLowerCase()).filter(
        (w) => w.length >= 3 && !VOCAB_STOP.has(w)
    );
}

/**
 * @param {string} query
 * @param {Set<string>|Iterable<string>} [vocab]
 * @returns {string[]}
 */
export function matchVocabByQueryPrefix(query, vocab = getProductVocab()) {
    const terms = queryTermsLoose(query);
    if (!terms.length) return [];
    const bag = vocab instanceof Set ? vocab : new Set(vocab || []);
    if (!bag.size) return [];
    /** @type {Set<string>} */
    const hits = new Set();
    for (const term of terms) {
        for (const word of bag) {
            if (VOCAB_STOP.has(word)) continue;
            if (word === term) {
                hits.add(word);
                continue;
            }
            /* Prefix: arc→arcade, bosq→bosque (startsWith only; includes needs len≥4). */
            if (term.length >= 3 && word.startsWith(term)) {
                hits.add(word);
                continue;
            }
            if (term.length >= 4 && word.includes(term)) {
                hits.add(word);
            }
        }
    }
    return [...hits];
}

/**
 * Stem expand first (reliable), then append any extra vocab prefix hits.
 * @param {string} query
 * @param {Set<string>|Iterable<string>} [vocab]
 */
export function expandQueryByProductVocab(query, vocab = getProductVocab()) {
    const q0 = String(query || '').trim();
    if (!q0) return q0;
    let q = expandKnownAppStems(q0);
    const hits = matchVocabByQueryPrefix(q0, vocab);
    if (!hits.length) return q;
    const missing = hits.filter((h) => !new RegExp(`\\b${escapeRe(h)}\\b`, 'i').test(q));
    if (!missing.length) return q;
    return `${q} ${missing.join(' ')}`.trim();
}

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

warmProductVocabFromDemoPaths();
