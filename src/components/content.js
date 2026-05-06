import { store } from '../store.js';
import { fileSystem } from '../services/filesystem.js';
import { ArboritoComponent } from '../utils/component.js';
import { parseContent, slugify } from '../utils/parser.js';
import { parseArboritoFile } from '../utils/editor-engine.js';
import { renderContentHtml } from './content-template.js';
import { getMediaConsentStateFingerprint, persistMediaOriginsConsent } from '../utils/third-party-media.js';
import { getToc, getActiveBlocks, getFilteredToc, buildTocListMarkup as buildTocNavHtml } from './content-toc.js';
import { isExamLesson } from '../utils/exam-context.js';
import {
    addTocSectionAfter,
    addTocSubsectionAfter,
    removeTocSection,
    renameTocSection,
    getTocLineRanges
} from '../utils/lesson-toc-mutations.js';
import { contentLessonConstructMethods } from './content-lesson-construct-mixin.js';

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

        /** @type {string | null} */
        this._lessonDraftLessonId = null;
        /** @type {string | null} */
        this._lessonBodyMarkdown = null;
        /** @type {string[]} */
        this._lessonHistoryStack = [];
        /** @type {'idle'|'saving'|'saved'} */
        this._lessonSaveState = 'idle';
        /** @type {number | null} TOC row in inline edit (construction mode) */
        this._tocInlineEditIdx = null;
        /** @type {number} invalidates render when mutating body draft */
        this._lessonDraftNonce = 0;
        /** @type {((ev: PointerEvent) => void) | null} close TOC edit when pointer leaves */
        this._tocRenameDocPtr = null;

        /** Prevents `_captureLessonDraftFromDom` overwriting draft after TOC-only mutation (DOM not updated yet). */
        this._skipLessonDraftDomCapture = false;

        /** Header draft (name / description) in construction mode */
        this._headerMetaDraft = null;
        /** @type {boolean} */
        this._headerMetaSaving = false;
        /** Cleanup for click-outside on header emoji picker (construction) */
        this._lessonHeaderEmojiDocCleanup = null;

        /** @type {boolean} */
        this._lessonMagicGenerating = false;

        this._onLessonMagicOpen = () => {
            if (!this._isLessonConstructEdit() || !this.currentNode) return;
            requestAnimationFrame(() => this._openLessonMagicOverlay());
        };

        this._onBreakpointChange = () => {
            this.isTocVisible = false;
            this.scheduleUpdate(true);
        };

        this._onGameOptionalClick = (e) => {
            const btn = e.target instanceof Element ? e.target.closest('.game-optional-toggle-btn') : null;
            if (!btn || !this.contains(btn)) return;
            const wrap = btn.closest('.arborito-game-edit');
            if (!wrap) return;
            const cur = wrap.getAttribute('data-optional') !== 'false';
            const next = !cur;
            wrap.setAttribute('data-optional', next ? 'true' : 'false');
            btn.setAttribute('aria-pressed', String(next));
            const lbl = btn.querySelector('.game-opt-lbl');
            const ui = store.ui;
            if (lbl) lbl.textContent = next ? ui.tagOptional || 'Optional' : ui.tagRequired || 'Required';
        };

        /**
         * Add/remove section in construction: `pointerdown` in capture so
         * `contenteditable`, sheets, or other handlers do not win before `click`.
         */
        this._onTocConstructPointer = (e) => {
            const target = e.target instanceof Element ? e.target : null;
            if (!target) return;
            
            const add = target.closest('.js-toc-construct-add');
            if (add) {
                e.preventDefault();
                e.stopPropagation();
                this._lessonTocAdd();
                return;
            }
            const addSubRow = target.closest('.js-toc-row-add-sub');
            if (addSubRow) {
                e.preventDefault();
                e.stopPropagation();
                const idx = parseInt(addSubRow.dataset.idx, 10);
                if (!Number.isNaN(idx)) this._lessonTocAddSubAt(idx);
                return;
            }
            const del = target.closest('.js-toc-construct-delete');
            if (del) {
                e.preventDefault();
                e.stopPropagation();
                const idx = parseInt(del.dataset.idx, 10);
                if (!Number.isNaN(idx)) this._lessonTocRemoveAt(idx);
            }
        };
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('arborito-viewport', this._onBreakpointChange);
        this.addEventListener('click', this._onGameOptionalClick);
        this.addEventListener('pointerdown', this._onTocConstructPointer, true);
        store.addEventListener('arborito-lesson-magic-open', this._onLessonMagicOpen);
    }

    disconnectedCallback() {
        window.removeEventListener('arborito-viewport', this._onBreakpointChange);
        this.removeEventListener('click', this._onGameOptionalClick);
        this.removeEventListener('pointerdown', this._onTocConstructPointer, true);
        store.removeEventListener('arborito-lesson-magic-open', this._onLessonMagicOpen);
        this._abortTocDnD?.();
        super.disconnectedCallback();
    }

    update() {
        this.render();
    }

    resetState() {
        if (this._tocRenameDocPtr) {
            document.removeEventListener('pointerdown', this._tocRenameDocPtr, true);
            this._tocRenameDocPtr = null;
        }
        this._skipLessonDraftDomCapture = false;
        this.activeSectionIndex = 0;
        this.visitedSections = new Set();
        this.tocFilter = '';
        this.quizStates = {};
        this._tocInlineEditIdx = null;
        this._headerMetaDraft = null;
        if (typeof this._lessonHeaderEmojiDocCleanup === 'function') {
            this._lessonHeaderEmojiDocCleanup();
        }
        this._lessonHeaderEmojiDocCleanup = null;
        this._abortTocDnD?.();
    }

    /** Texto efectivo para parsear temario/bloques: borrador de cuerpo o archivo completo. */
    _getContentForTocParse() {
        const node = this.currentNode;
        if (!node) return '';
        if (this._lessonDraftLessonId === node.id && this._lessonBodyMarkdown !== null) {
            return this._lessonBodyMarkdown;
        }
        return node.content || '';
    }

    /** Solo cuerpo markdown (para mutaciones del temario alineadas con el editor). */
    _getLessonBodyForToc() {
        const node = this.currentNode;
        if (!node) return '';
        if (this._lessonDraftLessonId === node.id && this._lessonBodyMarkdown !== null) {
            return this._lessonBodyMarkdown;
        }
        return parseArboritoFile(node.content || '').body;
    }

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
    }

    buildTocListMarkup(toc, filteredToc) {
        return buildTocNavHtml(toc, filteredToc, this.activeSectionIndex, this.visitedSections, this._tocMarkupOpts());
    }

    _applyTocRename(idx, title, emoji) {
        if (!this._isLessonConstructEdit()) return;
        this._captureLessonDraftFromDom();
        const body = this._getLessonBodyForToc();
        const next = renameTocSection(body, idx, title, emoji);
        this._lessonBodyMarkdown = next;
        this._lessonDraftLessonId = this.currentNode.id;
        this._lessonDraftNonce += 1;
        this._tocInlineEditIdx = null;
        this._skipLessonDraftDomCapture = true;
        this.lastRenderKey = null;
        this._lessonSaveState = 'idle';
        this.render();
    }

    _lessonTocAdd() {
        if (!this._isLessonConstructEdit()) return;
        this._captureLessonDraftFromDom();
        const body = this._getLessonBodyForToc();
        const ui = store.ui;
        const baseTitle = ui.lessonTocNewSectionTitle || 'New section';
        const tocNow = getToc({ content: body });
        const uniqueTitle = (base, toc) => {
            const b = String(base || '').trim();
            if (!b) return 'New section';
            const re = new RegExp(`^${b.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?:\\s+(\\d+))?$`, 'i');
            let max = 0;
            for (const it of toc || []) {
                if (!it || it.id === 'intro') continue;
                const t = String(it.text || '').trim();
                const m = t.match(re);
                if (!m) continue;
                const n = m[1] ? parseInt(m[1], 10) : 1;
                if (Number.isFinite(n)) max = Math.max(max, n);
            }
            return max <= 0 ? b : `${b} ${max + 1}`;
        };
        const title = uniqueTitle(baseTitle, tocNow);
        // Business rule: “+ New section” always creates a top-level section,
        // regardless of selection. Insert at end of document.
        const afterIdx = Math.max(0, tocNow.length - 1);
        const next = addTocSectionAfter(body, afterIdx, title);
        this._lessonBodyMarkdown = next;
        this._lessonDraftLessonId = this.currentNode.id;
        this._lessonDraftNonce += 1;
        const tocAfter = getToc({ content: next });
        this.activeSectionIndex = Math.max(0, tocAfter.length - 1);
        this._skipLessonDraftDomCapture = true;
        this.lastRenderKey = null;
        this._lessonSaveState = 'idle';
        this.render();
    }

    _lessonTocAddSub() {
        this._lessonTocAddSubAt(this.activeSectionIndex);
    }

    _lessonTocAddSubAt(afterIdx) {
        if (!this._isLessonConstructEdit()) return;
        this._captureLessonDraftFromDom();
        const body = this._getLessonBodyForToc();
        const ui = store.ui;
        const baseTitle = ui.lessonTocNewSubsectionTitle || 'New sub-topic';
        const safeAfter = Number.isInteger(afterIdx) ? afterIdx : this.activeSectionIndex;
        const tocNow = getToc({ content: body });
        const uniqueTitle = (base, toc) => {
            const b = String(base || '').trim();
            if (!b) return 'New sub-topic';
            const re = new RegExp(`^${b.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?:\\s+(\\d+))?$`, 'i');
            let max = 0;
            for (const it of toc || []) {
                if (!it || it.id === 'intro') continue;
                const t = String(it.text || '').trim();
                const m = t.match(re);
                if (!m) continue;
                const n = m[1] ? parseInt(m[1], 10) : 1;
                if (Number.isFinite(n)) max = Math.max(max, n);
            }
            return max <= 0 ? b : `${b} ${max + 1}`;
        };
        const title = uniqueTitle(baseTitle, tocNow);
        const next = addTocSubsectionAfter(body, safeAfter, title);
        this._lessonBodyMarkdown = next;
        this._lessonDraftLessonId = this.currentNode.id;
        this._lessonDraftNonce += 1;
        const tocAfter = getToc({ content: next });
        const sid = slugify(title);
        let newIdx = -1;
        for (let i = tocAfter.length - 1; i >= 0; i--) {
            if (tocAfter[i].id === sid) {
                newIdx = i;
                break;
            }
        }
        this.activeSectionIndex = newIdx >= 0 ? newIdx : Math.max(0, tocAfter.length - 1);
        this._skipLessonDraftDomCapture = true;
        this.lastRenderKey = null;
        this._lessonSaveState = 'idle';
        this.render();
    }

    _lessonTocRemove() {
        this._lessonTocRemoveAt(this.activeSectionIndex);
    }

    /**
     * Removes section at `idx` (same pattern as deleting a graph node by row).
     * Keeps at least one section and the virtual “Intro” entry.
     */
    _lessonTocRemoveAt(idx) {
        if (!this._isLessonConstructEdit()) return;
        this._captureLessonDraftFromDom();
        const body = this._getLessonBodyForToc();
        const toc = getToc({ content: body });
        const ui = store.ui;
        if (toc.length <= 1) {
            store.notify(ui.lessonTocRemoveBlocked || 'At least one section is required.', true);
            return;
        }
        const safeIdx = Number.isInteger(idx) ? idx : this.activeSectionIndex;
        const target = toc[safeIdx];
        if (!target || target.id === 'intro' || target.isQuiz) return;
        const next = removeTocSection(body, safeIdx);
        this._lessonBodyMarkdown = next;
        this._lessonDraftLessonId = this.currentNode.id;
        this._lessonDraftNonce += 1;
        const tocAfter = getToc({ content: next });
        if (this.activeSectionIndex >= safeIdx) {
            this.activeSectionIndex = Math.max(0, Math.min(this.activeSectionIndex - 1, tocAfter.length - 1));
        }
        this._skipLessonDraftDomCapture = true;
        this.lastRenderKey = null;
        this._lessonSaveState = 'idle';
        this.render();
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
                    'You are about to load an external game that may include third-party content. Continue? (This notice will not be shown again.)';
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
            this._lessonDraftLessonId = null;
            this._lessonBodyMarkdown = null;
            this._lessonHistoryStack = [];
            this._lessonSaveState = 'idle';
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
        if (newId != null && newNode && currentId === newId && newNode !== this.currentNode) {
            this.currentNode = newNode;
            this._headerMetaDraft = null;
            this.lastRenderKey = null;
        }
        if (!this.currentNode && this.innerHTML === '') {
            return false;
        }
    }

    

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
        nav.innerHTML = buildTocNavHtml(toc, filteredToc, this.activeSectionIndex, this.visitedSections, this._tocMarkupOpts());
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

    // --- Render ---

    render() {
        const isBookmarked = this.currentNode ? !!store.getBookmark(this.currentNode.id, this.currentNode.content) : false;

        const constructEdit = this._isLessonConstructEdit();
        const n = this.currentNode;
        /** Incluye superficie del nodo: sin esto, guardar icono/meta en sitio no dispara repaint (misma ref, mismo stateKey). */
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
            mediaConsentFp: getMediaConsentStateFingerprint(),
            nostrLiveSeeds: store.value.nostrLiveSeeds
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
        const allBlocks = parseContent(contentForParse);
        const toc = getToc({ content: contentForParse });
        const filteredToc = getFilteredToc(toc, this.tocFilter);

        const activeBlocks = getActiveBlocks(allBlocks, toc, this.activeSectionIndex);
        
        // Progress based on actual visited sections (ticks)
        const progress = toc.length > 0 ? Math.round((this.visitedSections.size / toc.length) * 100) : 0;
        
        const isExam = isExamLesson(this.currentNode);
        const quizSectionIndex = isExam ? toc.findIndex(item => item.isQuiz) : -1;
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
            const parsedHdr = parseArboritoFile(this.currentNode.content || '');
            let titleVal = (this.currentNode.name || '').trim();
            let descVal = String(parsedHdr.meta.description || this.currentNode.description || '').trim();
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

        const safeBind = (selector, fn) => {
            const el = this.querySelector(selector);
            if(el) el.onclick = fn;
        };

        safeBind('#btn-close-content-mobile', () => this.handleClose());

        safeBind('#btn-ask-sage', () => { store.setModal({ type: 'sage', mode: 'chat' }); });
        safeBind('#btn-export-pdf', () => { store.setModal({ type: 'export-pdf', node: this.currentNode }); });
        safeBind('#btn-toggle-bookmark', () => this.toggleBookmark()); // Bind Bookmark Toggle
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

        if (constructEdit) {
            this._bindLessonShellEditor();
            this._bindLessonHeaderMeta();
        }
    }
}

Object.assign(ArboritoContent.prototype, contentLessonConstructMethods);

customElements.define('arborito-content', ArboritoContent);
