import { store } from '../../../core/store.js';
import { parseContent } from '../parser.js';
import { parseArboritoFile } from '../../editor/editor-engine.js';
import { lessonContentHasCompleteQuiz } from '../quiz-v2-status.js';
import { isExamLesson } from '../exam-context.js';
import { getQuizBlocksForSection } from '../content-toc.js';
import { updateCareFromQuiz } from '../../garden-progress/care-schedule.js';
import {
    pickStudyQuizMode,
    pickNextQuizMode,
    normalizeChallenge,
    QUIZ_MODE_STEPS,
    QUIZ_MODE_RECALL
} from '../quiz-v2-schema.js';
import { RECALL_ADVANCE_MS } from '../quiz-v2-player.js';

/** Quiz V2 lifecycle: state, sessions, scheduling, scoring. */
export const quizV2Mixin = {
    getQuizState(id) {
        return (
            this.quizStates[id] || {
                started: false,
                finished: false,
                currentIdx: 0,
                score: 0,
                results: []
            }
        );
    },

    hasActiveQuizInProgress() {
        if (typeof this._isLessonConstructEdit === 'function' && this._isLessonConstructEdit()) {
            return false;
        }
        const states = Object.values(this.quizStates || {});
        if (states.some((s) => s.started && !s.finished)) return true;
        const session = this.quizSession;
        return !!(session && !session.finished);
    },

    _quizSessionKey() {
        return `${this.currentNode?.id ?? ''}:${this.activeSectionIndex}`;
    },

    _syncQuizSessionForSection(allBlocks, toc) {
        const key = this._quizSessionKey();
        if (this.quizSession && this.quizSession.key !== key) {
            this.quizSession = null;
        }
        const quizzes = getQuizBlocksForSection(allBlocks, toc, this.activeSectionIndex);
        if (quizzes.length <= 1) return quizzes;
        const ids = quizzes.map((b) => b.id || 'quiz-v2');
        if (
            this.quizSession &&
            this.quizSession.key === key &&
            this.quizSession.quizIds.length === ids.length &&
            this.quizSession.quizIds.every((id, i) => id === ids[i])
        ) {
            return quizzes;
        }
        this.quizSession = { key, quizIds: ids, currentIndex: 0, awaitingAdvance: false, finished: false };
        const firstId = ids[0];
        if (firstId && !this.getQuizState(firstId).started) {
            this.startQuizV2(firstId);
        }
        return quizzes;
    },

    getActiveSessionQuizId() {
        const s = this.quizSession;
        if (!s || s.key !== this._quizSessionKey() || s.finished) return null;
        return s.quizIds[s.currentIndex] || null;
    },

    getQuizSessionForRender() {
        const s = this.quizSession;
        if (!s || s.key !== this._quizSessionKey()) return null;
        return s;
    },

    advanceQuizSession() {
        const s = this.quizSession;
        if (!s || s.key !== this._quizSessionKey()) return;
        s.awaitingAdvance = false;
        const next = s.currentIndex + 1;
        if (next < s.quizIds.length) {
            s.currentIndex = next;
            this.startQuizV2(s.quizIds[next]);
            return;
        }
        s.finished = true;
        this._evaluateQuizSession(s);
    },

    _evaluateQuizSession(session) {
        const ids = session.quizIds || [];
        const correct = ids.filter((id) => !!this.getQuizState(id).v2Correct).length;
        const total = ids.length;
        const rate = total > 0 ? correct / total : 0;
        const isExam = this.currentNode && isExamLesson(this.currentNode);

        if (isExam) {
            if (rate >= 0.8) this._persistExamPass();
        } else if (total > 0) {
            if (correct > 0) store.addXP(5 * correct);
            if (correct === total && this.currentNode) {
                this.visitedSections.add(this.activeSectionIndex);
                store.saveBookmark(
                    this.currentNode.id,
                    this.currentNode.content,
                    this.activeSectionIndex,
                    this.visitedSections
                );
            }
        }
        if (
            !isExam &&
            this.currentNode &&
            total > 0 &&
            lessonContentHasCompleteQuiz(this.currentNode.content || '')
        ) {
            const mem = updateCareFromQuiz(store, this.currentNode.id, correct, total);
            if (mem && !mem.isDue && mem.interval > 0) {
                const ui = store.ui || {};
                const tpl = ui.careNextInDays || 'Next care in {days} days.';
                this._careFeedbackMsg = String(tpl).replace(/\{days\}/g, String(mem.interval));
            } else {
                this._careFeedbackMsg = null;
            }
        }
        this.lastRenderKey = null;
        this.render();
    },

    _getQuizV2BlockById(id) {
        if (!this.currentNode) return null;
        const contentForParse = this._getContentForTocParse?.() || this.currentNode.content || '';
        const parsed = parseArboritoFile(contentForParse);
        const blocks = parseContent(parsed.body || contentForParse);
        return blocks.find((b) => b.type === 'quizv2' && (b.id || 'quiz-v2') === id) || null;
    },

    _shuffleStepsForQuiz(steps, seed) {
        const arr = [...steps];
        let h = 0;
        for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) | 0;
        for (let i = arr.length - 1; i > 0; i--) {
            h = (h * 1103515245 + 12345) | 0;
            const j = Math.abs(h) % (i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    startQuizV2(id) {
        const block = this._getQuizV2BlockById(id);
        const ch = block ? normalizeChallenge(block) : null;
        const prev = this.quizStates[id];
        const isRetry = !!(prev && (prev.finished || prev.started));
        const mode = ch
            ? isRetry && prev.v2Mode
                ? pickNextQuizMode(ch, id, prev.v2Mode)
                : pickStudyQuizMode(ch, id)
            : 'multiple';
        const stepsOrder =
            mode === QUIZ_MODE_STEPS && ch && ch.steps.length >= 2
                ? this._shuffleStepsForQuiz(ch.steps, id)
                : null;
        this.quizStates[id] = {
            started: true,
            finished: false,
            currentIdx: 0,
            score: 0,
            results: [],
            v2Answered: false,
            v2Correct: null,
            v2Mode: mode,
            v2RecallRevealed: false,
            v2ChipOrder: [],
            v2StepsOrder: stepsOrder
        };
        this.lastRenderKey = null;
        this.render();
    },

    answerQuizV2(id, isCorrect) {
        const st = this.getQuizState(id);
        const isRecall = st.v2Mode === QUIZ_MODE_RECALL;
        const remembered = !!isCorrect;
        this.quizStates[id] = {
            ...st,
            started: true,
            finished: true,
            v2Answered: true,
            v2Correct: remembered,
            v2RecallRemembered: isRecall ? remembered : undefined,
            score: remembered ? 1 : 0,
            results: [remembered]
        };

        const session = this.quizSession;
        const inSession =
            session &&
            session.key === this._quizSessionKey() &&
            session.quizIds.length > 1 &&
            session.quizIds.includes(id);

        if (inSession) {
            session.awaitingAdvance = true;
            this.lastRenderKey = null;
            this.render();
            if (isRecall) this._scheduleRecallAdvance(id);
            return;
        }

        const isExam = this.currentNode && isExamLesson(this.currentNode);
        if (isExam && remembered) {
            this._persistExamPass();
        } else if (!isExam) {
            if (remembered) {
                store.addXP(5);
                // Auto-tick quiz section on pass; lesson completion still needs all outline ticks.
                this.visitedSections.add(this.activeSectionIndex);
                if (this.currentNode) {
                    store.saveBookmark(
                        this.currentNode.id,
                        this.currentNode.content,
                        this.activeSectionIndex,
                        this.visitedSections
                    );
                }
            }
        }
        if (
            !isExam &&
            this.currentNode &&
            lessonContentHasCompleteQuiz(this.currentNode.content || '')
        ) {
            updateCareFromQuiz(store, this.currentNode.id, remembered ? 1 : 0, 1);
        }
        this.lastRenderKey = null;
        this.render();
        if (isRecall) this._scheduleRecallAdvance(id);
    },

    _scheduleRecallAdvance(id) {
        if (this._recallAdvanceTimer) clearTimeout(this._recallAdvanceTimer);
        this._recallAdvanceTimer = setTimeout(() => {
            this._recallAdvanceTimer = null;
            const session = this.quizSession;
            const inSession =
                session &&
                session.key === this._quizSessionKey() &&
                session.awaitingAdvance &&
                !session.finished;
            if (inSession) {
                this.advanceQuizSession();
            }
        }, RECALL_ADVANCE_MS);
    }
};
