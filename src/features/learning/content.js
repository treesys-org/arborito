import { store } from '../../core/store.js';
import { ArboritoComponent } from '../../shared/ui/component.js';
import { insertBlockInEditor } from '../editor/editor-commands.js';
import { contentLessonConstructMethods } from '../editor/content-lesson-construct/index.js';
import { renderMixin } from './content-mixins/render-mixin.js';
import { bindingsMixin } from './content-mixins/bindings-mixin.js';
import { quizV2Mixin } from './content-mixins/quiz-v2-mixin.js';
import { examMixin } from './content-mixins/exam-mixin.js';
import { cacheMixin } from './content-mixins/cache-mixin.js';
import { modalDispatchMixin } from './content-mixins/modal-dispatch-mixin.js';

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
        this.quizSession = null;
        /** @type {{ key: string, blocks: object[], toc: object[], parsedForBlocks: object } | null} */
        this._lessonParseCache = null;
        /** @type {string | null} */
        this._lessonStoreFp = null;
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
        /** @type {string|null} */
        this._careFeedbackMsg = null;
        /** Cleanup for click-outside on header emoji picker (construction) */
        this._lessonHeaderEmojiDocCleanup = null;

        /** @type {boolean} */
        this._lessonMagicGenerating = false;

        this._onLessonMagicOpen = () => {
            if (!this._isLessonConstructEdit() || !this.currentNode) return;
            requestAnimationFrame(() => {
                const editorEl = this.querySelector('#lesson-visual-editor');
                if (!editorEl) return;
                this._pushLessonHistory(editorEl);
                insertBlockInEditor(editorEl, 'quizv2');
            });
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
        this.quizSession = null;
        this._tocInlineEditIdx = null;
        this._headerMetaDraft = null;
        this._invalidateLessonParseCache();
        this._lessonStoreFp = null;
        if (typeof this._lessonHeaderEmojiDocCleanup === 'function') {
            this._lessonHeaderEmojiDocCleanup();
        }
        this._lessonHeaderEmojiDocCleanup = null;
        this._abortTocDnD?.();
    }
}

Object.assign(
    ArboritoContent.prototype,
    renderMixin,
    bindingsMixin,
    quizV2Mixin,
    examMixin,
    cacheMixin,
    modalDispatchMixin,
    contentLessonConstructMethods
);

customElements.define('arborito-content', ArboritoContent);
