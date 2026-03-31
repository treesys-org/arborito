
import { store } from '../store.js';
import { ArboritoComponent } from '../utils/component.js';
import { parseContent } from '../utils/parser.js';
import { github } from '../services/github.js';
import { ContentRenderer } from '../utils/renderer.js';
import { renderContentHtml } from './content-template.js';
import { getMediaConsentStateFingerprint, persistMediaOriginsConsent } from '../utils/third-party-media.js';
import { getToc, getActiveBlocks, getFilteredToc, buildTocListMarkup as buildTocNavHtml } from './content-toc.js';
import { isExamLesson } from '../utils/exam-context.js';



class ArboritoContent extends ArboritoComponent {
    constructor() {
        super();
        this.currentNode = null;
        this.isTocVisible = false;
        this.lastRenderKey = null;
        this.activeSectionIndex = 0;
        this.visitedSections = new Set();
        this.tocFilter = '';
        this.quizStates = {};
        /** @type {string | null} lesson id if user declined external media modal (re-show via placeholder) */
        this.mediaDeclinedLessonId = null;
        this.mediaConsentNonce = 0;

        this._onBreakpointChange = () => {
            this.isTocVisible = false;
            this.scheduleUpdate(true);
        };
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('arborito-viewport', this._onBreakpointChange);
    }

    disconnectedCallback() {
        window.removeEventListener('arborito-viewport', this._onBreakpointChange);
        super.disconnectedCallback();
    }

    update() {
        this.render();
    }

    resetState() {
        this.activeSectionIndex = 0;
        this.visitedSections = new Set();
        this.tocFilter = '';
        this.quizStates = {};
    }

