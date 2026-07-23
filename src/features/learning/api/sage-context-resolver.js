/**
 * Intelligent Sage context plan: tree search + session focus + intent (no prompt hacks).
 */

import {
    expandSageRagQuery,
    resolveSageIntentQuery,
    isCasualSageGreeting,
    isMetaAppQuestion,
    wantsModuleOutline,
    buildModuleOverviewBlock,
    findNodeById,
    findParentBranch,
    collectTreeRagEvidence,
    queryTerms,
} from './sage-tree-rag.js';
import { matchVocabByQueryPrefix, expandQueryByProductVocab } from './sage-app-stems.js';
import { DEMO_BRANCH_ID, DEMO_BRANCH_UNIVERSE } from '../../../core/demo/arborito-demo-ids.js';
import { isBundledDemoBranchId } from '../../publishing/api/demo-tree-guard.js';

export const SAGE_INTENT = {
    GREETING: 'greeting',
    NAV_OUTLINE: 'nav_outline',
    LESSON_QA: 'lesson_qa',
    APP_HELP: 'app_help',
    GENERAL: 'general',
};

const ARBORITO_APP_TERMS =
    /\b(arborito|sage|arcade|memory\s*garden|jard[ií]n|construcci[oó]n|construction|bosque|forest|backpack|mochila|flatpak|aplicaci[oó]n)\b/i;

const SHORT_APP_FOLLOWUP_RE = /^(y|e|and)\s+\S/i;

const FOLLOWUP_RE =
    /\b(pero|eso|esa|este|esta|esto|ah[ií]|dentro|all[ií]|m[aá]s|otra|otro|refiero|quiero decir|me refiero|y eso|clarifica)\b/i;

const NAV_HINT_RE =
    /\b(dentro|contenido|temas|lecciones|submodulo|sub-?m[oó]dulo|estructura|incluye|lista|listar|cu[aá]ntos|qu[eé]\s+hay|que\s+hay|qu[eé]\s+trata|que\s+trata|m[oó]dulo|module|cap[ií]tulo|secci[oó]n|partes|componentes|navegar|mapa|árbol|arbol|rama|branch)\b/i;

/** True when the mounted curriculum is the bundled Arborito demo (or none yet). */
export function isSageDemoCurriculum(activeSource, rawGraph) {
    if (!activeSource && !rawGraph) return false;
    if (isBundledDemoBranchId(activeSource?.id)) return true;
    const url = String(activeSource?.url || '').trim();
    if (url.startsWith('branch://') && isBundledDemoBranchId(url.slice('branch://'.length).split('/')[0])) {
        return true;
    }
    const universeId = String(rawGraph?.universeId || rawGraph?.meta?.universeId || '').trim();
    return universeId === DEMO_BRANCH_UNIVERSE || universeId === DEMO_BRANCH_ID;
}

