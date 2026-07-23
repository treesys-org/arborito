/**
 * Sage RAG query intent, tree targeting, and lesson context helpers.
 */

import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { tokenizeForSearch } from '../../search/api/search-index-core.js';
import { buildTreeBreadcrumb } from './ai-context.js';
import { isQuizBlockOpen, isQuizBlockClose, parseQuizBlock } from './quiz-schema.js';
import {
    expandQueryByProductVocab,
    matchVocabByQueryPrefix,
} from './sage-app-stems.js';

export const ARBORITO_APP_QUERY_RE =
    /\b(arborito|sage|arcade|memory\s*garden|jard[ií]n|construcci[oó]n|construction|bosque|forest|backpack|mochila|flatpak|aplicaci[oó]n)\b/i;

/** “What is this / this app?” without naming Arborito — still product help. */
const META_APP_QUESTION_RES = [
    /* “qué es esto” (deictic) — not “qué es esta lección”. */
    /\b(?:explicame|explica|explícame|dime|decime|cu[eé]ntame|cuentame)?\s*(?:por\s+favor\s+)?(?:qu[eé]|que)\s+(?:es|son)\s+esto\b/i,
    /\b(?:qu[eé]|que)\s+(?:es|son)\s+(?:esta|este)\s+(?:app|aplicaci[oó]n|programa|software)\b/i,
    /\b(?:quiero\s+decir|me\s+refiero)\s+(?:a\s+)?(?:qu[eé]|que)\s+es\s+(?:esto|(?:esta|este)\s+(?:app|aplicaci[oó]n))\b/i,
    /\b(?:qu[eé]|que)\s+(?:cosas?\s+)?(?:permite|permite\s+hacer|puedo\s+hacer|hace|ofrece)\s+(?:la\s+|esta\s+|el\s+)?(?:app|aplicaci[oó]n)\b/i,
    /\b(?:para\s+qu[eé]\s+sirve|c[oó]mo\s+funciona)\s+(?:la\s+|esta\s+)?(?:app|aplicaci[oó]n|arborito)\b/i,
    /\by\s+que\s+es\s+(?:esa|esta)\s+app\b/i,
    /\bwhat\s+(?:is|are)\s+this(?:\s+(?:app|application|software|program))?\b/i,
    /\b(?:explain|tell\s+me)\s+what\s+this(?:\s+(?:app|application))?\s+is\b/i,
    /\bwhat\s+(?:can\s+(?:i|you)|does\s+(?:the\s+)?app)\s+do\b/i,
];

/** Vague product question (“qué es esto”, “what is this app”). */
export function isMetaAppQuestion(query) {
    const q = String(query || '').trim();
    if (!q || q.length > 160) return false;
    return META_APP_QUESTION_RES.some((re) => re.test(q));
}

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

/** User wants the syllabus / outline (not only when they say "módulo"). */
const MODULE_OUTLINE_QUERY_RE =
    /\b(dentro\s+(de(l|\s+la|\s+el)?)?|qu[eé]\s+hay|que\s+hay|contenido|temas|lecciones|incluye|submodulo|sub-?m[oó]dulo|estructura|qu[eé]\s+trata|que\s+trata|partes|componentes)\b/i;

const COURSE_TOPIC_GUARD_RE =
    /\b(m[oó]dulo|lecci[oó]n|curso|chmod|linux|bash|permiso|propiedad|examen|quiz|explica|resumen|script|directorio|ruta|usuario|grupo)\b/i;

export function wantsModuleOutline(query) {
    const q = String(query || '');
    return MODULE_QUERY_RE.test(q) || MODULE_OUTLINE_QUERY_RE.test(q);
}

