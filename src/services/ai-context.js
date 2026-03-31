import { TreeUtils } from '../utils/tree-utils.js';

export const AI_CONTEXT_PRESETS = {
    micro: {
        historyMaxChars: 300,
        breadcrumbMaxChars: 80,
        evidenceMaxCharsStep1: 500,
        evidenceMaxCharsStep2: 500,
        hardCapTotalChars: 1200,
        maxTurns: 2
    },
    minimal: {
        historyMaxChars: 1800,
        breadcrumbMaxChars: 360,
        evidenceMaxCharsStep1: 1200,
        evidenceMaxCharsStep2: 2800,
        hardCapTotalChars: 5200,
        maxTurns: 6
    },
    balanced: {
        historyMaxChars: 3200,
        breadcrumbMaxChars: 600,
        evidenceMaxCharsStep1: 1800,
        evidenceMaxCharsStep2: 3600,
        hardCapTotalChars: 7600,
        maxTurns: 10
    }
};

export function resolveAiContextPreset(preset) {
    const key = String(preset || '').toLowerCase();
    if (key in AI_CONTEXT_PRESETS) return key;
    return 'minimal';
}

export function resolveAiContextBudgets(preset) {
    const key = resolveAiContextPreset(preset);
    return AI_CONTEXT_PRESETS[key] || AI_CONTEXT_PRESETS.minimal;
}

