import { store } from '../../../core/store.js';
import { isExamLesson } from '../exam-context.js';
import { renderContentHtml } from '../content-template.js';
import {
    getMediaConsentStateFingerprint,
    persistMediaOriginsConsent
} from '../../privacy-gdpr/third-party-media.js';
import {
    getToc,
    getActiveBlocks,
    getFilteredToc,
    buildTocListMarkup as buildTocNavHtml,
    getQuizBlocksForSection,
    findFirstQuizSectionIndex,
    computeLessonProgress,
    isTocSectionCompleted
} from '../content-toc.js';
import { lessonContentHasCompleteQuiz } from '../quiz-v2-status.js';
import { normalizeChallenge } from '../quiz-v2-schema.js';
import {
    validateClozeAnswers,
    validateChipsOrder,
    validateStepsOrder
} from '../quiz-v2-player.js';
import { getTocLineRanges } from '../lesson-toc-mutations.js';
/** Included in `stateKey` to repaint lesson when only draft markdown changes (e.g. TOC). */
function lessonDraftStateSig(ctx) {
    const id = ctx.currentNode?.id ?? '';
    if (ctx._lessonDraftLessonId !== id || ctx._lessonBodyMarkdown == null) return '';
    const s = ctx._lessonBodyMarkdown;
    let h = 0;
    const lim = Math.min(s.length, 1200);
    for (let i = 0; i < lim; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `${s.length}:${h}:${ctx._lessonDraftNonce}`;
}

/** Main render pipeline, section navigation, and TOC filter patching. */
export const renderMixin = {
    _tocMarkupOpts() {
        const construct = this._isLessonConstructEdit();
        let headingRaws = [];
        if (construct) {
            headingRaws = getTocLineRanges(this._getLessonBodyForToc()).map((r) => r.headingRaw || '');
        }
        return {
            includeSingleSection: construct,
            constructEdit: construct,
            tocInlineEditIdx: this._tocInlineEditIdx,
            headingRaws,
            ui: store.ui
        };
    },

    buildTocListMarkup(toc, filteredToc) {
        const blocks = this._renderBlocks || [];
        return buildTocNavHtml(toc, filteredToc, this.activeSectionIndex, this.visitedSections, {
            ...this._tocMarkupOpts(),
            isSectionCompleted: (idx) =>
                isTocSectionCompleted(idx, toc, blocks, this.visitedSections, (id) => this.getQuizState(id))
        });
    },

    async scrollToSection(idx) {
        if (idx !== this.activeSectionIndex && this.hasActiveQuizInProgress()) {
            if (!(await this.confirmLeaveIfNeeded())) return;
        }
        const construct = this._isLessonConstructEdit && this._isLessonConstructEdit();
        const switchingSection = construct && idx !== this.activeSectionIndex;
        if (switchingSection) {
            this._flushConstructSectionToBody();
        }
        this.activeSectionIndex = idx;
        if (this.currentNode) {
            store.saveBookmark(
                this.currentNode.id,
                this.currentNode.content,
                this.activeSectionIndex,
                this.visitedSections
            );
        }
        if (switchingSection) {
            this._skipLessonDraftDomCapture = true;
        }
        this.lastRenderKey = null;
        this.scheduleUpdate(true);
    },

    _tryCompleteLessonFromTocProgress() {
        if (!this.currentNode || isExamLesson(this.currentNode)) return false;
        const contentForParse = this._getContentForTocParse();
        const { blocks: allBlocks, toc } = this._getLessonParseModel(
            contentForParse,
            false
        );
        if (!toc.length) return false;
        const getQuizStateBound = (id) => this.getQuizState(id);
        const allDone = toc.every((_, i) =>
            isTocSectionCompleted(i, toc, allBlocks, this.visitedSections, getQuizStateBound)
        );
        if (!allDone) return false;
        if (!store.isCompleted(this.currentNode.id)) {
            store.markComplete(this.currentNode.id, true);
            store.checkForModuleCompletion(this.currentNode.id);
        }
        return true;
    },

    completeAndNext() {
        if (!this.currentNode) return;
        const contentForParse = this._getContentForTocParse();
        const isExam = isExamLesson(this.currentNode);
        const { blocks: allBlocks, toc } = this._getLessonParseModel(contentForParse, isExam);
        const idx = this.activeSectionIndex;
        const item = toc[idx];

        const quizzes = getQuizBlocksForSection(allBlocks, toc, idx);
        if (item?.isQuiz && quizzes.length > 0) {
            const quizPassed = quizzes.every((q) => {
                const st = this.getQuizState(q.id || 'quiz-v2-meta');
                return !!(st && st.finished && st.v2Correct);
            });
            if (!quizPassed) {
                store.notify(
                    store.ui.lessonQuizRequired ||
                        'Answer the quiz correctly before continuing.',
                    true
                );
                return;
            }
        }

        // Mark the current section as visited so its TOC tick turns green.
        // Quiz sections are already marked by `answerQuizV2` when the user
        // gets a correct answer; for plain sections the "Next" click is the
        // only signal we have that the student finished reading.
        this.visitedSections.add(idx);

        if (idx < toc.length - 1) {
            this.scrollToSection(idx + 1);
            return;
        }
        if (!this._tryCompleteLessonFromTocProgress()) {
            store.notify(
                store.ui.lessonSectionsIncomplete ||
                    'Mark every section of the outline before completing the lesson.',
                true
            );
            return;
        }
        store.closeContent();
    },

    /** Updates only TOC modal list when typing filter (without rebuilding whole lesson). */
    patchTocFilterList() {
        if (!this.currentNode) return;
        if (this._tocInlineEditIdx != null) {
            const openInp = this.querySelector('.js-toc-edit-title');
            if (openInp && Number.isInteger(this._tocInlineEditIdx)) {
                this._applyTocRename(this._tocInlineEditIdx, openInp.value, '');
            }
            return;
        }
        const toc = getToc({ content: this._getContentForTocParse() });
        if (toc.length <= 1 && !this._isLessonConstructEdit()) return;
        if (toc.length === 0) return;
        const nav = this.querySelector('#lesson-toc-nav');
        if (!nav) return;
        const input = this.querySelector('#toc-filter');
        let selStart = 0;
        let selEnd = 0;
        if (input) {
            selStart = input.selectionStart ?? 0;
            selEnd = input.selectionEnd ?? 0;
        }
        const filteredToc = getFilteredToc(toc, this.tocFilter);
        const blocks = this._renderBlocks || [];
        nav.innerHTML = buildTocNavHtml(toc, filteredToc, this.activeSectionIndex, this.visitedSections, {
            ...this._tocMarkupOpts(),
            isSectionCompleted: (idx) =>
                isTocSectionCompleted(idx, toc, blocks, this.visitedSections, (id) => this.getQuizState(id))
        });
        this.bindTocRowHandlers();
        if (input) {
            input.value = this.tocFilter;
            try {
                input.focus({ preventScroll: true });
            } catch {
                input.focus();
            }
            try {
                const len = this.tocFilter.length;
                const start = Math.min(selStart, len);
                const end = Math.min(selEnd, len);
                input.setSelectionRange(start, end);
            } catch (_) { /* ignore */ }
        }
    },

    render() {
        const isBookmarked = this.currentNode ? !!store.getBookmark(this.currentNode.id, this.currentNode.content) : false;

        const constructEdit = this._isLessonConstructEdit();
        const n = this.currentNode;
        /** Includes the node surface; without this, saving icon/meta in place does not trigger a repaint (same ref, same stateKey). */
        const nodeSurfaceKey = n
            ? `${n.icon ?? ''}\u0001${(n.content || '').length}\u0001${(n.name || '').trim()}`
            : null;

        const stateKey = JSON.stringify({
            id: n ? n.id : null,
            nodeSurfaceKey,
            tocVisible: this.isTocVisible,
            section: this.activeSectionIndex,
            quizzes: this.quizStates,
            completed: n ? store.isCompleted(n.id) : false,
            visitedCount: this.visitedSections ? this.visitedSections.size : 0,
            bookmarked: isBookmarked,
            theme: store.value.theme,
            sourceId: store.value.activeSource?.id || null,
            constructionMode: store.value.constructionMode,
            constructEdit,
            tocInlineEditIdx: this._tocInlineEditIdx,
            lessonDraftNonce: this._lessonDraftNonce,
            lessonDraftSig: lessonDraftStateSig(this),
            mediaDeclined: this.mediaDeclinedLessonId,
            mediaNonce: this.mediaConsentNonce,
            mediaConsentFp: getMediaConsentStateFingerprint()
        });

        if (stateKey === this.lastRenderKey) return;
        this.lastRenderKey = stateKey;

        if (!this.currentNode) {
            this.innerHTML = '';
            this.className = '';
            return;
        }

        const ui = store.ui;
        if (typeof this._lessonInsertMenuCleanup === 'function') {
            try {
                this._lessonInsertMenuCleanup();
            } catch {
                /* ignore */
            }
            this._lessonInsertMenuCleanup = null;
        }
        const orphanInsert = document.getElementById('lesson-editor-insert-panel');
        if (orphanInsert && !this.contains(orphanInsert)) {
            orphanInsert.remove();
        }

        if (this._tocRenameDocPtr) {
            document.removeEventListener('pointerdown', this._tocRenameDocPtr, true);
            this._tocRenameDocPtr = null;
        }

        const skipDraftCap = this._skipLessonDraftDomCapture;
        this._skipLessonDraftDomCapture = false;
        if (constructEdit && this.querySelector('#lesson-visual-editor') && !skipDraftCap) {
            this._captureLessonDraftFromDom();
        }

        const contentForParse = this._getContentForTocParse();
        const isExam = isExamLesson(this.currentNode);
        const { blocks: allBlocks, toc, parsedForBlocks } = this._getLessonParseModel(
            contentForParse,
            isExam
        );
        const filteredToc = getFilteredToc(toc, this.tocFilter);

        const activeBlocks = getActiveBlocks(allBlocks, toc, this.activeSectionIndex);
        this._syncQuizSessionForSection(allBlocks, toc);

        this._renderBlocks = allBlocks;
        const getQuizStateBound = (id) => this.getQuizState(id);
        const progress =
            toc.length > 0
                ? computeLessonProgress(toc, allBlocks, this.visitedSections, getQuizStateBound)
                : 0;
        
        const quizSectionIndex = isExam ? findFirstQuizSectionIndex(allBlocks, toc) : -1;
        const onExamIntro =
            isExam &&
            quizSectionIndex > -1 &&
            this.activeSectionIndex < quizSectionIndex &&
            !constructEdit;

        const isFirstSection = this.activeSectionIndex === 0;

        this.className = '';

        this.lessonHeaderTitleValue = '';
        this.lessonHeaderDescValue = '';
        if (constructEdit && this.currentNode) {
            let titleVal = (this.currentNode.name || '').trim();
            let descVal = String(parsedForBlocks.meta.description || this.currentNode.description || '').trim();
            if (this._headerMetaDraft && this._headerMetaDraft.nodeId === this.currentNode.id) {
                if (this._headerMetaDraft.title != null) titleVal = this._headerMetaDraft.title;
                if (this._headerMetaDraft.description != null) descVal = this._headerMetaDraft.description;
            }
            this.lessonHeaderTitleValue = titleVal;
            this.lessonHeaderDescValue = descVal;
        }

        if (typeof this._lessonHeaderEmojiDocCleanup === 'function') {
            this._lessonHeaderEmojiDocCleanup();
            this._lessonHeaderEmojiDocCleanup = null;
        }

        this.innerHTML = renderContentHtml(this, allBlocks, toc, filteredToc, activeBlocks, progress, isExam, onExamIntro);

        /* Fire the lesson-edit tour the first time we render a lesson in construction edit
           mode. The tour itself is gated on a localStorage `done` key so this is a no-op
           after the first viewing. The product-tour element listens for this event and
           starts on the next microtask once the editor DOM is fully attached. */
        if (constructEdit && this.currentNode && this._lessonEditTourLastFiredFor !== this.currentNode.id) {
            this._lessonEditTourLastFiredFor = this.currentNode.id;
            try {
                window.dispatchEvent(new CustomEvent('arborito-lesson-edit-enter'));
            } catch {
                /* ignore */
            }
        }

        const safeBind = (selector, fn) => {
            const el = this.querySelector(selector);
            if(el) el.onclick = fn;
        };

        this.querySelectorAll('#btn-close-content-mobile, .btn-close-lesson').forEach((el) => {
            el.onclick = () => void this.handleClose();
        });

        const gameReadyBtn = this.querySelector('#btn-lesson-game-ready-info');
        if (gameReadyBtn && this._isLessonConstructEdit()) {
            gameReadyBtn.onclick = () => {
                const ui = store.ui;
                const ready = lessonContentHasCompleteQuiz(this.currentNode?.content);
                const body = ready
                    ? ui.lessonGameReadyInfoOn ||
                      'This lesson is ready for static Arcade games (questionnaire complete).'
                    : ui.lessonGameReadyInfoOff ||
                      'Complete the evaluation block (concept, definition, question, correct answer, and at least one distractor) to enable static games.';
                const title = ui.lessonGameReadyInfoBtn || ui.arcadeTitle || 'Arcade';
                void store.alert(body, title);
            };
        }
        safeBind('#btn-ask-sage', () => {
            store.setModal({ type: 'sage', mode: 'context', sageLessonContext: true });
            const sageEl = document.querySelector('arborito-sage');
            if (sageEl && typeof sageEl.checkState === 'function') sageEl.checkState();
        });
        safeBind('#btn-export-pdf', () => { store.setModal({ type: 'export-pdf', node: this.currentNode }); });
        safeBind('#btn-toggle-bookmark', () => this.toggleBookmark()); // Bind Bookmark Toggle
        safeBind('#btn-toggle-toc', () => this.toggleToc());
        safeBind('#toc-mobile-backdrop', () => this.toggleToc());

        // Bind Mobile Exit or Prev
        if (isFirstSection) {
            safeBind('#btn-exit-mobile', () => void this.handleClose());
        } else {
            safeBind('#btn-prev-mobile', () => this.scrollToSection(this.activeSectionIndex - 1));
        }

        safeBind('#btn-complete-mobile', () => this.completeAndNext());
        safeBind('#btn-start-exam-mobile', () => this.startTheExam());
        safeBind('#btn-later-mobile', () => void this.skipSection());
        safeBind('#btn-view-certificate', () => this.handleExamPass());

        const btnMediaAccept = this.querySelector('#btn-media-consent-accept');
        const btnMediaDecline = this.querySelector('#btn-media-consent-decline');
        if (btnMediaAccept) {
            btnMediaAccept.onclick = () => {
                const root = this.querySelector('#arborito-media-consent-root');
                let origins = [];
                const raw = root?.dataset?.pendingOrigins;
                if (raw) {
                    try {
                        origins = JSON.parse(decodeURIComponent(raw));
                    } catch {
                        origins = [];
                    }
                }
                persistMediaOriginsConsent(origins, true);
                this.mediaConsentNonce += 1;
                this.lastRenderKey = null;
                this.render();
            };
        }
        if (btnMediaDecline) {
            btnMediaDecline.onclick = () => {
                if (this.currentNode) this.mediaDeclinedLessonId = this.currentNode.id;
                this.mediaConsentNonce += 1;
                this.lastRenderKey = null;
                this.render();
            };
        }
        this.querySelectorAll('.arborito-media-consent-retry').forEach((btn) => {
            btn.onclick = () => {
                this.mediaDeclinedLessonId = null;
                this.mediaConsentNonce += 1;
                this.lastRenderKey = null;
                this.render();
            };
        });

        const tocFilterInput = this.querySelector('#toc-filter');
        if (tocFilterInput) {
            tocFilterInput.value = this.tocFilter;
            tocFilterInput.oninput = (e) => {
                this.tocFilter = e.target.value;
                this.patchTocFilterList();
            };
        }

        this.bindTocRowHandlers();

        this.querySelectorAll('.btn-quizv2-start').forEach((b) => {
            b.onclick = (e) => this.startQuizV2(e.currentTarget.dataset.id);
        });
        this.querySelectorAll('.btn-quizv2-ans').forEach((b) => {
            b.onclick = (e) => {
                const { id, correct } = e.currentTarget.dataset;
                this.answerQuizV2(id, correct === 'true');
            };
        });
        this.querySelectorAll('.btn-quizv2-retry').forEach((b) => {
            b.onclick = (e) => this.startQuizV2(e.currentTarget.dataset.id);
        });
        this.querySelectorAll('.btn-quizv2-next').forEach((b) => {
            b.onclick = () => this.advanceQuizSession();
        });
        this.querySelectorAll('.btn-quizv2-reveal').forEach((b) => {
            b.onclick = (e) => {
                const id = e.currentTarget.dataset.id;
                const st = this.getQuizState(id);
                this.quizStates[id] = { ...st, v2RecallRevealed: true };
                this.lastRenderKey = null;
                this.render();
            };
        });
        this.querySelectorAll('.btn-quizv2-recall').forEach((b) => {
            b.onclick = (e) => {
                const { id, correct } = e.currentTarget.dataset;
                this.answerQuizV2(id, correct === 'true');
            };
        });
        this.querySelectorAll('.btn-quizv2-cloze-check').forEach((b) => {
            b.onclick = (e) => {
                const id = e.currentTarget.dataset.id;
                const block = this._getQuizV2BlockById(id);
                const ch = block ? normalizeChallenge(block) : null;
                const inputs = Array.from(
                    this.querySelectorAll(`#${CSS.escape(id)} .quizv2-cloze-ans`)
                ).map((inp) => inp.value);
                this.answerQuizV2(id, ch ? validateClozeAnswers(ch, inputs) : false);
            };
        });
        this.querySelectorAll('.quizv2-chip-pick').forEach((b) => {
            b.onclick = (e) => {
                const id = e.currentTarget.dataset.id;
                const word = e.currentTarget.dataset.word;
                const st = this.getQuizState(id);
                const next = [...(st.v2ChipOrder || []), word];
                this.quizStates[id] = { ...st, v2ChipOrder: next };
                this.lastRenderKey = null;
                this.render();
            };
        });
        this.querySelectorAll('.quizv2-chip-picked').forEach((b) => {
            b.onclick = (e) => {
                const id = e.currentTarget.dataset.id;
                const pickIdx = parseInt(e.currentTarget.dataset.pickIdx, 10);
                const st = this.getQuizState(id);
                const next = [...(st.v2ChipOrder || [])];
                next.splice(pickIdx, 1);
                this.quizStates[id] = { ...st, v2ChipOrder: next };
                this.lastRenderKey = null;
                this.render();
            };
        });
        this.querySelectorAll('.btn-quizv2-chips-check').forEach((b) => {
            b.onclick = (e) => {
                const id = e.currentTarget.dataset.id;
                const block = this._getQuizV2BlockById(id);
                const ch = block ? normalizeChallenge(block) : null;
                const st = this.getQuizState(id);
                this.answerQuizV2(id, ch ? validateChipsOrder(ch, st.v2ChipOrder || []) : false);
            };
        });
        this.querySelectorAll('.btn-quizv2-steps-check').forEach((b) => {
            b.onclick = (e) => {
                const id = e.currentTarget.dataset.id;
                const block = this._getQuizV2BlockById(id);
                const ch = block ? normalizeChallenge(block) : null;
                const st = this.getQuizState(id);
                const order = st.v2StepsOrder || (ch ? ch.steps : []);
                this.answerQuizV2(id, ch ? validateStepsOrder(ch, order) : false);
            };
        });

        this.querySelectorAll('.btn-game-launch').forEach((b) => {
            b.onclick = (e) => {
                const url = e.currentTarget.dataset.url;
                const title = e.currentTarget.dataset.title;
                const topics = e.currentTarget.dataset.topics || '';
                void this.launchInlineGame(url, title, topics);
            };
        });

        if (constructEdit) {
            this._bindLessonShellEditor();
            this._bindLessonHeaderMeta();
        }
    }
};
