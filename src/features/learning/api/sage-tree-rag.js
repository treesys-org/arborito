/**
 * Collect lesson evidence from the active curriculum tree for Sage dynamic (RAG) mode.
 */

import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { tokenizeForSearch } from '../../search/api/search-index-core.js';
import { buildTreeBreadcrumb } from './ai-context.js';

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out',
    'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who',
    'boy', 'did', 'let', 'put', 'say', 'she', 'too', 'use', 'que', 'por', 'para', 'con', 'una', 'uno',
    'los', 'las', 'del', 'como', 'este', 'esta', 'eso', 'esa', 'hay', 'sin', 'sobre',
    'topic', 'lesson', 'clearly', 'summarize', 'explain', 'explica', 'explicar', 'explicame',
    'resumir', 'resumen', 'pregunta', 'trata', 'modulo', 'modulos', 'module', 'modules',
    'capitulo', 'capitulos', 'chapter', 'unidad', 'seccion', 'section',
]);

const MODULE_QUERY_RE = /\b(m[oó]dulo|module|cap[ií]tulo|chapter|unidad|unit|secci[oó]n|section)\b/i;

function normalizeForMatch(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Strip intent/filler words so "módulo pidiendo ayuda" → "pidiendo ayuda". */
function extractQueryFocus(query) {
    let s = normalizeForMatch(query);
    s = s.replace(
        /\b(explicame|explicar|explica|que trata|trata|sobre|del|de la|de el|el|la|los|las|un|una|please|explain|about|what|does|cover|covers|habla|cuentame|dime|decime)\b/g,
        ' '
    );
    return s.replace(/\s+/g, ' ').trim();
}

function phraseInHaystack(phrase, haystack) {
    const p = normalizeForMatch(phrase);
    const h = normalizeForMatch(haystack);
    if (!p || !h || p.length < 4) return false;
    return h.includes(p);
}

function scoreNodeNameMatch(node, query, terms) {
    const name = String(node.name || '');
    const desc = String(node.description || '');
    const path = String(node.path || '');
    const blob = normalizeForMatch(`${name} ${desc} ${path}`);
    let score = scoreTextMatch(blob, terms);
    const focus = extractQueryFocus(query);
    if (focus && phraseInHaystack(focus, name)) score += 140;
    if (focus && phraseInHaystack(focus, path)) score += 90;
    if (focus && phraseInHaystack(focus, desc)) score += 50;
    return score;
}

function findNodeById(root, id) {
    if (!root || id == null) return null;
    const want = String(id);
    let found = null;
    const walk = (n) => {
        if (!n || found) return;
        if (String(n.id) === want) {
            found = n;
            return;
        }
        if (n.children) n.children.forEach(walk);
    };
    walk(root);
    return found;
}

function findParentBranch(root, nodeId) {
    if (!root || nodeId == null) return null;
    const want = String(nodeId);
    let parentBranch = null;
    const walk = (n, branchAncestor) => {
        if (!n) return;
        const nextBranch = n.type === 'branch' ? n : branchAncestor;
        if (String(n.id) === want) {
            parentBranch = nextBranch;
            return;
        }
        if (n.children) n.children.forEach((c) => walk(c, nextBranch));
    };
    walk(root, null);
    return parentBranch;
}

function collectLeavesUnder(node) {
    const out = [];
    const walk = (n) => {
        if (!n) return;
        if (n.type === 'leaf' || n.type === 'exam') out.push(n);
        if (n.children) n.children.forEach(walk);
    };
    walk(node);
    return out;
}

function buildModuleOverviewBlock(branch, lang, maxChars) {
    if (!branch) return '';
    const title = String(branch.name || '').trim();
    const desc = String(branch.description || '').trim();
    const header = lang === 'ES'
        ? `[Módulo: ${title || 'Sin título'}]`
        : `[Module: ${title || 'Untitled'}]`;
    const lines = [header];
    if (desc) lines.push(desc);

    const lessons = collectLeavesUnder(branch);
    if (lessons.length) {
        lines.push(lang === 'ES' ? 'Lecciones del módulo:' : 'Lessons in this module:');
        for (const leaf of lessons) {
            const ln = String(leaf.name || leaf.id || '').trim();
            const ld = String(leaf.description || '').trim();
            const parsed = parseArboritoFile(leaf.content || '');
            const metaDesc = String(parsed.meta?.description || '').trim();
            lines.push(`- ${ln}${ld || metaDesc ? `: ${ld || metaDesc}` : ''}`);
        }
    }
    return clipText(lines.join('\n'), maxChars);
}

/**
 * Match module/lesson names in the user question (e.g. "módulo pidiendo ayuda").
 * @returns {{ focusNode: object|null, moduleBlock: string, focusParentId: string|null }}
 */
export function resolveSageQueryTarget(treeRoot, query, contextNode, lang, moduleBudget = 2400) {
    const empty = { focusNode: null, moduleBlock: '', focusParentId: null };
    if (!treeRoot) return empty;

    const terms = queryTerms(query);
    const focusPhrase = extractQueryFocus(query);
    const wantsModule = MODULE_QUERY_RE.test(String(query || ''));

    let bestLeaf = null;
    let bestLeafScore = 0;
    let bestBranch = null;
    let bestBranchScore = 0;

    const walk = (n) => {
        if (!n) return;
        if (n.type === 'branch') {
            const s = scoreNodeNameMatch(n, query, terms);
            if (s > bestBranchScore) {
                bestBranchScore = s;
                bestBranch = n;
            }
        }
        if (n.type === 'leaf' || n.type === 'exam') {
            const s = scoreNodeNameMatch(n, query, terms);
            if (s > bestLeafScore) {
                bestLeafScore = s;
                bestLeaf = n;
            }
        }
        if (n.children) n.children.forEach(walk);
    };
    walk(treeRoot);

    let focusNode = null;
    /* When the question names another lesson strongly, prefer it over whatever
     * happens to be open, otherwise Sage answers about the wrong lesson. */
    if (bestLeafScore >= 50 || (focusPhrase && bestLeafScore >= 30)) {
        focusNode = bestLeaf;
    } else if (contextNode && (contextNode.type === 'leaf' || contextNode.type === 'exam')) {
        focusNode = findNodeById(treeRoot, contextNode.id) || contextNode;
    }

    let moduleBranch = null;
    if (wantsModule && bestBranchScore >= 40) {
        moduleBranch = bestBranch;
    }
    if (focusNode && !moduleBranch) {
        moduleBranch = findParentBranch(treeRoot, focusNode.id);
    }
    if (wantsModule && focusPhrase && bestBranchScore < 40 && bestLeafScore >= 50) {
        moduleBranch = findParentBranch(treeRoot, bestLeaf.id);
    }

    const moduleBlock = moduleBranch && wantsModule
        ? buildModuleOverviewBlock(moduleBranch, lang, moduleBudget)
        : '';

    const focusParentId = focusNode?.parentId
        || (moduleBranch ? moduleBranch.id : null)
        || null;

    return { focusNode, moduleBlock, focusParentId };
}

function clipText(text, maxChars) {
    const s = String(text || '');
    if (!Number.isFinite(maxChars) || maxChars <= 0 || s.length <= maxChars) return s;
    return s.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

function queryTerms(query) {
    const tokens = tokenizeForSearch(String(query || '').toLowerCase());
    return tokens.filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function scoreTextMatch(text, terms) {
    if (!terms.length || !text) return 0;
    const hay = String(text).toLowerCase();
    let score = 0;
    for (const term of terms) {
        if (hay.includes(term)) score += 12;
    }
    return score;
}

function resolveTreeRoot(rawGraph, lang, treeRoot) {
    if (treeRoot && typeof treeRoot === 'object') return treeRoot;
    if (!rawGraph || !rawGraph.languages) return null;
    return rawGraph.languages[lang] || rawGraph.languages[Object.keys(rawGraph.languages)[0]] || null;
}

function formatAuthorQuizSnippet(challenge, lang = 'EN') {
    if (!challenge || typeof challenge !== 'object') return '';
    const core = String(challenge.core_concept || '').trim();
    const shortDef = String(challenge.short_definition || '').trim();
    const question = String(challenge.main_question || '').trim();
    if (!core && !shortDef && !question) return '';
    if (lang === 'ES') {
        const lines = ['[Autotest del autor, no des la respuesta salvo que el estudiante la pida]'];
        if (core) lines.push(`Concepto clave: ${core}`);
        if (shortDef) lines.push(`Definición breve: ${shortDef}`);
        if (question) lines.push(`Pregunta guía: ${question}`);
        return lines.join('\n');
    }
    const lines = ['[Author quiz, do not reveal the answer unless the student asks]'];
    if (core) lines.push(`Core concept: ${core}`);
    if (shortDef) lines.push(`Short definition: ${shortDef}`);
    if (question) lines.push(`Guide question: ${question}`);
    return lines.join('\n');
}

function pathLabel(node) {
    return String(node.path || node.name || node.id || 'Lesson');
}

function lessonBodySnippet(parsed, maxChars) {
    const body = String(parsed.body || '')
        .replace(/^>.*$/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
    return clipText(body, maxChars);
}

/** Blend the latest user turn with recent history for retrieval. */
export function expandSageRagQuery(lastMsg, messages = []) {
    const last = String(lastMsg || '').trim();
    const recentUser = (Array.isArray(messages) ? messages : [])
        .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
        .slice(-3)
        .map((m) => m.content.trim())
        .filter(Boolean)
        .filter((t) => t !== last);
    return [last, ...recentUser].filter(Boolean).join(' ');
}

/** Full context for the lesson the learner currently has open. */
export function buildSageActiveLessonContext(store, contextNode, lang, maxChars) {
    if (!contextNode || (contextNode.type !== 'leaf' && contextNode.type !== 'exam')) return '';
    const raw = contextNode.content;
    if (!raw) return '';

    const parsed = parseArboritoFile(raw);
    const breadcrumb = buildTreeBreadcrumb(store, contextNode, { maxChars: 240 });
    const header = breadcrumb
        ? (lang === 'ES' ? `[Lección actual: ${breadcrumb}]` : `[Current lesson: ${breadcrumb}]`)
        : (lang === 'ES' ? '[Lección actual]' : '[Current lesson]');
    const desc = String(contextNode.description || parsed.meta.description || '').trim();
    const body = String(parsed.body || raw).replace(/^>.*$/gm, '').trim();
    const quiz = formatAuthorQuizSnippet(parsed.meta?.challenge, lang);
    const block = [header, desc, body, quiz].filter(Boolean).join('\n\n');
    return clipText(block, maxChars);
}

function nodeNeedsLazyNetworkLesson(node) {
    return !!(
        node &&
        !node.content &&
        (node.contentPath || (node.treeLazyContent && node.treeContentKey))
    );
}

/**
 * Pre-load lazy lesson bodies for top RAG candidates so collectTreeRagEvidence
 * does not return empty snippets on Nostr/web trees.
 * @param {{ loadNodeContent?: (node: object) => Promise<void> }} storeHost
 */
export async function preloadRagLessonContent(storeHost, rawGraph, lang, opts, maxPreload = 4) {
    if (!storeHost || typeof storeHost.loadNodeContent !== 'function') return;
    const root = resolveTreeRoot(rawGraph, lang, opts.treeRoot);
    if (!root) return;

    const terms = queryTerms(opts.query || '');
    const focusNodeId = opts.focusNodeId || null;
    const focusParentId = opts.focusParentId || null;
    const leaves = [];
    const walk = (n) => {
        if (!n) return;
        if (n.type === 'leaf' || n.type === 'exam') leaves.push(n);
        if (n.children) n.children.forEach(walk);
    };
    walk(root);

    const scored = leaves
        .map((node) => {
            let score = 0;
            const nodeId = String(node.id);
            if (focusNodeId && nodeId === String(focusNodeId)) score += 120;
            if (focusParentId && node.parentId && String(node.parentId) === String(focusParentId)) score += 40;
            const path = String(node.path || node.name || '');
            if (path) score += Math.min(20, path.split(' / ').length);
            score += scoreTextMatch(`${node.name || ''} ${node.description || ''} ${path}`, terms);
            return { node, score };
        })
        .sort((a, b) => b.score - a.score);

    let loaded = 0;
    for (const { node, score } of scored) {
        if (loaded >= maxPreload) break;
        if (!nodeNeedsLazyNetworkLesson(node)) continue;
        if (score < 1 && terms.length > 0) continue;
        try {
            await storeHost.loadNodeContent(node);
            loaded += 1;
        } catch {
            /* skip, RAG falls back to title/description */
        }
    }
}

/**
 * @param {object|null|undefined} rawGraph
 * @param {string} [lang]
 * @param {{
 *   treeRoot?: object|null,
 *   maxNodes?: number,
 *   maxChars?: number,
 *   focusNodeId?: string|null,
 *   excludeNodeId?: string|null,
 *   focusParentId?: string|null,
 *   query?: string,
 * }} [opts]
 */
export function collectTreeRagEvidence(rawGraph, lang = 'EN', opts = {}) {
    const maxNodes = opts.maxNodes != null ? opts.maxNodes : 24;
    const maxChars = opts.maxChars != null ? opts.maxChars : 12000;
    const focusNodeId = opts.focusNodeId || null;
    const excludeNodeId = opts.excludeNodeId || null;
    const focusParentId = opts.focusParentId || null;
    const terms = queryTerms(opts.query || '');

    const root = resolveTreeRoot(rawGraph, lang, opts.treeRoot);
    if (!root) return { blocks: [], text: '' };

    const leaves = [];
    const walk = (n) => {
        if (!n) return;
        if (n.type === 'leaf' || n.type === 'exam') leaves.push(n);
        if (n.children) n.children.forEach(walk);
    };
    walk(root);

    const scored = leaves.map((node) => {
        let score = 0;
        const nodeId = String(node.id);
        if (focusNodeId && nodeId === String(focusNodeId)) score += 120;
        if (
            excludeNodeId &&
            nodeId === String(excludeNodeId) &&
            nodeId !== String(focusNodeId || '')
        ) {
            score -= 200;
        }
        if (
            focusParentId &&
            node.parentId &&
            String(node.parentId) === String(focusParentId) &&
            nodeId !== String(focusNodeId || '')
        ) {
            score += 40;
        }
        const path = String(node.path || node.name || '');
        if (path) score += Math.min(20, path.split(' / ').length);
        const parsed = parseArboritoFile(node.content || '');
        const title = String(parsed.meta.title || node.name || '');
        const desc = String(node.description || parsed.meta.description || '');
        const bodyPlain = String(parsed.body || '').replace(/\s+/g, ' ').trim();
        const quizPlain = formatAuthorQuizSnippet(parsed.meta?.challenge, lang);
        score += scoreTextMatch([title, desc, bodyPlain, quizPlain, path].join(' '), terms);
        if (!bodyPlain && !desc && !title) score -= 80;
        return { node, parsed, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const blocks = [];
    let used = 0;
    for (const { node, parsed, score } of scored) {
        if (blocks.length >= maxNodes) break;
        const isFocus = focusNodeId && String(node.id) === String(focusNodeId);
        if (score < 1 && terms.length > 0) continue;
        /* Vague queries (only stopwords) must not dump random lessons, keep
         * only the focus node and its siblings (score ≥ 40 from parent boost). */
        if (terms.length === 0 && !isFocus && score < 40) continue;
        if (excludeNodeId && String(node.id) === String(excludeNodeId)) continue;

        const bodyLimit = isFocus ? 2800 : 900;
        const body = lessonBodySnippet(parsed, bodyLimit);
        const desc = String(node.description || parsed.meta.description || '').trim();
        const title = String(parsed.meta.title || node.name || '').trim();
        const quiz = formatAuthorQuizSnippet(parsed.meta?.challenge, lang);
        const snippet = [title, desc, body, quiz].filter(Boolean).join('\n');
        if (!snippet) continue;

        const label = lang === 'ES' ? 'Lección relacionada' : 'Related lesson';
        const block = `[${label}: ${pathLabel(node)}]\n${snippet}`;
        if (used + block.length > maxChars && blocks.length > 0) break;
        blocks.push(block);
        used += block.length;
    }

    return { blocks, text: blocks.join('\n\n---\n\n') };
}