function clampStr(s, maxChars) {
    if (!s) return '';
    const str = String(s);
    if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
    if (str.length <= maxChars) return str;
    return str.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

function normalizeWhitespace(s) {
    return String(s || '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function trimHistory(messages, { maxTurns = 8, maxChars = 2500 } = {}) {
    const inMsgs = Array.isArray(messages) ? messages : [];
    if (inMsgs.length === 0) return [];

    const nonSystem = inMsgs.filter((m) => m && m.role !== 'system' && typeof m.content === 'string');
    const keepTail = nonSystem.slice(Math.max(0, nonSystem.length - maxTurns));

    const out = [];
    let used = 0;
    for (let i = keepTail.length - 1; i >= 0; i--) {
        const m = keepTail[i];
        const content = normalizeWhitespace(m.content);
        if (!content) continue;
        const remaining = maxChars - used;
        if (remaining <= 0) break;
        const clipped = clampStr(content, remaining);
        if (!clipped) continue;
        out.unshift({ role: m.role, content: clipped });
        used += clipped.length;
    }
    return out;
}

function tokenizeQuery(q) {
    const cleaned = String(q || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4);
    const uniq = [];
    const seen = new Set();
    for (const t of cleaned) {
        if (seen.has(t)) continue;
        seen.add(t);
        uniq.push(t);
    }
    return uniq.slice(0, 16);
}

function scoreParagraph(p, qTokens) {
    const text = String(p || '');
    if (!text) return 0;
    const lower = text.toLowerCase();
    let score = 0;
    for (const t of qTokens) {
        const idx = lower.indexOf(t);
        if (idx === -1) continue;
        score += 2;
        if (idx < 80) score += 1;
    }
    if (text.length > 80 && text.length < 900) score += 1;
    return score;
}

export function extractEvidence(fullText, userText, { maxChars = 2000, alwaysIncludeLead = true } = {}) {
    const content = normalizeWhitespace(fullText);
    if (!content) return { evidence: '', stats: { chunks: 0, used: 0 } };

    const qTokens = tokenizeQuery(userText);
    const paragraphs = content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) return { evidence: '', stats: { chunks: 0, used: 0 } };

    const scored = paragraphs.map((p, idx) => ({
        idx,
        text: p,
        score: qTokens.length ? scoreParagraph(p, qTokens) : 0
    }));
    scored.sort((a, b) => b.score - a.score);

    const picked = [];
    let used = 0;

    if (alwaysIncludeLead && paragraphs[0]) {
        const lead = paragraphs[0];
        const chunk = clampStr(lead, Math.max(0, maxChars - used));
        if (chunk) {
            picked.push(chunk);
            used += chunk.length;
        }
    }

    for (const item of scored) {
        if (used >= maxChars) break;
        if (item.score <= 0) break;
        if (alwaysIncludeLead && item.idx === 0) continue;
        const remaining = maxChars - used;
        const chunk = clampStr(item.text, remaining);
        if (!chunk) continue;
        if (picked.includes(chunk)) continue;
        picked.push(chunk);
        used += chunk.length;
    }

    const evidence = picked.join('\n\n---\n\n').trim();
    return { evidence, stats: { chunks: picked.length, used } };
}

function chainFromRootToTarget(root, targetId) {
    if (!root || targetId === undefined || targetId === null) return null;
    const want = String(targetId);
    let found = null;
    const walk = (node, prefix) => {
        const chain = prefix.concat(node);
        if (String(node.id) === want) {
            found = chain;
            return true;
        }
        const kids = node.children;
        if (!kids || kids.length === 0) return false;
        for (let i = 0; i < kids.length; i++) {
            if (walk(kids[i], chain)) return true;
        }
        return false;
    };
    walk(root, []);
    return found;
}

export function buildTreeBreadcrumb(store, contextNode, { maxChars = 500 } = {}) {
    const root = store?.state?.data;
    if (!root || !contextNode) return '';

    const id = contextNode.id;
    const target = TreeUtils.findNode(id, root) || contextNode;

    let chain = [];
    let cur = target;
    // Prefer parentId chain when available (lazy loaded children set it).
    while (cur) {
        chain.unshift(cur);
        cur = cur.parentId ? TreeUtils.findNode(cur.parentId, root) : null;
    }
    if (chain.length === 0 || String(chain[0]?.id) !== String(root.id)) {
        const walked = chainFromRootToTarget(root, target.id);
        if (walked && walked.length) chain = walked;
    }
    if (chain.length === 0) return '';

    const names = chain.map((n) => String(n.type === 'root' ? (store?.ui?.navHome || 'Home') : (n.name || '')).trim()).filter(Boolean);
    const breadcrumb = names.join(' / ');
    return clampStr(breadcrumb, maxChars);
}

function buildNodeHeader(store, node, { maxChars = 600 } = {}) {
    if (!node) return '';
    const ui = store?.ui;
    const name = String(node.type === 'root' ? (ui?.navHome || 'Home') : (node.name || '')).trim();
    const parts = [];
    parts.push(`ActiveNode: ${name || '(unnamed)'} (${node.type || 'unknown'})`);
    if (node.path) parts.push(`Path: ${String(node.path).trim()}`);
    if (node.description) parts.push(`About: ${String(node.description).trim()}`);
    return clampStr(parts.join('\n'), maxChars);
}

export function buildGlobalContextHeader({ lang = 'EN', appName = 'Arborito' } = {}) {
    const l = String(lang || 'EN').toUpperCase();
    if (l === 'ES') {
        return `App: ${appName}\nRole: Tutor\nNote: If there is no lesson evidence, answer with general knowledge and ask brief follow-ups only when needed.`;
    }
    return `App: ${appName}\nRole: Tutor\nNote: If there is no lesson evidence, answer with general knowledge and ask brief follow-ups only when needed.`;
}

export function buildContextPack({
    userText,
    messages,
    store,
    contextNode,
    preset = 'minimal',
    step = 1,
    includeGlobalHeader = true
} = {}) {
    const budgets = resolveAiContextBudgets(preset);
    const root = store?.state?.data;
    const node = contextNode && root ? (TreeUtils.findNode(contextNode.id, root) || contextNode) : contextNode;

    const trimmedMessages = trimHistory(messages, {
        maxTurns: budgets.maxTurns,
        maxChars: budgets.historyMaxChars
    });

    const breadcrumb = buildTreeBreadcrumb(store, node, { maxChars: budgets.breadcrumbMaxChars });
    const nodeHeader = buildNodeHeader(store, node, { maxChars: budgets.breadcrumbMaxChars });

    const evidenceBudget = step >= 2 ? budgets.evidenceMaxCharsStep2 : budgets.evidenceMaxCharsStep1;
    const { evidence } = extractEvidence(node?.content || '', userText, { maxChars: evidenceBudget, alwaysIncludeLead: true });

    let contextStr = '';
    if (includeGlobalHeader) {
        contextStr += buildGlobalContextHeader({ lang: store?.state?.lang, appName: store?.ui?.appTitle || 'Arborito' }) + '\n\n';
    }
    const headerBits = [nodeHeader, breadcrumb ? `Breadcrumb: ${breadcrumb}` : ''].filter(Boolean).join('\n');
    if (headerBits) contextStr += headerBits.trim() + '\n\n';
    if (evidence) contextStr += `Evidence:\n${evidence}`.trim();
    contextStr = normalizeWhitespace(contextStr);

    if (contextStr.length > budgets.hardCapTotalChars) {
        contextStr = clampStr(contextStr, budgets.hardCapTotalChars);
    }

    return {
        trimmedMessages,
        contextStr,
        meta: { preset: resolveAiContextPreset(preset), step }
    };
}

// ---------------------------------------------------------------------------
// Scripted-intelligence helpers: JS does the heavy reasoning so a dumb model
// only needs to paraphrase/format pre-digested facts.
// ---------------------------------------------------------------------------

function splitSentences(text) {
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/#{1,6}\s+/g, '')          // strip markdown headings
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1') // strip bold/italic
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?:;])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 15 && !/^[-*>|]/.test(s));
}

