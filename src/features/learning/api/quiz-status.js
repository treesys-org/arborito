/**
 * Lesson quiz / challenge schema completeness (editor badge and construction "game ready").
 */

import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import {
    isQuizChallengeComplete,
    normalizeChallenge,
    findQuizBlocks,
    expandQuizBlock,
    challengeToQuizBlock as schemaChallengeToBlock,
    getChallengeValidationHints
} from './quiz-schema.js';
import { getQuizBlocksForSection } from './content-toc.js';
import { extractTocSectionMarkdown } from './lesson-section-slices.js';

export { isQuizChallengeComplete, getChallengeValidationHints };

/**
 * Incomplete @quiz fences in a lesson body (construction save gate).
 * @param {string} bodyMarkdown
 * @returns {{ index: number, concept: string, hints: { es: string, en: string }[] }[]}
 */
export function listIncompleteQuizBlocksInBody(bodyMarkdown) {
    const body = String(bodyMarkdown || '');
    if (!body.trim()) return [];
    const out = [];
    findQuizBlocks(body).forEach((block, index) => {
        const challenge = normalizeChallenge(block.challenge);
        if (isQuizChallengeComplete(challenge)) return;
        out.push({
            index,
            concept: String(challenge.core_concept || '').trim(),
            hints: getChallengeValidationHints(challenge),
        });
    });
    return out;
}

function countExpandedQuestions(blocks) {
    let n = 0;
    for (const b of blocks) {
        if (b.type !== 'quiz') continue;
        n += expandQuizBlock(b).length;
    }
    return n;
}

/**
 * Arcade readiness for one TOC section while authoring.
 * @returns {{ status: 'none'|'draft'|'ready', questionCount: number }}
 */
export function getSectionArcadeQuizStatus(bodyMarkdown, blocks, toc, sectionIndex) {
    if (!toc.length || sectionIndex < 0 || sectionIndex >= toc.length) {
        return { status: 'none', questionCount: 0 };
    }
    const quizzes = getQuizBlocksForSection(blocks || [], toc, sectionIndex);
    if (quizzes.length) {
        const questionCount = countExpandedQuestions(quizzes);
        const ready = quizzes.some((b) => isQuizChallengeComplete(b));
        return { status: ready ? 'ready' : 'draft', questionCount };
    }
    const sectionMd = extractTocSectionMarkdown(bodyMarkdown || '', sectionIndex);
    const fenced = findQuizBlocks(sectionMd);
    if (!fenced.length) return { status: 'none', questionCount: 0 };
    const questionCount = fenced.reduce((sum, f) => {
        const items = normalizeChallenge(f.challenge).items;
        return sum + (items.length || 1);
    }, 0);
    const ready = fenced.some((f) => isQuizChallengeComplete(f.challenge));
    return { status: ready ? 'ready' : 'draft', questionCount };
}

/**
 * @param {string} content - lesson .md / arborito file body
 */
export function lessonContentHasCompleteQuiz(content) {
    if (!content) return false;
    return parseAllChallengesFromLessonContent(content).length > 0;
}

/** True when body has at least one complete questionnaire (incl. recall-only). */
export function lessonBodyHasPlayableQuiz(body) {
    if (!body || !String(body).trim()) return false;
    return parseAllChallengesFromLessonContent(body).length > 0;
}

/** @param {string} body */
export function bodyMarkdownHasQuizBlock(body) {
    const b = String(body || '');
    return /^@quiz\s*$/im.test(b) || /data-quiz-block/i.test(b) || /arborito-quiz-edit/i.test(b);
}

/**
 * Unified exam quiz detection (open, intro gate, render).
 * @param {string} bodyMarkdown - lesson body (post parseArboritoFile)
 * @param {object[]} [blocks] - parsed content blocks
 * @returns {{ hasPlayableQuizzes: boolean, hasAnyQuizFence: boolean, questionCount: number }}
 */
export function getExamQuizPresence(bodyMarkdown, blocks = []) {
    const body = String(bodyMarkdown || '');
    const quizBlocks = Array.isArray(blocks) ? blocks.filter((b) => b.type === 'quiz') : [];
    const fenced = findQuizBlocks(body);
    const hasAnyQuizFence =
        fenced.length > 0 || bodyMarkdownHasQuizBlock(body) || quizBlocks.length > 0;

    let questionCount = 0;
    if (quizBlocks.length) {
        questionCount = countExpandedQuestions(quizBlocks);
    } else if (fenced.length) {
        questionCount = fenced.reduce((sum, f) => {
            const items = normalizeChallenge(f.challenge).items;
            return sum + (items.length || 1);
        }, 0);
    }

    const hasPlayableQuizzes =
        quizBlocks.some((b) => isQuizChallengeComplete(b)) ||
        fenced.some((f) => isQuizChallengeComplete(f.challenge)) ||
        parseAllChallengesFromLessonContent(body).length > 0;

    return { hasPlayableQuizzes, hasAnyQuizFence, questionCount };
}