function clipText(text, maxChars) {
    const s = String(text || '');
    if (!Number.isFinite(maxChars) || maxChars <= 0 || s.length <= maxChars) return s;
    return s.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

function normalizeForMatch(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Strip intent/filler words so "qué hay dentro de entorno y scripting" → "entorno scripting". */
function extractQueryFocus(query) {
    let s = normalizeForMatch(query);
    s = s.replace(
        /\b(explicame|explicar|explica|que trata|trata|sobre|del|de la|de el|el|la|los|las|un|una|please|explain|about|what|does|cover|covers|habla|cuentame|dime|decime|dentro|hay|que hay|qu[eé] hay|modulo|module|capitulo|chapter)\b/g,
        ' '
    );
    return s.replace(/\s+/g, ' ').trim();
}

function flattenCatalog(treeRoot, lang) {
    const langUpper = String(lang || 'EN').toUpperCase();
    const out = [];
    const seen = new WeakSet();
    const walk = (node, parts) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        const name = String(node.name || '').trim();
        const partsNext = node.type === 'root' ? parts : [...parts, name];
        const path = String(node.path || partsNext.filter(Boolean).join(' / ')).trim();
        if (node.type === 'branch' || node.type === 'leaf' || node.type === 'exam') {
            out.push({
                node,
                id: String(node.id),
                type: node.type,
                name,
                path,
                desc: String(node.description || '').trim(),
                lang: langUpper,
            });
        }
        if (Array.isArray(node.children)) node.children.forEach((c) => walk(c, partsNext));
    };
    walk(treeRoot, []);
    return out;
}

function scoreCatalogEntry(entry, query, terms) {
    const blob = `${entry.name} ${entry.path} ${entry.desc}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
        if (blob.includes(term)) score += 14;
    }
    const qNorm = String(query || '').toLowerCase();
    const nameNorm = normalizeForMatch(entry.name);
    if (entry.name && qNorm.includes(entry.name.toLowerCase())) score += 90;
    if (entry.path && qNorm.includes(entry.path.toLowerCase().slice(-40))) score += 50;

    const focus = extractQueryFocus(query);
    if (focus && focus.length >= 4) {
        if (nameNorm.includes(focus) || focus.includes(nameNorm)) score += 120;
        const focusToks = focus.split(' ').filter((t) => t.length >= 3);
        const matched = focusToks.filter((t) => nameNorm.includes(t));
        if (focusToks.length >= 2 && matched.length >= 2) score += 90;
        else if (matched.length === 1 && focusToks.length === 1) score += 60;
    }

    if (entry.type === 'branch' && NAV_HINT_RE.test(qNorm)) score += 18;
    if (entry.type === 'leaf' || entry.type === 'exam') score += 4;
    return score;
}

function isFollowUpQuery(lastMsg, messages) {
    const t = String(lastMsg || '').trim();
    if (t.length > 120) return false;
    if (SHORT_APP_FOLLOWUP_RE.test(t)) return false;
    if (!FOLLOWUP_RE.test(t)) return false;
    return Array.isArray(messages) && messages.some((m) => m?.role === 'user');
}

function extractAppTopic(text) {
    const hits = matchVocabByQueryPrefix(text);
    if (!hits.length) {
        const expanded = expandQueryByProductVocab(String(text || ''));
        if (/\barcade\b/i.test(expanded)) return 'arcade';
        if (/\b(bosque|forest)\b/i.test(expanded)) return 'forest';
        if (/\b(construcci|construction)\b/i.test(expanded)) return 'construction';
        if (/\b(mochila|backpack|jardin|garden)\b/i.test(expanded)) return 'backpack';
        if (/\barborito\b/i.test(expanded)) return 'arborito';
        if (/\bsage\b/i.test(expanded)) return 'sage';
        return null;
    }
    const blob = hits.join(' ');
    if (/\barcade\b/i.test(blob)) return 'arcade';
    if (/\b(bosque|forest)\b/i.test(blob)) return 'forest';
    if (/construcc|construction/i.test(blob)) return 'construction';
    if (/\b(mochila|backpack|jardin|garden)\b/i.test(blob)) return 'backpack';
    if (/\barborito\b/i.test(blob)) return 'arborito';
    if (/\bsage\b/i.test(blob)) return 'sage';
    /* Prefer the longest vocab hit as a soft topic label. */
    return [...hits].sort((a, b) => b.length - a.length)[0] || null;
}

function inferIntent({
    lastMsg,
    intentQuery,
    intentBranchScore,
    intentLeafScore,
    sessionFocus,
    contextNode,
    wantsOutline,
    messages,
}) {
    if (isCasualSageGreeting(lastMsg)) return SAGE_INTENT.GREETING;

    const raw = String(lastMsg || '');
    const metaApp = isMetaAppQuestion(lastMsg) || isMetaAppQuestion(intentQuery);
    /* Prefer the raw user turn for product hits — intentQuery often injects "arborito"
     * for bosque/forest and would steal course questions into APP_HELP. */
    const shortAppFollow =
        SHORT_APP_FOLLOWUP_RE.test(raw)
        && (
            ARBORITO_APP_TERMS.test(raw)
            || matchVocabByQueryPrefix(lastMsg).length > 0
        );
    const appHit =
        metaApp
        || ARBORITO_APP_TERMS.test(raw)
        || matchVocabByQueryPrefix(lastMsg).length > 0;
    const courseHit = intentBranchScore >= 24 || intentLeafScore >= 24;
    const appTopicFollow =
        isFollowUpQuery(lastMsg, messages)
        && !!sessionFocus?.appTopic
        && !courseHit;

    /* Never let product-vocab / appQuestion override a strong course catalog match. */
    if (
        (metaApp && !courseHit)
        || appTopicFollow
        || shortAppFollow
        || (appHit && !courseHit)
    ) {
        if (!wantsOutline || appHit || shortAppFollow || metaApp || appTopicFollow) {
            return SAGE_INTENT.APP_HELP;
        }
    }

    if (wantsOutline || NAV_HINT_RE.test(raw)) {
        if (intentBranchScore >= 14 || sessionFocus?.branchId) return SAGE_INTENT.NAV_OUTLINE;
    }
    /* Session follow-ups alone must not force outline over a strong lesson match. */
    if (
        sessionFocus?.branchId &&
        isFollowUpQuery(lastMsg, messages) &&
        intentLeafScore < 20 &&
        (intentBranchScore >= 10 || !contextNode || (contextNode.type !== 'leaf' && contextNode.type !== 'exam'))
    ) {
        return SAGE_INTENT.NAV_OUTLINE;
    }

    if (intentLeafScore >= 30) {
        return SAGE_INTENT.LESSON_QA;
    }
    /* Open lesson alone must not force LESSON_QA for unrelated questions —
     * that stuffed the wrong body into CONTEXT. Prefer GENERAL / nav unless
     * the leaf scored or the user is clearly on-topic. */
    if (
        contextNode &&
        (contextNode.type === 'leaf' || contextNode.type === 'exam') &&
        intentLeafScore >= 14
    ) {
        return SAGE_INTENT.LESSON_QA;
    }

    return SAGE_INTENT.GENERAL;
}

function buildCourseMapBlock(treeRoot, lang, maxChars) {
    if (!treeRoot?.children?.length) return '';
    const header = lang === 'ES' ? '[Mapa del curso]' : '[Course map]';
    const lines = [header];
    for (const child of treeRoot.children) {
        if (!child || child.type !== 'branch') continue;
        const name = String(child.name || child.id || '').trim();
        const desc = String(child.description || '').trim();
        let countHint = '';
        if (Array.isArray(child.children)) {
            const leaves = child.children.filter((c) => c && (c.type === 'leaf' || c.type === 'exam')).length;
            const subs = child.children.filter((c) => c && c.type === 'branch').length;
            if (leaves || subs) {
                countHint =
                    lang === 'ES'
                        ? ` (${subs ? `${subs} submódulos, ` : ''}${leaves} lecciones)`
                        : ` (${subs ? `${subs} submodules, ` : ''}${leaves} lessons)`;
            }
        }
        lines.push(`- ${name}${desc ? `: ${desc}` : ''}${countHint}`);
    }
    return clipText(lines.join('\n'), maxChars);
}

/**
 * Resolve what Sage needs from the tree + session (not regex prompt patches).
 * @param {object} opts
 * @returns {object}
 */
export function resolveSageContextPlan({
    lastMsg,
    messages = [],
    treeRoot,
    contextNode = null,
    lang = 'EN',
    sessionFocus = null,
    moduleBudget = 2400,
    mapBudget = 1200,
    activeSourceId = null,
    isDemoCurriculum = false,
}) {
    const ragQuery = expandSageRagQuery(lastMsg, messages);
    const intentQuery = resolveSageIntentQuery(lastMsg, messages);
    const ragTerms = queryTerms(ragQuery);
    const intentTerms = queryTerms(intentQuery);
    const wantsOutline = wantsModuleOutline(String(lastMsg || '')) || NAV_HINT_RE.test(String(lastMsg || ''));
    const sourceKey = activeSourceId != null ? String(activeSourceId) : '';

    /* Drop focus bound to a previous curriculum source. */
    let focus = sessionFocus;
    if (
        focus?.sourceId
        && sourceKey
        && String(focus.sourceId) !== sourceKey
    ) {
        focus = null;
    }

    const stampFocus = (partial) => ({
        ...partial,
        sourceId: sourceKey || partial?.sourceId || null,
    });

    const empty = {
        intent: SAGE_INTENT.GENERAL,
        query: ragQuery,
        intentQuery,
        focusNode: null,
        moduleBranch: null,
        moduleBlock: '',
        courseMapBlock: '',
        focusParentId: null,
        includeActiveLesson: true,
        includeCourseRag: true,
        includeDemoRag: false,
        sessionPatch: null,
    };

    if (!treeRoot) {
        const meta = isMetaAppQuestion(lastMsg);
        const rawApp = ARBORITO_APP_TERMS.test(String(lastMsg || ''));
        empty.intent = isCasualSageGreeting(lastMsg)
            ? SAGE_INTENT.GREETING
            : meta || (isDemoCurriculum && rawApp)
              ? SAGE_INTENT.APP_HELP
              : SAGE_INTENT.GENERAL;
        /* Mid-hydrate of a non-demo tree: do not fall back to bundled demo lessons. */
        empty.includeDemoRag =
            empty.intent === SAGE_INTENT.APP_HELP
            && (isDemoCurriculum || meta || !sourceKey);
        empty.includeCourseRag = false;
        empty.includeActiveLesson = false;
        return empty;
    }

    const catalog = flattenCatalog(treeRoot, lang);
    let bestBranch = null;
    let bestBranchScore = 0;
    let bestLeaf = null;
    let bestLeafScore = 0;
    let intentBranchScore = 0;
    let intentLeafScore = 0;

    const outlineQuery = wantsOutline ? String(lastMsg || '') : ragQuery;
    const outlineTerms = queryTerms(outlineQuery);

    for (const entry of catalog) {
        const ragScore = scoreCatalogEntry(entry, outlineQuery, outlineTerms);
        const iScore = scoreCatalogEntry(entry, intentQuery, intentTerms);
        if (entry.type === 'branch') {
            if (ragScore > bestBranchScore) {
                bestBranchScore = ragScore;
                bestBranch = entry.node;
            }
            if (iScore > intentBranchScore) intentBranchScore = iScore;
        }
        if (entry.type === 'leaf' || entry.type === 'exam') {
            if (ragScore > bestLeafScore) {
                bestLeafScore = ragScore;
                bestLeaf = entry.node;
            }
            if (iScore > intentLeafScore) intentLeafScore = iScore;
        }
    }

    let sessionBranch = focus?.branchId
        ? findNodeById(treeRoot, focus.branchId)
        : null;
    if (sessionBranch?.type !== 'branch') sessionBranch = null;

    const followUp = isFollowUpQuery(lastMsg, messages);
    if (followUp && sessionBranch && bestBranchScore < 30) {
        bestBranch = sessionBranch;
        bestBranchScore = Math.max(bestBranchScore, 45);
    }

    const intent = inferIntent({
        lastMsg,
        intentQuery,
        intentBranchScore,
        intentLeafScore,
        sessionFocus: focus,
        contextNode,
        wantsOutline,
        messages,
    });

    if (intent === SAGE_INTENT.GREETING) {
        return { ...empty, intent, includeCourseRag: false, includeActiveLesson: false };
    }

    if (intent === SAGE_INTENT.APP_HELP) {
        const meta = isMetaAppQuestion(lastMsg);
        /* On a real course, keep course RAG as appendix — demo docs alone felt like
         * Sage was still answering about the Arborito demo after a branch switch. */
        const exclusiveAppDocs = isDemoCurriculum || meta;
        return {
            ...empty,
            intent,
            includeDemoRag: true,
            includeCourseRag: !exclusiveAppDocs,
            includeActiveLesson: false,
            sessionPatch: {
                sageNavFocus: stampFocus({
                    branchId: focus?.branchId || null,
                    nodeId: focus?.nodeId || null,
                    path: focus?.path || null,
                    appTopic:
                        extractAppTopic(intentQuery)
                        || extractAppTopic(lastMsg)
                        || (meta ? 'arborito' : null)
                        || focus?.appTopic
                        || null,
                }),
            },
        };
    }

    let focusNode = null;
    if (bestLeafScore >= 40 || (ragTerms.length && bestLeafScore >= 28)) {
        focusNode = bestLeaf;
    } else if (
        intent === SAGE_INTENT.LESSON_QA &&
        contextNode &&
        (contextNode.type === 'leaf' || contextNode.type === 'exam')
    ) {
        focusNode = findNodeById(treeRoot, contextNode.id) || null;
    } else if (
        intentLeafScore >= 14 &&
        contextNode &&
        (contextNode.type === 'leaf' || contextNode.type === 'exam')
    ) {
        focusNode = findNodeById(treeRoot, contextNode.id) || null;
    }

    let moduleBranch = null;
    if (intent === SAGE_INTENT.NAV_OUTLINE) {
        moduleBranch =
            (bestBranchScore >= 14 ? bestBranch : null)
            || sessionBranch
            || (focusNode ? findParentBranch(treeRoot, focusNode.id) : null)
            || (contextNode?.type === 'branch' ? findNodeById(treeRoot, contextNode.id) : null);
    } else if (bestBranchScore >= 55) {
        moduleBranch = bestBranch;
    } else if (focusNode) {
        moduleBranch = findParentBranch(treeRoot, focusNode.id);
    }

    const outlineMode = intent === SAGE_INTENT.NAV_OUTLINE || wantsOutline;
    const moduleBlock =
        moduleBranch && (intent === SAGE_INTENT.NAV_OUTLINE || wantsOutline || bestBranchScore >= 40)
            ? buildModuleOverviewBlock(moduleBranch, lang, moduleBudget, outlineMode)
            : '';

    const courseMapBlock =
        intent === SAGE_INTENT.NAV_OUTLINE && !moduleBlock
            ? buildCourseMapBlock(treeRoot, lang, mapBudget)
            : intent === SAGE_INTENT.GENERAL && ragTerms.length <= 2 && !focusNode
              ? buildCourseMapBlock(treeRoot, lang, Math.min(mapBudget, 800))
              : '';

    const focusParentId =
        focusNode?.parentId
        || (moduleBranch ? moduleBranch.id : null)
        || focus?.branchId
        || null;

    const sessionPatch = {
        sageNavFocus: stampFocus({
            branchId: moduleBranch?.id || sessionBranch?.id || focus?.branchId || null,
            nodeId: focusNode?.id || focus?.nodeId || null,
            path: moduleBranch?.path || focusNode?.path || focus?.path || null,
            appTopic: focus?.appTopic || null,
        }),
    };

    const includeActiveLesson =
        intent === SAGE_INTENT.LESSON_QA
        || (intent === SAGE_INTENT.GENERAL && !!focusNode);

    /* Demo product docs only on the demo curriculum, or explicit meta “what is this app”. */
    const includeDemoRag =
        intent === SAGE_INTENT.APP_HELP
        || (isDemoCurriculum && ARBORITO_APP_TERMS.test(String(lastMsg || '')) && !moduleBlock)
        || (isMetaAppQuestion(lastMsg) && !moduleBlock);

    return {
        intent,
        query: ragQuery,
        intentQuery,
        focusNode,
        moduleBranch,
        moduleBlock,
        courseMapBlock,
        focusParentId,
        includeActiveLesson,
        includeCourseRag: true,
        includeDemoRag,
        sessionPatch,
    };
}

/** Ranked course RAG using the same catalog scores (shared with preload). */
export function collectTreeRagFromPlan(rawGraph, lang, treeRoot, plan, opts = {}) {
    return collectTreeRagEvidence(rawGraph, lang, {
        treeRoot,
        query: plan.query,
        focusNodeId: plan.focusNode?.id || null,
        focusParentId: plan.focusParentId || null,
        excludeNodeId: opts.excludeNodeId || null,
        maxNodes: opts.maxNodes,
        maxChars: opts.maxChars,
    });
}
