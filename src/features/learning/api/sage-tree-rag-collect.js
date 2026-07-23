/**
 * Collect lesson evidence from the active curriculum tree for Sage dynamic (RAG) mode.
 */

import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import {
    expandQueryByProductVocab,
    collectVocabFromTreeRoot,
    setProductVocab,
    matchVocabByQueryPrefix,
} from './sage-app-stems.js';
import {
    ARBORITO_APP_QUERY_RE,
    clipText,
    extractFirstQuizChallenge,
    formatAuthorQuizSnippet,
    isMetaAppQuestion,
    isUnusableLessonContent,
    normalizeForMatch,
    queryTerms,
    scoreTextMatch,
    stripQuizBlocksFromMarkdown,
} from './sage-tree-rag-intent.js';

/** Bundled demo tree (static); built once per session on first Sage chat. */
let cachedArboritoDemoRoot = null;
/** @type {Promise<object>|null} */
let demoRootLoadPromise = null;

function loadBundledDemoTreeRoot() {
    if (cachedArboritoDemoRoot) return Promise.resolve(cachedArboritoDemoRoot);
    if (!demoRootLoadPromise) {
        demoRootLoadPromise = import('../../../core/demo/load-arborito-demo.js').then((mod) => {
            cachedArboritoDemoRoot = mod.buildDemoBranchData();
            setProductVocab(collectVocabFromTreeRoot(cachedArboritoDemoRoot), { merge: true });
            return cachedArboritoDemoRoot;
        });
    }
    return demoRootLoadPromise;
}

const DEMO_ANCHOR_NAME_RE = {
    EN: /\b(welcome|what is arborito|navigate|arcade|memory|construction|forest|sage)\b/i,
    ES: /\b(bienvenida|qué es arborito|que es arborito|navegar|arcade|memoria|construcci|bosque|sage)\b/i,
};

/** Small char/node caps so demo docs ride along without crowding course RAG. */
export function resolveArboritoDemoRagBudget(preset, query) {
    const boost = ARBORITO_APP_QUERY_RE.test(String(query || ''));
    const p = String(preset || 'minimal');
    if (p === 'micro') {
        return { maxNodes: boost ? 4 : 3, maxChars: boost ? 1500 : 1100, anchorMaxChars: 850 };
    }
    if (p === 'balanced') {
        return { maxNodes: boost ? 6 : 4, maxChars: boost ? 2800 : 2200, anchorMaxChars: 1100 };
    }
    return { maxNodes: boost ? 5 : 4, maxChars: boost ? 2400 : 1800, anchorMaxChars: 950 };
}

function resolveTreeRoot(rawGraph, lang, treeRoot) {
    const pickLang = (graph) => {
        if (!graph?.languages || typeof graph.languages !== 'object') return null;
        const L = String(lang || 'EN').toUpperCase();
        return graph.languages[L] || graph.languages[Object.keys(graph.languages)[0]] || null;
    };
    if (treeRoot && typeof treeRoot === 'object') {
        /* Bundled demo / raw graphs are multi-lang; unwrap before walking leaves. */
        const fromLangs = pickLang(treeRoot);
        if (fromLangs) return fromLangs;
        return treeRoot;
    }
    return pickLang(rawGraph);
}

function pathLabel(node) {
    return String(node.path || node.name || node.id || 'Lesson');
}

/** Strip Arborito structural tags so definition prose stays readable for the model. */
function stripLessonMarkupForSnippet(md) {
    let s = stripQuizBlocksFromMarkdown(String(md || ''));
    s = s.replace(/@image[\s\S]*?@\/image/gi, ' ');
    s = s.replace(/@section[\s\S]*?@\/section/gi, ' ');
    s = s.replace(/@info[\s\S]*?@\/info/gi, ' ');
    s = s.replace(/^>.*$/gm, '');
    return s.replace(/\s+/g, ' ').trim();
}