function scoreSentence(sentence, qTokens) {
    const lower = sentence.toLowerCase();
    let score = 0;
    for (const t of qTokens) {
        if (lower.includes(t)) score += 2;
        if (lower.startsWith(t) || lower.indexOf(t) < 60) score += 1;
    }
    if (sentence.length > 30 && sentence.length < 350) score += 1;
    return score;
}

/**
 * Extracts the most relevant individual sentences from lesson content,
 * scored against the user query. Returns a compact array of facts that
 * a dumb model can directly use without needing to reason over long text.
 */
export function extractKeySentences(fullText, userText, { maxSentences = 5, maxChars = 600 } = {}) {
    const text = normalizeWhitespace(fullText);
    if (!text) return [];

    const qTokens = tokenizeQuery(userText);
    const sentences = splitSentences(text);
    if (sentences.length === 0) return [];

    const scored = sentences.map((s, i) => ({
        text: s,
        score: qTokens.length ? scoreSentence(s, qTokens) : 0,
        idx: i
    }));
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

    const picked = [];
    let used = 0;

    if (sentences[0]) {
        const s = clampStr(sentences[0], Math.min(200, maxChars));
        if (s) { picked.push(s); used += s.length; }
    }

    for (const item of scored) {
        if (picked.length >= maxSentences || used >= maxChars) break;
        if (item.score <= 0 && picked.length > 0) break;
        if (item.idx === 0) continue;
        const remaining = maxChars - used;
        const s = clampStr(item.text, remaining);
        if (!s || picked.includes(s)) continue;
        picked.push(s);
        used += s.length;
    }

    return picked;
}

/**
 * Pure-JS detection of quick action intent from user text.
 * Returns 'summarize' | 'explain' | 'quiz' | null.
 */
export function detectQuickAction(userText, lang = 'EN') {
    const t = String(userText || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (/\b(resum|summary|summarize|resume|resumir|resumilo|resumila|resumen|sintetiza)\b/.test(t)) return 'summarize';
    if (/\b(explica|explicame|explain|explicar|que es|what is|what are|como funciona|how does|how do|define|definir|significa)\b/.test(t)) return 'explain';
    if (/\b(quiz|pregunta|question|test|examen|exam|evalua|evaluar|trivia)\b/.test(t)) return 'quiz';
    return null;
}

/**
 * Pure-JS intent classifier: decides if user message is about the open
 * lesson or a general question. No AI call needed.
 */
export function classifyIntentJS(msg, contextNode, lang) {
    if (!contextNode || !contextNode.content) return 'GENERAL';

    const norm = (s) =>
        String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    const msgN = norm(msg);
    const titleN = norm(contextNode.name);

    const lessonVerbs =
        /\b(resum|resumir|resumilo|resumila|resumen|summary|summarize|sintetiza|explica|explicame|explain|explicar|quiz|pregunta|question|test|examen|evalua|que dice|what does it say|de que trata|what is it about|leccion|lesson|tema|topic|concepto|concept|define|definir|significa|meaning)\b/;
    if (lessonVerbs.test(msgN)) return 'LESSON';

    if (detectQuickAction(msg, lang)) return 'LESSON';

    if (titleN && titleN.length >= 4) {
        if (msgN.includes(titleN)) return 'LESSON';
        const titleTokens = titleN.split(' ').filter(t => t.length >= 4);
        if (titleTokens.some(t => msgN.includes(t))) return 'LESSON';
    }

    const queryTokens = msgN.split(' ').filter(t => t.length >= 4);
    if (queryTokens.length > 0) {
        const contentLower = String(contextNode.content || '').toLowerCase();
        const matches = queryTokens.filter(t => contentLower.includes(t));
        if (matches.length >= Math.ceil(queryTokens.length * 0.5) && matches.length >= 2)
            return 'LESSON';
    }

    return 'GENERAL';
}