    buildTocListMarkup(toc, filteredToc) {
        return buildTocNavHtml(toc, filteredToc, this.activeSectionIndex, this.visitedSections);
    }

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
    }

    scrollToSection(idx) {
        this.activeSectionIndex = idx;
        if (this.currentNode) {
            store.saveBookmark(
                this.currentNode.id,
                this.currentNode.content,
                this.activeSectionIndex,
                this.visitedSections
            );
        }
        this.lastRenderKey = null;
        this.scheduleUpdate(true);
    }

    handleClose() {
        if (this.currentNode) {
            store.saveBookmark(
                this.currentNode.id,
                this.currentNode.content,
                this.activeSectionIndex,
                this.visitedSections
            );
        }
        store.closeContent();
    }

    toggleToc() {
        this.isTocVisible = !this.isTocVisible;
        this.lastRenderKey = null;
        this.render();
    }

    toggleBookmark() {
        if (!this.currentNode) return;
        const has = store.getBookmark(this.currentNode.id, this.currentNode.content);
        if (has) store.removeBookmark(this.currentNode.id);
        else {
            store.saveBookmark(
                this.currentNode.id,
                this.currentNode.content,
                this.activeSectionIndex,
                this.visitedSections
            );
        }
        this.lastRenderKey = null;
        this.render();
    }

    completeAndNext() {
        if (!this.currentNode) return;
        const toc = getToc(this.currentNode);
        if (this.activeSectionIndex < toc.length - 1) {
            this.scrollToSection(this.activeSectionIndex + 1);
            return;
        }
        store.markComplete(this.currentNode.id);
        store.checkForModuleCompletion(this.currentNode.id);
        store.closeContent();
    }

    async launchInlineGame(url, title, topics) {
        const u = String(url || '').trim();
        if (!u) return;

        // One-time warning for loading external games from lessons
        try {
            const hideKey = 'arborito-inline-game-warning-hide';
            const alreadyHidden = localStorage.getItem(hideKey) === 'true';
            if (!alreadyHidden) {
                const ui = store.ui;
                const msg =
                    ui.inlineGameWarning ||
                    'Vas a cargar un juego externo que puede incluir contenido de terceros. ¿Quieres continuar? (Este aviso no se mostrará de nuevo.)';
                const ok = await store.confirm(msg);
                if (!ok) return;
                localStorage.setItem(hideKey, 'true');
            }
        } catch {
            // Ignore storage/confirm errors, fall through to launch
        }

        const activeSource = store.value.activeSource;
        if (!activeSource) {
            // Fallback: user can still open Arcade from the tree chrome
            store.notify(store.ui.errorNoContent || 'No active source selected.', true);
            return;
        }
        const lang = store.value.lang || 'EN';
        const node = this.currentNode;
        const parent = node?.parentId ? store.findNode(node.parentId) : null;
        const moduleId =
            parent && (parent.type === 'branch' || parent.type === 'root') ? parent.id : (node?.id || null);
        if (!moduleId) return;
        const targetNode = store.findNode(moduleId);
        const modulePath = targetNode?.apiPath || targetNode?.contentPath || '';
        const treeUrl = encodeURIComponent(activeSource.url);
        const encodedPath = encodeURIComponent(modulePath);

        let finalUrl = u;
        const separator = finalUrl.includes('?') ? '&' : '?';
        finalUrl += `${separator}source=${treeUrl}&lang=${lang}`;
        if (encodedPath) finalUrl += `&module=${encodedPath}`;
        finalUrl += `&moduleId=${encodeURIComponent(String(moduleId))}`;
        const topicIds = Array.isArray(topics)
            ? topics.map((t) => String(t).trim()).filter(Boolean)
            : String(topics || '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
        if (topicIds.length > 0) {
            finalUrl += `&topics=${encodeURIComponent(topicIds.join(','))}`;
        }

        store.setModal({
            type: 'game-player',
            url: finalUrl,
            title: title || store.ui.gameDefaultTitle,
            moduleId
        });
    }

    startTheExam() {
        if (!this.currentNode) return;
        const toc = getToc(this.currentNode);
        const quizIdx = toc.findIndex((item) => item.isQuiz);
        if (quizIdx >= 0) this.scrollToSection(quizIdx);
    }

    skipSection() {
        if (!this.currentNode) return;
        store.saveBookmark(
            this.currentNode.id,
            this.currentNode.content,
            this.activeSectionIndex,
            this.visitedSections
        );
        store.closeContent();
    }

    handleExamPass() {
        const n = this.currentNode;
        if (!n) return;
        // One-shot repair: older sessions showed the cert UI without persisting exam completion.
        if (isExamLesson(n) && n.content) {
            const blocks = parseContent(n.content);
            const quizBlock = blocks.find((b) => b.type === 'quiz');
            if (quizBlock?.questions?.length) {
                const st = this.getQuizState(quizBlock.id);
                const total = quizBlock.questions.length;
                const passingScore = Math.ceil(total * 0.8);
                if (st.finished && st.score >= passingScore) {
                    store.markComplete(n.id, true);
                    store.markExamExemptSiblingLeaves(n.id);
                }
            }
        }
        const parent = n.parentId ? store.findNode(n.parentId) : null;
        const moduleId =
            parent && (parent.type === 'branch' || parent.type === 'root') ? parent.id : n.id;
        store.setModal({ type: 'certificate', moduleId });
    }

    startQuiz(id) {
        this.quizStates[id] = { started: true, finished: false, currentIdx: 0, score: 0, results: [] };
        this.lastRenderKey = null;
        this.render();
    }

    answerQuiz(id, correct, total) {
        const st = this.getQuizState(id);
        const results = [...(st.results || [])];
        results.push(!!correct);
        const next = {
            started: true,
            finished: false,
            currentIdx: st.currentIdx,
            score: st.score + (correct ? 1 : 0),
            results
        };
        if (next.currentIdx + 1 >= total) next.finished = true;
        else next.currentIdx += 1;
        this.quizStates[id] = next;

        // Persist exam pass: certificate UI used to show without marking the exam (or module) complete.
        if (next.finished && this.currentNode && isExamLesson(this.currentNode)) {
            const passingScore = Math.ceil(total * 0.8);
            if (next.score >= passingScore) {
                store.markComplete(this.currentNode.id, true);
                store.markExamExemptSiblingLeaves(this.currentNode.id);
            }
        }

        this.lastRenderKey = null;
        this.render();
    }

    /** Sync local node from store; bookmarks on navigation. */
    onState(detail) {
        const newNode = detail.selectedNode;
        const newId = newNode ? newNode.id : null;
        const currentId = this.currentNode ? this.currentNode.id : null;

        if (newId !== currentId) {
            this.currentNode = newNode;
            this.mediaDeclinedLessonId = null;
            if (newNode) {
                this.resetState();
                const bookmark = store.getBookmark(newNode.id, newNode.content);
                if (bookmark) {
                    this.activeSectionIndex = bookmark.index || 0;
                    this.visitedSections = new Set(bookmark.visited || []);
                }
                this.isTocVisible = false;
            }
            return;
        }
        if (!this.currentNode && this.innerHTML === '') {
            return false;
        }
    }

    

    proposeChange() {
        const repoInfo = github.getRepositoryInfo();
        if (!repoInfo || !this.currentNode) {
            store.alert(store.ui.contentRepoUnknown || 'Cannot determine the source repository.');
            return;
        }

        const title = `Change Suggestion: ${this.currentNode.name}`;
        const bodyTemplate = `
### 📝 Description of Change
<!-- Please describe the change you are proposing here. Be as specific as possible. -->


### 📍 Location
- **File:** \`${this.currentNode.sourcePath}\`
- **Lesson:** ${this.currentNode.name}

---
*This issue was generated automatically from the Arborito interface.*
        `;

        const encodedTitle = encodeURIComponent(title);
        const encodedBody = encodeURIComponent(bodyTemplate.trim());

        const url = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/issues/new?title=${encodedTitle}&body=${encodedBody}`;
        window.open(url, '_blank');
    }

    

    

    /** Actualiza solo el listado del modal de temas al escribir en el filtro (sin rehacer toda la lección). */
    patchTocFilterList() {
        if (!this.currentNode) return;
        const toc = getToc(this.currentNode);
        if (toc.length <= 1) return;
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
        nav.innerHTML = buildTocNavHtml(toc, filteredToc, this.activeSectionIndex, this.visitedSections);
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
    }

    bindTocRowHandlers() {
        this.querySelectorAll('.btn-toc').forEach((b) => {
            b.onclick = (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx, 10);

                if (e.target.closest('.js-toc-tick')) {
                    e.stopPropagation();

                    if (this.visitedSections.has(idx)) {
                        this.visitedSections.delete(idx);
                        if (this.currentNode && store.isCompleted(this.currentNode.id)) {
                            store.markComplete(this.currentNode.id, false);
                        }
                    } else {
                        this.visitedSections.add(idx);
                    }

                    if (this.currentNode) {
                        store.saveBookmark(
                            this.currentNode.id,
                            this.currentNode.content,
                            this.activeSectionIndex,
                            this.visitedSections
                        );
                    }
                    this.render();
                    return;
                }

                if (idx === this.activeSectionIndex) {
                    const ca = this.querySelector('#content-area');
                    const savedTop = ca ? ca.scrollTop : 0;
                    this.isTocVisible = false;
                    this.lastRenderKey = null;
                    this.scheduleUpdate(true);
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            const next = this.querySelector('#content-area');
                            if (next) next.scrollTop = savedTop;
                        });
                    });
                    return;
                }
                this.isTocVisible = false;
                this.scrollToSection(idx);
            };
        });
    }

    // --- Render ---

    render() {
        const isBookmarked = this.currentNode ? !!store.getBookmark(this.currentNode.id, this.currentNode.content) : false;

        const stateKey = JSON.stringify({
            id: this.currentNode ? this.currentNode.id : null,
            tocVisible: this.isTocVisible,
            section: this.activeSectionIndex,
            quizzes: this.quizStates,
            completed: this.currentNode ? store.isCompleted(this.currentNode.id) : false,
            visitedCount: this.visitedSections ? this.visitedSections.size : 0,
            bookmarked: isBookmarked,
            theme: store.value.theme,
            sourceId: store.value.activeSource?.id || null,
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
        const allBlocks = parseContent(this.currentNode.content);
        const toc = getToc(this.currentNode);
        const filteredToc = getFilteredToc(toc, this.tocFilter);

        const activeBlocks = getActiveBlocks(allBlocks, toc, this.activeSectionIndex);
        
        // Progress based on actual visited sections (ticks)
        const progress = toc.length > 0 ? Math.round((this.visitedSections.size / toc.length) * 100) : 0;
        
        const isExam = isExamLesson(this.currentNode);
        const quizSectionIndex = isExam ? toc.findIndex(item => item.isQuiz) : -1;
        const onExamIntro = isExam && quizSectionIndex > -1 && this.activeSectionIndex < quizSectionIndex;

        const isFirstSection = this.activeSectionIndex === 0;

        this.className = '';
        this.innerHTML = renderContentHtml(this, allBlocks, toc, filteredToc, activeBlocks, progress, isExam, onExamIntro);

        const safeBind = (selector, fn) => {
            const el = this.querySelector(selector);
            if(el) el.onclick = fn;
        };

        safeBind('#btn-close-content-mobile', () => this.handleClose());
        
        // Removed btn-edit-content binding as button was removed
        safeBind('#btn-ask-sage', () => { store.setModal({ type: 'sage', mode: 'chat' }); });
        safeBind('#btn-export-pdf', () => { store.setModal({ type: 'export-pdf', node: this.currentNode }); });
        safeBind('#btn-toggle-bookmark', () => this.toggleBookmark()); // Bind Bookmark Toggle
        safeBind('#btn-propose-change', () => this.proposeChange());
        safeBind('#btn-toggle-toc', () => this.toggleToc());
        safeBind('#toc-mobile-backdrop', () => this.toggleToc());
        
        // Bind Mobile Exit or Prev
        if (isFirstSection) {
            safeBind('#btn-exit-mobile', () => this.handleClose());
        } else {
            safeBind('#btn-prev-mobile', () => this.scrollToSection(this.activeSectionIndex - 1));
        }

        safeBind('#btn-complete-mobile', () => this.completeAndNext());
        safeBind('#btn-start-exam-mobile', () => this.startTheExam());
        safeBind('#btn-later-mobile', () => this.skipSection());
        safeBind('#btn-view-certificate', () => this.handleExamPass());

        const btnMediaAccept = this.querySelector('#btn-media-consent-accept');
        const chkMediaRemember = this.querySelector('#chk-media-consent-remember');
        const btnMediaDecline = this.querySelector('#btn-media-consent-decline');
        if (btnMediaAccept) {
            btnMediaAccept.onclick = () => {
                const remember = !!(chkMediaRemember && chkMediaRemember.checked);
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
                persistMediaOriginsConsent(origins, remember);
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

        this.querySelectorAll('.btn-quiz-start').forEach(b => {
            b.onclick = (e) => this.startQuiz(e.currentTarget.dataset.id);
        });
        
        this.querySelectorAll('.btn-quiz-ans').forEach(b => {
            b.onclick = (e) => {
                const { id, correct, total } = e.currentTarget.dataset;
                this.answerQuiz(id, correct === 'true', parseInt(total));
            };
        });
        
        this.querySelectorAll('.btn-quiz-retry').forEach(b => {
             b.onclick = (e) => this.startQuiz(e.currentTarget.dataset.id);
        });

        this.querySelectorAll('.btn-game-launch').forEach((b) => {
            b.onclick = (e) => {
                const url = e.currentTarget.dataset.url;
                const title = e.currentTarget.dataset.title;
                const topics = e.currentTarget.dataset.topics || '';
                void this.launchInlineGame(url, title, topics);
            };
        });
    }
}
customElements.define('arborito-content', ArboritoContent);
