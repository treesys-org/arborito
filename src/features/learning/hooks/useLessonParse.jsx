import { useCallback, useRef } from 'react';
import { parseContent } from '../api/parser.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { isLiveConstructDraftBody } from '../../editor/api/logic/lesson-draft-persist.js';
import { peekSyncLessonDraftBody } from '../../editor/api/logic/lesson-sync-draft-body.js';
import { resolveLiveConstructBody } from '../../editor/api/logic/lesson-construct-body.js';
import { annotateTocWithQuizSections, buildTocFromBlocks } from '../api/content-toc.js';
import { SYNTHETIC_INTRO_ID } from '../api/lesson-section-slices.js';

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
 * Lesson parse cache and content-for-TOC helpers.
 * One body string only — never prepare/normalize here (that desyncs editor flush vs TOC).
 * Outline prepare happens only when a TOC mutation persists the draft.
 */
export function useLessonParse(draft) {
    const cacheRef = useRef(null);

    const invalidateLessonParseCache = useCallback(() => {
        cacheRef.current = null;
    }, []);

    const getLessonBodyForToc = useCallback(() => {
        const node = draft.currentNode;
        if (!node) return '';
        return resolveLiveConstructBody({
            nodeId: node.id,
            nodeContent: node.content,
            lessonBodyMarkdown: draft.lessonBodyMarkdown,
            lessonConstructDraft: draft.lessonConstructDraft,
            lessonDraftLessonId: draft.lessonDraftLessonId,
        });
    }, [
        draft.currentNode,
        draft.lessonConstructDraft,
        draft.lessonDraftLessonId,
        draft.lessonBodyMarkdown,
    ]);

    const getContentForTocParse = useCallback(() => {
        const node = draft.currentNode;
        if (!node) return '';
        const syncBody = peekSyncLessonDraftBody(node.id);
        const usingLive =
            (syncBody != null && isLiveConstructDraftBody(syncBody)) ||
            (draft.lessonConstructDraft &&
                draft.lessonDraftLessonId === node.id &&
                isLiveConstructDraftBody(draft.lessonBodyMarkdown));
        /* Live draft is body-only; disk parse still needs the full file for @info. */
        return usingLive ? getLessonBodyForToc() : node.content || '';
    }, [
        draft.currentNode,
        draft.lessonConstructDraft,
        draft.lessonDraftLessonId,
        draft.lessonBodyMarkdown,
        getLessonBodyForToc,
    ]);

    const getLessonParseModel = useCallback(
        (contentForParse, isExam) => {
            const nodeId = draft.currentNode?.id ?? '';
            const fileContent = draft.currentNode?.content || '';
            const bodyLive = resolveLiveConstructBody({
                nodeId,
                nodeContent: fileContent,
                lessonBodyMarkdown: draft.lessonBodyMarkdown,
                lessonConstructDraft: draft.lessonConstructDraft,
                lessonDraftLessonId: draft.lessonDraftLessonId,
            });
            const usingBodyDraft =
                peekSyncLessonDraftBody(nodeId) != null ||
                (draft.lessonConstructDraft &&
                    draft.lessonDraftLessonId === nodeId &&
                    isLiveConstructDraftBody(draft.lessonBodyMarkdown));
            const key = `${nodeId}:${contentParseSig(contentForParse)}:${isExam ? 1 : 0}:${usingBodyDraft ? 1 : 0}`;
            if (cacheRef.current?.key === key) return cacheRef.current;

            let parsedForBlocks;
            let bodyForBlocks;
            if (usingBodyDraft) {
                bodyForBlocks = bodyLive;
                parsedForBlocks = {
                    ...parseArboritoFile(fileContent),
                    body: bodyForBlocks,
                };
            } else {
                parsedForBlocks = parseArboritoFile(contentForParse);
                bodyForBlocks = parsedForBlocks.body || contentForParse;
            }

            const rawBlocks = parseContent(bodyForBlocks);
            const blocks = sanitizeStudentViewBlocks(rawBlocks, isExam);
            let toc = annotateTocWithQuizSections(blocks, buildTocFromBlocks(blocks));
            if (!toc.length && String(bodyForBlocks || '').trim()) {
                toc = annotateTocWithQuizSections(blocks, [
                    {
                        text: 'Introduction',
                        level: 1,
                        id: SYNTHETIC_INTRO_ID,
                        isQuiz: false,
                        synthetic: true,
                    },
                ]);
            }
            cacheRef.current = { key, blocks, toc, parsedForBlocks };
            return cacheRef.current;
        },
        [
            draft.currentNode?.id,
            draft.currentNode?.content,
            draft.lessonConstructDraft,
            draft.lessonDraftLessonId,
            draft.lessonBodyMarkdown,
        ]
    );

    return {
        invalidateLessonParseCache,
        getContentForTocParse,
        getLessonBodyForToc,
        getLessonParseModel,
    };
}
