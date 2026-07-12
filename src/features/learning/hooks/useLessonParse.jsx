import { useCallback, useRef } from 'react';
import { parseContent } from '../api/parser.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { isDraftBodyUsable } from '../../editor/api/logic/lesson-draft-persist.js';
import { annotateTocWithQuizSections, buildTocFromBlocks } from '../api/content-toc.js';

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
        const usingDraft =
            draft.lessonConstructDraft &&
            draft.lessonDraftLessonId === node.id &&
            draft.lessonBodyMarkdown !== null &&
            isDraftBodyUsable(draft.lessonBodyMarkdown, node.content || '');
        if (usingDraft) {
            return draft.lessonBodyMarkdown;
        }
        return node.content || '';
    }, [
        draft.currentNode,
        draft.lessonConstructDraft,
        draft.lessonDraftLessonId,
        draft.lessonBodyMarkdown
    ]);

    const getLessonBodyForToc = useCallback(() => {
        const node = draft.currentNode;
        if (!node) return '';
        const usingDraft =
            draft.lessonConstructDraft &&
            draft.lessonDraftLessonId === node.id &&
            draft.lessonBodyMarkdown !== null &&
            isDraftBodyUsable(draft.lessonBodyMarkdown, node.content || '');
        if (usingDraft) {
            return draft.lessonBodyMarkdown;
        }
        return parseArboritoFile(node.content || '').body;
    }, [
        draft.currentNode,
        draft.lessonConstructDraft,
        draft.lessonDraftLessonId,
        draft.lessonBodyMarkdown
    ]);

    const getLessonParseModel = useCallback(
        (contentForParse, isExam) => {
            const nodeId = draft.currentNode?.id ?? '';
            const usingBodyDraft =
                draft.lessonConstructDraft &&
                draft.lessonDraftLessonId === nodeId &&
                draft.lessonBodyMarkdown !== null &&
                isDraftBodyUsable(draft.lessonBodyMarkdown, draft.currentNode?.content || '');
            const key = `${nodeId}:${contentParseSig(contentForParse)}:${isExam ? 1 : 0}:${usingBodyDraft ? 1 : 0}`;
            if (cacheRef.current?.key === key) return cacheRef.current;

            let parsedForBlocks;
            let bodyForBlocks;
            if (usingBodyDraft) {
                bodyForBlocks = draft.lessonBodyMarkdown;
                parsedForBlocks = {
                    ...parseArboritoFile(draft.currentNode?.content || ''),
                    body: bodyForBlocks
                };
            } else {
                parsedForBlocks = parseArboritoFile(contentForParse);
                bodyForBlocks = parsedForBlocks.body || contentForParse;
            }

            const rawBlocks = parseContent(bodyForBlocks);
            const blocks = sanitizeStudentViewBlocks(rawBlocks, isExam);
            const toc = annotateTocWithQuizSections(blocks, buildTocFromBlocks(blocks));
            cacheRef.current = { key, blocks, toc, parsedForBlocks };
            return cacheRef.current;
        },
        [draft.currentNode?.id, draft.lessonConstructDraft, draft.lessonDraftLessonId, draft.lessonBodyMarkdown]
    );

    return {
        invalidateLessonParseCache,
        getContentForTocParse,
        getLessonBodyForToc,
        getLessonParseModel
    };
}