/**
 * Scan body for every complete @quiz block (supports multiple quizzes per lesson).
 * @param {string} content
 * @returns {Array<object>} quiz-shaped blocks with stable ids
 */
export function parseAllChallengesFromLessonContent(content) {
    if (!content) return [];
    const out = [];
    let blockOrdinal = 0;

    const pushIfComplete = (challenge, id) => {
        const c = normalizeChallenge(challenge);
        if (!isQuizChallengeComplete(c)) return;
        out.push(schemaChallengeToBlock(c, id || `quiz-${out.length + 1}`));
    };

    const parsed = parseArboritoFile(content);
    const body = parsed && typeof parsed.body === 'string' ? parsed.body : String(content || '');

    for (const block of findQuizBlocks(body)) {
        blockOrdinal += 1;
        const wrapped = schemaChallengeToBlock(
            normalizeChallenge(block.challenge),
            `quiz-${blockOrdinal}`
        );
        for (const q of expandQuizBlock(wrapped)) {
            pushIfComplete(q, q.id);
        }
    }

    return out;
}

/**
 * Module-level static arcade readiness (quiz-bearing leaves).
 * Walks materialized children; falls back to `leafIds` via store lookup.
 * Empty bodies with `treeLazyContent` count as unchecked (not “no quiz”).
 * @param {object|null|undefined} rootNode
 * @returns {{ totalLeaves: number, withCompleteQuiz: number, uncheckedLeaves: number, staticReady: boolean, pendingLazy: boolean }}
 */
export function getModuleStaticGameReadiness(rootNode) {
    const stats = {
        totalLeaves: 0,
        withCompleteQuiz: 0,
        uncheckedLeaves: 0,
        staticReady: false,
        pendingLazy: false,
    };
    if (!rootNode) return stats;
    let findNode = null;
    try {
        const store = getArboritoStore();
        if (store?.findNode) findNode = (id) => store.findNode(id);
    } catch {
        findNode = null;
    }
    const walk = (n) => {
        if (!n) return;
        if (n.type === 'leaf' || n.type === 'exam') {
            stats.totalLeaves += 1;
            const body = n.content;
            if (!body || !String(body).trim()) {
                stats.uncheckedLeaves += 1;
                if (n.treeLazyContent && n.treeContentKey) stats.pendingLazy = true;
                return;
            }
            if (lessonBodyHasPlayableQuiz(body)) {
                stats.withCompleteQuiz += 1;
            }
        } else if (n.type === 'branch' || n.type === 'root') {
            if (n.children && n.children.length) {
                n.children.forEach(walk);
            } else if (Array.isArray(n.leafIds) && n.leafIds.length) {
                for (const id of n.leafIds) {
                    const resolved = findNode?.(id);
                    if (resolved) walk(resolved);
                    else {
                        stats.totalLeaves += 1;
                        stats.uncheckedLeaves += 1;
                        stats.pendingLazy = true;
                    }
                }
            }
        }
    };
    walk(rootNode);
    stats.staticReady = stats.withCompleteQuiz > 0;
    return stats;
}

/**
 * Collect leaf/exam nodes under a module that still need a body load.
 * @param {object|null|undefined} rootNode
 * @returns {object[]}
 */
export function listModuleLeavesNeedingContent(rootNode) {
    /** @type {object[]} */
    const out = [];
    if (!rootNode) return out;
    let findNode = null;
    try {
        const store = getArboritoStore();
        if (store?.findNode) findNode = (id) => store.findNode(id);
    } catch {
        findNode = null;
    }
    const walk = (n) => {
        if (!n) return;
        if (n.type === 'leaf' || n.type === 'exam') {
            const body = n.content;
            if (body && String(body).trim()) return;
            if (n.treeLazyContent && n.treeContentKey) out.push(n);
            else if (n.contentPath) out.push(n);
            return;
        }
        if (n.type === 'branch' || n.type === 'root') {
            if (n.children && n.children.length) {
                n.children.forEach(walk);
            } else if (Array.isArray(n.leafIds) && n.leafIds.length) {
                for (const id of n.leafIds) {
                    const resolved = findNode?.(id);
                    if (resolved) walk(resolved);
                }
            }
        }
    };
    walk(rootNode);
    return out;
}

/**
 * Probe lazy lesson chunks until a complete quiz is found (or budget exhausted).
 * Published Nostr trees strip `content` into chunks; sync readiness alone always
 * looked empty.
 *
 * @param {object|null|undefined} rootNode
 * @param {{ loadContent?: (node: object) => Promise<void>, maxProbe?: number }} [opts]
 * @returns {Promise<ReturnType<typeof getModuleStaticGameReadiness>>}
 */