/** App/product question (Arcade, Arborito, Sage…) — prefer demo docs over open course lesson. */
export function isPrimarilyArboritoAppQuery(query) {
    const raw = String(query || '').trim();
    if (!raw) return false;
    if (isMetaAppQuestion(raw)) return true;
    const q = expandQueryByProductVocab(raw);
    const vocabHits = matchVocabByQueryPrefix(raw);
    if (!ARBORITO_APP_QUERY_RE.test(q) && !vocabHits.length) return false;

    const appDefQuestion =
        /\b(qu[eé]|que)\s+(es|son|sabes|sabe|conoces|conoce)|what\s+is|what'?s|what\s+do\s+you\s+know|me refiero|c[oó]mo funciona|para qu[eé] sirve|explain\b/i.test(q)
        || /\b(cu[eé]ntame|cuentame|hablame|h[aá]blame|tell me)\s+(de|sobre|about)\b/i.test(q);
    const namesApp =
        vocabHits.length > 0
        || /\b(arcade|arborito|sage|mochila|backpack|memory\s*garden|flatpak|construcci[oó]n|bosque|forest|aplicaci[oó]n)\b/i.test(q);

    if (appDefQuestion && namesApp) return true;
    if (/me refiero a (arborito\s+)?(arcade|sage|arborito|mochila|backpack)\b/i.test(q)) return true;

    if (wantsModuleOutline(q)) return false;

    const terms = queryTerms(q);
    return terms.length <= 4 && namesApp;
}

/** Casual hello / small talk — skip lesson RAG (avoid rewriting open lessons). */
export function isCasualSageGreeting(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 80) return false;
    if (COURSE_TOPIC_GUARD_RE.test(t)) return false;

    const n = t
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();

    /* Product / “qué es X” are not greetings. */
    if (
        /\b(qu[eé]|que)\s+(es|son|sabes|sabe)\b/i.test(n)
        || /\b(what\s+is|explain|arcade|bosque|arbor|sage|construc|mochil)\b/i.test(n)
    ) {
        return false;
    }

    /* hol / hola / hi… + optional fluff (“bebe”, “que tal”), keep it short. */
    if (
        /^(hol[ae]?|hi|hey|hello|buenas|saludos|buen\s+di[a]?|howdy)\b/iu.test(n)
        && t.length <= 48
    ) {
        return true;
    }

    if (/^(que\s+tal|q[ue]*\s+tal|como\s+estas|how\s+are\s+you)[\s!.?]*$/iu.test(n)) {
        return true;
    }

    /* Short reciprocal small-talk after a hello (“bien y tu”, “todo bien”, “thanks”). */
    if (
        /^(bien(?:\s+y\s+(?:tu|vos))?|todo\s+bien|muy\s+bien|y\s+(?:tu|vos)|gracias|thanks|thank\s+you|ok|okay|dale)[\s!.?]*$/iu.test(
            n
        )
    ) {
        return true;
    }
    return false;
}

