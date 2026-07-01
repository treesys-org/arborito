import { useCallback, useRef } from 'react';
import { parseContent } from '../api/parser.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import {
    isQuizChallengeComplete,
    parseAllChallengesFromLessonContent
} from '../api/quiz-status.js';
import {
    annotateTocWithQuizSections,
    buildTocFromBlocks,
    insertIndexForMetaQuizBlock
} from '../api/content-toc.js';
import { normalizeChallenge } from '../api/quiz-schema.js';

/** Inject lesson quiz fields from file meta when not already parsed from body. */
function enrichBlocksWithMetaQuiz(fullContent, blocks, headerChallengeDraft) {
    if (blocks.some((b) => b.type === 'quiz')) return blocks;
    const all = parseAllChallengesFromLessonContent(fullContent);
    if (all.length) return [...blocks, ...all];
    const { meta } = parseArboritoFile(fullContent || '');
    const c = headerChallengeDraft || (meta && meta.challenge);
    if (!c) return blocks;
    if (!headerChallengeDraft && !isQuizChallengeComplete(c)) return blocks;
    const n = normalizeChallenge(c);
    const metaBlock = {
        type: 'quiz',
        id: 'quiz-meta',
        ...n,
        traps: [...n.traps]
    };
    const toc = buildTocFromBlocks(blocks);
    const insertAt = insertIndexForMetaQuizBlock(blocks, toc);
    const next = [...blocks];
    next.splice(insertAt, 0, metaBlock);
    return next;
}

/** Drop paragraph blocks that are editor chrome leaked into saved exam/lesson bodies. */
function sanitizeStudentViewBlocks(blocks, isExam) {
    if (!blocks.length) return blocks;
    const junkRe =
        /arborito-quiz|quiz-(?:core|def|question|correct|trap)|data-quiz|Mover evaluaci|Concepto Principal|Definici[oó]n Corta|Pregunta Principal|Respuesta Correcta|Agregar respuesta incorrecta|editorBlock/i;
    return blocks.filter((b) => {
        if (b.type !== 'p') return true;
        const plain = String(b.text || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!plain) return false;
        if (junkRe.test(plain)) return false;
        if (/^:+\s*(?:br\s*\/?|&lt;br&gt;)/i.test(plain)) return false;
        if (isExam && plain.length < 120 && /^[?:✓×\s+]+$/u.test(plain)) return false;
        return true;
    });
}

function contentParseSig(contentForParse) {
    let h = 0;
    const lim = Math.min(contentForParse.length, 2400);
    for (let i = 0; i < lim; i++) h = (h * 31 + contentForParse.charCodeAt(i)) | 0;
    return `${contentForParse.length}:${h}`;
}

/**
 * Lesson parse cache and content-for-TOC helpers (from legacy cache-mixin).
 * @param {{ currentNode: object|null, lessonDraftLessonId: string|null, lessonBodyMarkdown: string|null, headerMetaDraft: object|null }} draft
 */
export function useLessonParse(draft) {
    const cacheRef = useRef(null);

    const invalidateLessonParseCache = useCallback(() => {
        cacheRef.current = null;
    }, []);

    const getContentForTocParse = useCallback(() => {
        const node = draft.currentNode;
        if (!node) return '';
        if (draft.lessonDraftLessonId === node.id && draft.lessonBodyMarkdown !== null) {
            return draft.lessonBodyMarkdown;
        }
        return node.content || '';
    }, [draft.currentNode, draft.lessonDraftLessonId, draft.lessonBodyMarkdown]);

    const getLessonBodyForToc = useCallback(() => {
        const node = draft.currentNode;
        if (!node) return '';
        if (draft.lessonDraftLessonId === node.id && draft.lessonBodyMarkdown !== null) {
            return draft.lessonBodyMarkdown;
        }
        return parseArboritoFile(node.content || '').body;
    }, [draft.currentNode, draft.lessonDraftLessonId, draft.lessonBodyMarkdown]);

    const getLessonParseModel = useCallback(
        (contentForParse, isExam) => {
            const nodeId = draft.currentNode?.id ?? '';
            const key = `${nodeId}:${contentParseSig(contentForParse)}:${isExam ? 1 : 0}`;
            if (cacheRef.current?.key === key) return cacheRef.current;
            const parsedForBlocks = parseArboritoFile(contentForParse);
            const rawBlocks = parseContent(parsedForBlocks.body || contentForParse);
            const headerChallengeDraft =
                draft.headerMetaDraft?.nodeId === nodeId ? draft.headerMetaDraft.challenge : null;
            const blocks = sanitizeStudentViewBlocks(
                enrichBlocksWithMetaQuiz(contentForParse, rawBlocks, headerChallengeDraft),
                isExam
            );
            const toc = annotateTocWithQuizSections(blocks, buildTocFromBlocks(blocks));
            cacheRef.current = { key, blocks, toc, parsedForBlocks };
            return cacheRef.current;
        },
        [draft.currentNode?.id, draft.headerMetaDraft]
    );

    return {
        invalidateLessonParseCache,
        getContentForTocParse,
        getLessonBodyForToc,
        getLessonParseModel
    };
}