export async function resolveModuleStaticGameReadiness(rootNode, opts = {}) {
    const loadContent = typeof opts.loadContent === 'function' ? opts.loadContent : null;
    const maxProbe = Math.max(1, Math.min(48, Number(opts.maxProbe) || 16));
    let stats = getModuleStaticGameReadiness(rootNode);
    if (stats.staticReady || !loadContent || !stats.pendingLazy) return stats;

    const pending = listModuleLeavesNeedingContent(rootNode);
    for (let i = 0; i < pending.length && i < maxProbe; i++) {
        try {
            await loadContent(pending[i]);
        } catch {
            /* keep probing */
        }
        stats = getModuleStaticGameReadiness(rootNode);
        if (stats.staticReady) return stats;
    }
    return getModuleStaticGameReadiness(rootNode);
}

function resolveQuizStatusFindNode() {
    try {
        const store = getArboritoStore();
        if (store?.findNode) return (id) => store.findNode(id);
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * Static arcade picker: only lessons with a complete questionnaire (plus ancestor
 * modules), and still-unchecked lazy leaves until their bodies load.
 *
 * Exams are omitted — arcade setup does not launch from exam nodes.
 *
 * @param {object|null|undefined} rootNode
 * @returns {{ visibleIds: Set<string>, readyLeafCount: number, pendingLeafCount: number }}
 */
export function collectStaticArcadePickerIds(rootNode) {
    /** @type {Set<string>} */
    const visibleIds = new Set();
    const stats = { readyLeafCount: 0, pendingLeafCount: 0 };
    if (!rootNode) return { visibleIds, ...stats };

    const findNode = resolveQuizStatusFindNode();

    /** @param {object} n @returns {'ready'|'pending'|'none'} */
    const classifyLeaf = (n) => {
        if (!n || n.type === 'exam') return 'none';
        if (n.type !== 'leaf') return 'none';
        const body = n.content;
        if (body && String(body).trim()) {
            return lessonBodyHasPlayableQuiz(body) ? 'ready' : 'none';
        }
        if (n.treeLazyContent && n.treeContentKey) return 'pending';
        if (n.contentPath) return 'pending';
        return 'none';
    };

    /** @param {object} n @returns {boolean} */
    const walk = (n) => {
        if (!n) return false;
        if (n.type === 'leaf' || n.type === 'exam') {
            const kind = classifyLeaf(n);
            if (kind === 'none') return false;
            if (kind === 'ready') stats.readyLeafCount += 1;
            else stats.pendingLeafCount += 1;
            visibleIds.add(String(n.id));
            return true;
        }
        if (n.type !== 'branch' && n.type !== 'root') return false;

        let any = false;
        if (n.children && n.children.length) {
            for (const c of n.children) {
                if (walk(c)) any = true;
            }
        } else if (Array.isArray(n.leafIds) && n.leafIds.length) {
            for (const id of n.leafIds) {
                const resolved = findNode?.(id);
                if (resolved) {
                    if (walk(resolved)) any = true;
                } else {
                    // Children not materialized yet — keep the module listed.
                    stats.pendingLeafCount += 1;
                    any = true;
                }
            }
        }
        if (any) visibleIds.add(String(n.id));
        return any;
    };

    walk(rootNode);
    return { visibleIds, readyLeafCount: stats.readyLeafCount, pendingLeafCount: stats.pendingLeafCount };
}

/**
 * Load lazy lesson bodies under a module so static picker filtering can hide
 * lessons that have no questionnaire (does not stop at the first quiz).
 *
 * @param {object|null|undefined} rootNode
 * @param {{ loadContent?: (node: object) => Promise<void>, maxProbe?: number }} [opts]
 * @returns {Promise<ReturnType<typeof collectStaticArcadePickerIds>>}
 */
export async function resolveStaticArcadePickerIds(rootNode, opts = {}) {
    const loadContent = typeof opts.loadContent === 'function' ? opts.loadContent : null;
    const maxProbe = Math.max(1, Math.min(64, Number(opts.maxProbe) || 32));
    let snapshot = collectStaticArcadePickerIds(rootNode);
    if (!loadContent || snapshot.pendingLeafCount === 0) return snapshot;

    const pending = listModuleLeavesNeedingContent(rootNode).filter((n) => n?.type === 'leaf');
    for (let i = 0; i < pending.length && i < maxProbe; i++) {
        try {
            await loadContent(pending[i]);
        } catch {
            /* keep probing */
        }
    }
    return collectStaticArcadePickerIds(rootNode);
}