export function normalizeForMatch(text) {
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

export function findNodeById(root, id) {
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

export function findParentBranch(root, nodeId) {
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

export function buildModuleOverviewBlock(branch, lang, maxChars, outlineMode = false) {
    if (!branch) return '';
    const title = String(branch.name || '').trim();
    const desc = String(branch.description || '').trim();
    const header = lang === 'ES'
        ? `[Módulo: ${title || 'Sin título'}]`
        : `[Module: ${title || 'Untitled'}]`;
    const lines = [header];
    if (outlineMode) {
        lines.push(
            lang === 'ES'
                ? 'Contenido del módulo (enumera los ítems siguientes tal cual):'
                : 'Module contents (list the following items exactly):'
        );
    }
    if (desc) lines.push(desc);

    const childBranches = (branch.children || []).filter((c) => c && c.type === 'branch');
    const directLessons = (branch.children || []).filter((c) => c && (c.type === 'leaf' || c.type === 'exam'));

    if (childBranches.length) {
        lines.push(lang === 'ES' ? 'Submódulos:' : 'Submodules:');
        for (const sub of childBranches) {
            const name = String(sub.name || sub.id || '').trim();
            const sd = String(sub.description || '').trim();
            const nLessons = collectLeavesUnder(sub).length;
            const countHint =
                nLessons > 0
                    ? lang === 'ES'
                        ? ` (${nLessons} lecciones)`
                        : ` (${nLessons} lessons)`
                    : '';
            lines.push(`- ${name}${sd ? `: ${sd}` : ''}${countHint}`);
        }
    }

    const lessons = directLessons.length ? directLessons : (childBranches.length ? [] : collectLeavesUnder(branch));
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
    const wantsOutline = wantsModuleOutline(query);

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
        focusNode = findNodeById(treeRoot, contextNode.id) || null;
    }

    let moduleBranch = null;
    if ((wantsModule || wantsOutline) && bestBranchScore >= 28) {
        moduleBranch = bestBranch;
    }
    if (focusNode && !moduleBranch) {
        moduleBranch = findParentBranch(treeRoot, focusNode.id);
    }
    if ((wantsModule || wantsOutline) && focusPhrase && bestBranchScore < 28 && bestLeafScore >= 50) {
        moduleBranch = findParentBranch(treeRoot, bestLeaf.id);
    }
    if (!moduleBranch && wantsOutline && bestBranchScore >= 20) {
        moduleBranch = bestBranch;
    }

    const moduleBlock = moduleBranch && (wantsOutline || wantsModule || bestBranchScore >= 55)
        ? buildModuleOverviewBlock(moduleBranch, lang, moduleBudget)
        : '';

    const focusParentId = focusNode?.parentId
        || (moduleBranch ? moduleBranch.id : null)
        || null;

    return { focusNode, moduleBlock, focusParentId };
}

export function clipText(text, maxChars) {
    const s = String(text || '');
    if (!Number.isFinite(maxChars) || maxChars <= 0 || s.length <= maxChars) return s;
    return s.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

export function queryTerms(query) {
    const tokens = tokenizeForSearch(String(query || '').toLowerCase());
    return tokens.filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export function scoreTextMatch(text, terms) {
    if (!terms.length || !text) return 0;
    const hay = String(text).toLowerCase();
    let score = 0;
    for (const term of terms) {
        if (hay.includes(term)) score += 12;
    }
    return score;
}

export function formatAuthorQuizSnippet(challenge, lang = 'EN') {
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

/** Remove closed @quiz…@/quiz fences so answer:/traps never enter Sage CONTEXT.
 * Unmatched openers are left alone (same as findQuizBlocks) so lesson prose is kept.
 */
export function stripQuizBlocksFromMarkdown(md) {
    const lines = String(md || '').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        if (isQuizBlockOpen(lines[i].trim())) {
            let close = -1;
            for (let j = i + 1; j < lines.length; j++) {
                if (isQuizBlockClose(lines[j])) {
                    close = j;
                    break;
                }
                if (isQuizBlockOpen(lines[j].trim())) break;
            }
            if (close === -1) {
                out.push(lines[i]);
                i += 1;
                continue;
            }
            i = close + 1;
            continue;
        }
        out.push(lines[i]);
        i += 1;
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** First fenced quiz in raw lesson text (safe fields via formatAuthorQuizSnippet). */
export function extractFirstQuizChallenge(raw) {
    const lines = String(raw || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (!isQuizBlockOpen(lines[i].trim())) continue;
        const body = [];
        let j = i + 1;
        while (j < lines.length && !isQuizBlockClose(lines[j])) {
            body.push(lines[j]);
            j += 1;
        }
        return parseQuizBlock(body);
    }
    return null;
}

const SHORT_APP_FOLLOWUP_RE = /^(y|e|and)\s+\S/i;

export { expandQueryByProductVocab, expandKnownAppStems } from './sage-app-stems.js';

/** App/product terms for intent routing (not full RAG expansion). */
export function resolveSageIntentQuery(lastMsg, messages = []) {
    let q = expandQueryByProductVocab(String(lastMsg || '').trim());
    if (!q) return q;

    if (isMetaAppQuestion(q) || /\baplicaci[oó]n\b/i.test(q)) {
        q += ' arborito app';
    }

    /* “la app” / “esa app” without naming Arborito — still product docs. */
    if (/\b(?:la|esta|ese|esa)\s+app\b/i.test(q) || /\bque\s+cosas?\s+permite\b/i.test(q)) {
        q += ' arborito aplicacion';
    }

    if (/\bbosque\b/i.test(q)) q += ' forest arborito';
    else if (/\bforest\b/i.test(q)) q += ' bosque arborito';

    if (SHORT_APP_FOLLOWUP_RE.test(q) && (ARBORITO_APP_QUERY_RE.test(q) || matchVocabByQueryPrefix(q).length)) {
        q += ' arborito app';
    }

    if (/\b(quien|quién|who)\s+(es|is)\b/i.test(q)) {
        q += ' sage búho sabio owl arborito';
    }

    if (/\b(qu[eé]|que|what)\s+(sabes|sabe|know|conoces|conoce)\s+(de|sobre|about)\b/i.test(q)) {
        q += ' arborito app';
    }

    if (/\b(cu[eé]ntame|cuentame|hablame|h[aá]blame|tell me)\s+(de|sobre|about)\b/i.test(q)) {
        q += ' arborito';
    }

    if (SHORT_APP_FOLLOWUP_RE.test(q) || /\b(me refiero|refiero|clarifica|quiero decir)\b/i.test(q)) {
        const recent = (Array.isArray(messages) ? messages : [])
            .slice(-6)
            .map((m) => (m?.role === 'user' || m?.role === 'assistant' ? String(m.content || '') : ''))
            .join(' ');
        const appHits = recent.match(
            /\b(arborito|arcade|bosque|forest|sage|construcci[oó]n|construction|mochila|backpack|memory\s*garden|jard[ií]n)\b/gi
        );
        if (appHits?.length) {
            q += ` ${[...new Set(appHits.map((w) => w.toLowerCase()))].join(' ')}`;
        }
    }

    return expandQueryByProductVocab(q.trim());
}

/** Blend the latest user turn with recent history for retrieval. */
export function expandSageRagQuery(lastMsg, messages = []) {
    const last = expandQueryByProductVocab(String(lastMsg || '').trim());
    let merged = last;
    /* Only pull prior turns on short follow-ups — otherwise history bleeds into RAG. */
    if (last.length > 0 && last.length < 48) {
        const recentUser = (Array.isArray(messages) ? messages : [])
            .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
            .slice(-3)
            .map((m) => m.content.trim())
            .filter(Boolean)
            .filter((t) => t !== last && t !== String(lastMsg || '').trim());
        if (recentUser.length) merged = [last, ...recentUser].filter(Boolean).join(' ');
    }
    merged = expandQueryByProductVocab(merged);
    if (/\bbosque\b/i.test(merged)) merged += ' forest arborito';
    else if (/\bforest\b/i.test(merged)) merged += ' bosque arborito';
    return merged.trim();
}

/** Full context for the lesson the learner currently has open. */
export function buildSageActiveLessonContext(store, contextNode, lang, maxChars) {
    if (!contextNode || (contextNode.type !== 'leaf' && contextNode.type !== 'exam')) return '';
    const raw = contextNode.content;
    if (!raw || isUnusableLessonContent(raw, store?.ui || store?.value?.ui || {})) return '';

    const parsed = parseArboritoFile(raw);
    const breadcrumb = buildTreeBreadcrumb(store, contextNode, { maxChars: 240 });
    const header = breadcrumb
        ? (lang === 'ES' ? `[Lección actual: ${breadcrumb}]` : `[Current lesson: ${breadcrumb}]`)
        : (lang === 'ES' ? '[Lección actual]' : '[Current lesson]');
    const desc = String(contextNode.description || parsed.meta.description || '').trim();
    const body = stripQuizBlocksFromMarkdown(parsed.body || raw).replace(/^>.*$/gm, '').trim();
    const quiz = formatAuthorQuizSnippet(
        parsed.meta?.challenge || extractFirstQuizChallenge(raw),
        lang
    );
    const block = [header, desc, body, quiz].filter(Boolean).join('\n\n');
    return clipText(block, maxChars);
}

/** Network / HTTP load failures must not become Sage "evidence". */
export function isUnusableLessonContent(raw, ui = {}) {
    const t = String(raw || '').trim();
    if (!t) return true;
    const markers = [
        ui.nostrLessonLoadEmpty,
        ui.nostrLessonLoadError,
        '(Lesson could not be loaded.)',
        '(This lesson had no text on the network.)',
        'Error loading lesson from the network.',
        'Could not load this lesson from peers. Try again or check your connection.',
        'No se pudo cargar la lección desde la red. Prueba de nuevo o revisa la conexión.',
        '(Esta lección no tenía texto en la red.)',
        'Error loading content. Please check internet connection.',
    ]
        .map((s) => String(s || '').trim())
        .filter(Boolean);
    return markers.some((m) => t === m);
}