function lessonBodySnippet(parsed, maxChars, rawContent = '') {
    const body = stripLessonMarkupForSnippet(parsed?.body || rawContent || '');
    return clipText(body, maxChars);
}

/**
 * Lead definition for APP_HELP: first prose of the lesson (what X is), clearly labeled.
 * @param {object|null} parsed
 * @param {string} rawContent
 * @param {number} maxChars
 * @param {'EN'|'ES'|string} lang
 */
function lessonDefinitionBlock(parsed, rawContent, maxChars, lang, topicKey = '') {
    const title = String(parsed?.meta?.title || '').trim();
    const body = lessonBodySnippet(parsed, maxChars, rawContent);
    if (!body) return '';
    const header = lang === 'ES' ? '[Definición de la función]' : '[Feature definition]';
    const fact =
        topicKey === 'bosque' || topicKey === 'forest'
            ? lang === 'ES'
                ? 'Hecho clave: El Bosque es el archivador de tus ramas (abrir, importar un .arborito, o plantar rama nueva). No es el mapa de lecciones ni el progreso.'
                : 'Key fact: The Forest is the filing cabinet for your branches (open, import a .arborito, or plant a new branch). It is not the lesson map or progress view.'
            : topicKey === 'arcade'
              ? lang === 'ES'
                  ? 'Hecho clave: Arcade son minijuegos dentro de Arborito que usan las preguntas de tus lecciones (no son apps aparte).'
                  : 'Key fact: Arcade is mini-games inside Arborito that use your lesson questions (not separate apps).'
              : topicKey === 'file'
                ? lang === 'ES'
                    ? 'Hecho clave: Un archivo .arborito es un curso empaquetado para compartir/importar en el Bosque (no es el nombre de la app).'
                    : 'Key fact: A .arborito file is a packaged course you share/import in the Forest (not the app name itself).'
                : topicKey === 'arborito'
                  ? lang === 'ES'
                      ? 'Hecho clave: Arborito es la app de Treesys para aprender con mapa, práctica y juegos.'
                      : 'Key fact: Arborito is the Treesys app for learning with a map, practice, and games.'
                  : '';
    return [header, fact, title, body].filter(Boolean).join('\n');
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

    /* Phase 1: cheap score on title/path/description only (no full-body parse). */
    const lightScored = leaves.map((node) => {
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
        const title = String(node.name || '');
        const desc = String(node.description || '');
        const termScore = scoreTextMatch([title, desc, path].join(' '), terms);
        score += termScore;
        const rawContent = isUnusableLessonContent(node.content || '', opts.ui || {})
            ? ''
            : (node.content || '');
        if (!rawContent && !desc && !title) score -= 80;
        else if (rawContent) score += Math.min(15, Math.floor(String(rawContent).length / 800));
        return { node, score, termScore, rawContent };
    });
    lightScored.sort((a, b) => b.score - a.score);

    /* Phase 2: parse only top candidates — avoids O(leaves × lesson) on the UI thread. */
    const parseCap = Math.min(leaves.length, Math.max(maxNodes * 4, 36));
    const toParse = lightScored.slice(0, parseCap);

    const scored = toParse.map(({ node, score: lightScore, termScore: lightTerm, rawContent }) => {
        let score = lightScore;
        const parsed = parseArboritoFile(rawContent);
        const safeBody = stripQuizBlocksFromMarkdown(parsed.body || rawContent);
        const title = String(parsed.meta.title || node.name || '');
        const desc = String(node.description || parsed.meta.description || '');
        const bodyPlain = String(safeBody || '').replace(/\s+/g, ' ').trim();
        const path = String(node.path || node.name || '');
        const quizPlain = formatAuthorQuizSnippet(
            parsed.meta?.challenge || extractFirstQuizChallenge(rawContent),
            lang
        );
        const termScore = scoreTextMatch([title, desc, bodyPlain, quizPlain, path].join(' '), terms);
        /* Replace light term score with body-aware score. */
        score = score - lightTerm + termScore;
        if (!bodyPlain && !desc && !title) score -= 80;
        return { node, parsed, score, termScore, rawContent };
    });
    scored.sort((a, b) => b.score - a.score);

    const blocks = [];
    let used = 0;
    let bestScore = 0;
    for (const { node, parsed, score, termScore, rawContent } of scored) {
        if (blocks.length >= maxNodes) break;
        const isFocus = focusNodeId && String(node.id) === String(focusNodeId);
        if (score < 1 && terms.length > 0) continue;
        /* Require at least one query-term hit unless this is the open focus lesson —
         * otherwise long paths inflate scores and unrelated leaves leak into CONTEXT. */
        if (terms.length > 0 && !isFocus && termScore < 12) continue;
        /* Vague queries (only stopwords) must not dump random lessons, keep
         * only the focus node and its siblings (score ≥ 40 from parent boost). */
        if (terms.length === 0 && !isFocus && score < 40) continue;
        if (excludeNodeId && String(node.id) === String(excludeNodeId)) continue;
        if (node.content && !rawContent) continue;

        const bodyLimit = isFocus ? 2800 : 900;
        const body = lessonBodySnippet(parsed, bodyLimit, rawContent);
        const desc = String(node.description || parsed.meta.description || '').trim();
        const title = String(parsed.meta.title || node.name || '').trim();
        const quiz = formatAuthorQuizSnippet(
            parsed.meta?.challenge || extractFirstQuizChallenge(rawContent),
            lang
        );
        const snippet = [title, desc, body, quiz].filter(Boolean).join('\n');
        if (!snippet) continue;

        const defaultLabel = lang === 'ES' ? 'Lección relacionada' : 'Related lesson';
        const label = opts.relatedLabel || defaultLabel;
        const block = `[${label}: ${pathLabel(node)}]\n${snippet}`;
        if (used + block.length > maxChars && blocks.length > 0) break;
        blocks.push(block);
        used += block.length;
        if (score > bestScore) bestScore = score;
    }

    return { blocks, text: blocks.join('\n\n---\n\n'), bestScore };
}

