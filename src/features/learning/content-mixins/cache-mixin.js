import { store } from '../../../core/store.js';
import { parseContent } from '../parser.js';
import { parseArboritoFile } from '../../editor/editor-engine.js';
import {
    isQuizV2ChallengeComplete,
    parseAllChallengesFromLessonContent
} from '../quiz-v2-status.js';
import {
    annotateTocWithQuizSections,
    buildTocFromBlocks
} from '../content-toc.js';
import { normalizeChallenge } from '../quiz-v2-schema.js';

/** Inject Quiz V2 from file meta when not already parsed from body. */
function enrichBlocksWithMetaQuiz(fullContent, blocks) {
    if (blocks.some((b) => b.type === 'quizv2')) return blocks;
    const all = parseAllChallengesFromLessonContent(fullContent);
    if (all.length) return [...blocks, ...all];
    const { meta } = parseArboritoFile(fullContent || '');
    const c = meta && meta.challenge;
    if (!isQuizV2ChallengeComplete(c)) return blocks;
    const n = normalizeChallenge(c);
    return [
        ...blocks,
        {
            type: 'quizv2',
            id: 'quiz-v2-meta',
            ...n,
            traps: [...n.traps]
        }
    ];
}

/** Drop paragraph blocks that are editor chrome leaked into saved exam/lesson bodies. */
function sanitizeStudentViewBlocks(blocks, isExam) {
    if (!blocks.length) return blocks;
    const junkRe =
        /arborito-quizv2|quizv2-(?:core|def|question|correct|trap)|data-quizv2|Mover evaluaci|Concepto Principal|Definici[oó]n Corta|Pregunta Principal|Respuesta Correcta|Agregar respuesta incorrecta|editorBlock/i;
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

/** Lesson parse cache, content fingerprinting, and content-for-TOC helpers. */
export const cacheMixin = {
    /** Effective text to parse outline/blocks: body draft or full file. */
    _getContentForTocParse() {
        const node = this.currentNode;
        if (!node) return '';
        if (this._lessonDraftLessonId === node.id && this._lessonBodyMarkdown !== null) {
            return this._lessonBodyMarkdown;
        }
        return node.content || '';
    },

    /** Markdown body only (for outline mutations aligned with the editor). */
    _getLessonBodyForToc() {
        const node = this.currentNode;
        if (!node) return '';
        if (this._lessonDraftLessonId === node.id && this._lessonBodyMarkdown !== null) {
            return this._lessonBodyMarkdown;
        }
        return parseArboritoFile(node.content || '').body;
    },

    _invalidateLessonParseCache() {
        this._lessonParseCache = null;
    },

    _contentParseSig(contentForParse) {
        let h = 0;
        const lim = Math.min(contentForParse.length, 2400);
        for (let i = 0; i < lim; i++) h = (h * 31 + contentForParse.charCodeAt(i)) | 0;
        return `${contentForParse.length}:${h}`;
    },

    _getLessonParseModel(contentForParse, isExam) {
        const nodeId = this.currentNode?.id ?? '';
        const key = `${nodeId}:${this._contentParseSig(contentForParse)}:${isExam ? 1 : 0}`;
        if (this._lessonParseCache?.key === key) return this._lessonParseCache;
        const parsedForBlocks = parseArboritoFile(contentForParse);
        const rawBlocks = parseContent(parsedForBlocks.body || contentForParse);
        const blocks = sanitizeStudentViewBlocks(
            enrichBlocksWithMetaQuiz(contentForParse, rawBlocks),
            isExam
        );
        const toc = annotateTocWithQuizSections(blocks, buildTocFromBlocks(blocks));
        this._lessonParseCache = { key, blocks, toc, parsedForBlocks };
        return this._lessonParseCache;
    },

    _lessonStoreFingerprint(detail) {
        const n = this.currentNode;
        if (!n) return '';
        return [
            n.id,
            store.isCompleted(n.id) ? 1 : 0,
            detail.activeSource?.id ?? '',
            detail.constructionMode ? 1 : 0,
            detail.theme ?? '',
            detail.lang ?? ''
        ].join('|');
    }
};