function buildDemoAnchorSnippet(demoRoot, lang, maxChars, nameFilterRe = null, topicKey = '') {
    if (!demoRoot || !maxChars) return '';
    const root = resolveTreeRoot(null, lang, demoRoot);
    if (!root) return '';
    const anchorRe = DEMO_ANCHOR_NAME_RE[lang === 'ES' ? 'ES' : 'EN'];
    const leaves = [];
    const walk = (n) => {
        if (!n) return;
        if (n.type === 'leaf' || n.type === 'exam') leaves.push(n);
        if (n.children) n.children.forEach(walk);
    };
    walk(root);

    const ranked = leaves
        .map((node) => {
            const name = String(node.name || '');
            const path = String(node.path || name);
            const blob = normalizeForMatch(`${name} ${path}`);
            let score = anchorRe.test(blob) ? 80 : 0;
            if (nameFilterRe && nameFilterRe.test(blob)) score += 120;
            if (/welcome|bienvenida|what is|que es|arborito/i.test(blob)) score += 40;
            /* Prefer Bosque lesson when asking about .arborito files. */
            if (topicKey === 'file' && /\b(bosque|forest)\b/i.test(blob)) score += 80;
            return { node, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);

    const label = lang === 'ES' ? 'Guía Arborito' : 'Arborito guide';
    const blocks = [];
    let used = 0;
    /* Prefer the single best lesson for “qué es X”; second lesson only if budget allows. */
    const maxLeaves = nameFilterRe ? 1 : 2;
    const bodyChars = nameFilterRe ? 1100 : 720;
    for (const { node } of ranked) {
        if (blocks.length >= maxLeaves) break;
        const parsed = parseArboritoFile(node.content || '');
        const desc = String(node.description || parsed.meta.description || '').trim();
        const title = String(parsed.meta.title || node.name || '').trim();
        const definition = lessonDefinitionBlock(
            { ...parsed, meta: { ...parsed.meta, title } },
            node.content || '',
            bodyChars,
            lang,
            topicKey
        );
        const snippet = [definition, desc ? (lang === 'ES' ? `Resumen: ${desc}` : `Summary: ${desc}`) : '']
            .filter(Boolean)
            .join('\n');
        if (!snippet) continue;
        const block = `[${label}: ${pathLabel(node)}]\n${snippet}`;
        if (used + block.length > maxChars && blocks.length) break;
        blocks.push(block);
        used += block.length;
    }
    return blocks.join('\n\n---\n\n');
}

/**
 * Minimal always-on RAG from bundled Arborito demo (app documentation).
 * @param {string} lang
 * @param {string} query
 * @param {string} [preset]
 * @param {{ force?: boolean, asAppKnowledgeOnly?: boolean }} [opts]
 *   force=true when intent is APP_HELP
 *   asAppKnowledgeOnly=true when the bundled demo is NOT the loaded curriculum —
 *   frames snippets as product help so Sage does not treat them as the open course.
 */
export async function collectArboritoDemoRagBlock(lang = 'EN', query = '', preset = 'minimal', opts = {}) {
    let demoRoot = null;
    try {
        demoRoot = await loadBundledDemoTreeRoot();
    } catch (_) {
        demoRoot = null;
    }
    if (demoRoot) {
        setProductVocab(collectVocabFromTreeRoot(demoRoot), { merge: true });
    }

    const qRaw = String(query || '');
    const q = expandQueryByProductVocab(qRaw);
    const force = !!opts?.force;
    const asAppKnowledgeOnly = !!opts?.asAppKnowledgeOnly;
    const metaApp = isMetaAppQuestion(qRaw) || isMetaAppQuestion(q);
    const vocabHits = matchVocabByQueryPrefix(qRaw);
    const wantsAppDocs =
        force || metaApp || ARBORITO_APP_QUERY_RE.test(q) || vocabHits.length > 0;
    const terms = queryTerms(q);
    const vagueQuery = terms.length === 0;
    /* Pure course questions should not pull bundled Arborito demo docs into context. */
    if (!wantsAppDocs && terms.length >= 2 && !vagueQuery) {
        return '';
    }

    const budget = resolveArboritoDemoRagBudget(preset, wantsAppDocs ? `${q} arborito` : q);
    /* Focused “qué es Arcade/Bosque” needs room for the definitional lesson. */
    const focusedAnchorBudget = Math.max(budget.anchorMaxChars, 1600);
    let body = '';
    let focusedTopic = false;

    const pullWelcomeAnchor = () =>
        buildDemoAnchorSnippet(
            demoRoot,
            lang,
            focusedAnchorBudget,
            /\b(que es arborito|what is arborito|bienvenida|welcome|arborito)\b/i,
            'arborito'
        );

    const isFileQuery =
        /\.arborito\b/i.test(q)
        || /\barchivo\b.{0,24}\.?arborito\b/i.test(q)
        || /\b(formato|extensi[oó]n|exportar|importar|empaquet)\b.{0,40}\.?arborito\b/i.test(q);

    /* Anchor-first: file format before generic arborito; then product topics. */
    if (demoRoot) {
        const hitBlob = vocabHits.join(' ');
        if (isFileQuery) {
            body = buildDemoAnchorSnippet(
                demoRoot,
                lang,
                focusedAnchorBudget,
                /\b(bosque|forest|exportar|importar|construcci|construction)\b/i,
                'file'
            );
            focusedTopic = true;
        } else if (/\barcade\b/i.test(q) || /\barcade\b/i.test(hitBlob)) {
            body = buildDemoAnchorSnippet(demoRoot, lang, focusedAnchorBudget, /\barcade\b/i, 'arcade');
            focusedTopic = true;
        } else if (/\b(bosque|forest)\b/i.test(q) || /\b(bosque|forest)\b/i.test(hitBlob)) {
            body = buildDemoAnchorSnippet(
                demoRoot,
                lang,
                focusedAnchorBudget,
                /\b(bosque|forest)\b/i,
                'bosque'
            );
            focusedTopic = true;
        } else if (/\b(construcci[oó]n|construction)\b/i.test(q) || /construcc/i.test(hitBlob)) {
            body = buildDemoAnchorSnippet(
                demoRoot,
                lang,
                focusedAnchorBudget,
                /\b(construcci|construction)\b/i,
                'construccion'
            );
            focusedTopic = true;
        } else if (
            /\b(mochila|backpack|jard[ií]n|memory\s*garden)\b/i.test(q)
            || /\b(mochila|backpack|jardin)\b/i.test(hitBlob)
        ) {
            body = buildDemoAnchorSnippet(
                demoRoot,
                lang,
                focusedAnchorBudget,
                /\b(mochila|backpack|jardin|memory|garden|semilla|logro)\b/i,
                'mochila'
            );
            focusedTopic = true;
        } else if (/\bsage\b/i.test(q) && !/\barborito\b/i.test(q) && !metaApp && !/\baplicaci[oó]n\b/i.test(q)) {
            body = buildDemoAnchorSnippet(demoRoot, lang, focusedAnchorBudget, /\bsage\b/i, 'sage');
            focusedTopic = true;
        } else if (
            /\barborito\b/i.test(q)
            || /\barborito\b/i.test(hitBlob)
            || /\b(bienvenida|welcome)\b/i.test(q)
            || metaApp
            || force
            || /\baplicaci[oó]n\b/i.test(q)
        ) {
            body = pullWelcomeAnchor();
            focusedTopic = true;
        }
    }

    /*
     * Focused definitional lesson when we know the product topic.
     * If that miss (empty), fall back to broad demo RAG — never starve APP_HELP.
     */
    if (demoRoot && (!focusedTopic || !body)) {
        const relatedLabel =
            asAppKnowledgeOnly
                ? lang === 'ES'
                    ? 'Ayuda de la app (no es el curso)'
                    : 'App help (not the course)'
                : lang === 'ES'
                  ? 'Guía Arborito'
                  : 'Arborito guide';
        const rag = collectTreeRagEvidence(null, lang, {
            treeRoot: demoRoot,
            query: wantsAppDocs && !/\barborito\b/i.test(q) ? `${q} arborito` : q,
            maxNodes: focusedTopic ? Math.min(3, budget.maxNodes) : budget.maxNodes,
            maxChars: focusedTopic ? Math.min(1400, budget.maxChars) : budget.maxChars,
            relatedLabel,
        });
        const ragText = String(rag.text || '').trim();
        if (ragText) {
            body = body ? `${body}\n\n---\n\n${ragText}` : ragText;
        }
    }

    /* APP_HELP / “qué es esto” must not return empty — welcome docs are the floor. */
    if (!body && demoRoot && wantsAppDocs) {
        body = pullWelcomeAnchor();
    }

    if (!body) return '';

    if (asAppKnowledgeOnly) {
        const header =
            lang === 'ES'
                ? '[Ayuda de la aplicación Arborito — NO es el curso cargado]'
                : '[Arborito application help — NOT the loaded course]';
        const notice =
            lang === 'ES'
                ? 'AVISO: Lo siguiente es conocimiento del producto Arborito (cómo funciona la app). NO es el temario ni la rama que el usuario tiene abierta. No digas que está estudiando el «curso Arborito» / demo / Bienvenida. Respondé como ayuda de la app.'
                : 'NOTICE: The following is Arborito product knowledge (how the app works). It is NOT the syllabus or branch the user has open. Do not say they are studying the “Arborito course” / demo / Welcome trail. Answer as app help.';
        return `${header}\n${notice}\n${body}`;
    }

    const header =
        lang === 'ES'
            ? '[Documentación de la app Arborito (demo empaquetado)]'
            : '[Arborito app documentation (bundled demo)]';
    return `${header}\n${body}`;
}
