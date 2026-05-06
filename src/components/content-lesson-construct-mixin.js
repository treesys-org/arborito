import { store } from '../store.js';
import { fileSystem } from '../services/filesystem.js';
import {
    parseArboritoFile,
    markdownToVisualHTML,
    visualHTMLToMarkdown
} from '../utils/editor-engine.js';
import { execCmdOnEditor, insertBlockInEditor } from '../utils/editor-commands.js';
import { persistNodeMetaProperties } from '../utils/node-meta-persist.js';
import { aiService } from '../services/ai.js';
import { getToc } from './content-toc.js';
import { parseContent } from '../utils/parser.js';
import { moveTocSectionRange, reorderTocSectionRange, setTocSectionLevel } from '../utils/lesson-toc-mutations.js';
import { parseOutline, moveSubtree, impliedParentId } from '../utils/lesson-toc-tree.js';

/** Lesson editor / TOC construction handlers (split from content.js). */
export const contentLessonConstructMethods = {
    _setLessonSaveButtonSavedVisual(btn, saved) {
        if (!btn) return;
        if (saved) {
            btn.classList.add('arborito-lesson-save-btn--saved');
            btn.disabled = true;
            btn.style.transform = 'translateY(1px)';
            btn.style.background = 'linear-gradient(180deg, rgb(226 232 240) 0%, rgb(203 213 225) 100%)';
            btn.style.borderColor = 'rgb(148 163 184 / 0.65)';
            btn.style.color = 'rgb(30 41 59)';
            btn.style.boxShadow =
                'inset 0 2px 6px rgb(0 0 0 / 0.14), inset 0 1px 0 rgb(255 255 255 / 0.85)';
            btn.style.filter = 'none';
        } else {
            btn.classList.remove('arborito-lesson-save-btn--saved');
            btn.disabled = false;
            btn.style.transform = '';
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
            btn.style.boxShadow = '';
            btn.style.filter = '';
        }
    },

    _isLessonConstructEdit() {
        const n = this.currentNode;
        return (
            !!store.value.constructionMode &&
            fileSystem.features.canWrite &&
            n &&
            (n.type === 'leaf' || n.type === 'exam')
        );
    },

    _bindLessonHeaderMeta() {
        const titleInp = this.querySelector('#inp-lesson-header-title');
        const descInp = this.querySelector('#inp-lesson-header-desc');
        const emojiBtn = this.querySelector('#btn-lesson-node-meta');
        const picker = this.querySelector('#lesson-header-emoji-picker');
        if (!titleInp || !descInp || !this._isLessonConstructEdit()) return;

        const syncDraft = () => {
            const n = store.findNode(this.currentNode.id) || this.currentNode;
            this._headerMetaDraft = {
                nodeId: n.id,
                title: titleInp.value,
                description: descInp.value
            };
            this._lessonSaveState = 'idle';
            const saveBtn = this.querySelector('#btn-lesson-save');
            if (saveBtn) {
                this._setLessonSaveButtonSavedVisual(saveBtn, false);
                saveBtn.disabled = false;
            }
        };

        titleInp.addEventListener('input', syncDraft);
        descInp.addEventListener('input', syncDraft);

        // Main editor "Save" persists name, description, and content together
        // (see `_saveLessonShell`). We no longer autosave on focusout to avoid races
        // with Save and to give a clear moment of persistence.

        if (emojiBtn && picker) {
            let docListener = null;
            const closePicker = () => {
                picker.classList.add('hidden');
                emojiBtn.setAttribute('aria-expanded', 'false');
                if (docListener) {
                    document.removeEventListener('click', docListener);
                    docListener = null;
                }
                this._lessonHeaderEmojiDocCleanup = null;
            };

            this._lessonHeaderEmojiDocCleanup = () => {
                if (docListener) {
                    document.removeEventListener('click', docListener);
                    docListener = null;
                }
                if ((picker && picker.classList)) {
                    picker.classList.add('hidden');
                    emojiBtn.setAttribute('aria-expanded', 'false');
                }
            };

            emojiBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isHidden = picker.classList.contains('hidden');
                if (docListener) {
                    document.removeEventListener('click', docListener);
                    docListener = null;
                }
                if (isHidden) {
                    picker.classList.remove('hidden');
                    emojiBtn.setAttribute('aria-expanded', 'true');
                    docListener = () => {
                        closePicker();
                    };
                    setTimeout(() => document.addEventListener('click', docListener), 0);
                } else {
                    closePicker();
                }
            });

            this.querySelectorAll('.js-lesson-header-emoji-choice').forEach((b) => {
                b.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const icon = (b.textContent || '').trim();
                    closePicker();
                    void this._saveLessonHeaderIcon(icon);
                });
            });
        }
    },

    async _saveLessonHeaderMeta() {
        if (!this._isLessonConstructEdit() || !this.currentNode || this._headerMetaSaving) return;
        const titleInp = this.querySelector('#inp-lesson-header-title');
        const descInp = this.querySelector('#inp-lesson-header-desc');
        if (!titleInp || !descInp) return;

        const node = store.findNode(this.currentNode.id) || this.currentNode;
        const parsed = parseArboritoFile(node.content || '');
        const name = titleInp.value.trim();
        const description = descInp.value.trim();

        if (!name) {
            const ui = store.ui;
            titleInp.classList.add('arborito-input-required-empty');
            setTimeout(() => titleInp.classList.remove('arborito-input-required-empty'), 3000);
            store.notify(ui.lessonNameRequired || ui.graphPromptLessonName || 'Lesson name is required.', true);
            return;
        }

        const baselineName = (parsed.meta.title || node.name || '').trim();
        const baselineDesc = String((parsed.meta.description != null ? parsed.meta.description : (node.description != null ? node.description : ''))).trim();
        if (name === baselineName && description === baselineDesc) return;

        const bodyMd =
            this._lessonDraftLessonId === node.id && this._lessonBodyMarkdown !== null
                ? this._lessonBodyMarkdown
                : parsed.body;

        const icon = parsed.meta.icon || node.icon || '📄';
        this._headerMetaSaving = true;
        const ui = store.ui;
        const saveBtn = this.querySelector('#btn-lesson-save');
        try {
            await persistNodeMetaProperties(
                { fileSystem, store },
                {
                    node,
                    name,
                    icon,
                    description,
                    originalMeta: parsed.meta,
                    originalBody: bodyMd
                }
            );
            this._headerMetaDraft = null;
            if (saveBtn) this._setLessonSaveButtonSavedVisual(saveBtn, true);
        } catch (e) {
            store.alert(
                (ui.nodePropertiesSaveError || 'Error saving properties: {message}').replace('{message}', e.message)
            );
        } finally {
            this._headerMetaSaving = false;
        }
    },

    async _saveLessonHeaderIcon(icon) {
        if (!this._isLessonConstructEdit() || !this.currentNode || this._headerMetaSaving) return;
        const node = store.findNode(this.currentNode.id) || this.currentNode;
        const parsed = parseArboritoFile(node.content || '');
        const baselineIcon = parsed.meta.icon || node.icon || '📄';
        if (icon === baselineIcon) return;

        const titleInp = this.querySelector('#inp-lesson-header-title');
        const descInp = this.querySelector('#inp-lesson-header-desc');
        if (!titleInp || !descInp) return;
        const name = titleInp.value.trim();
        const description = descInp.value.trim();
        if (!name) {
            const ui = store.ui;
            titleInp.value = node.name;
            store.notify(ui.graphPromptLessonName || 'Lesson name:', true);
            return;
        }

        const bodyMd =
            this._lessonDraftLessonId === node.id && this._lessonBodyMarkdown !== null
                ? this._lessonBodyMarkdown
                : parsed.body;

        this._headerMetaSaving = true;
        const ui = store.ui;
        try {
            await persistNodeMetaProperties(
                { fileSystem, store },
                {
                    node,
                    name,
                    icon,
                    description,
                    originalMeta: parsed.meta,
                    originalBody: bodyMd
                }
            );
            this._headerMetaDraft = null;
        } catch (e) {
            store.alert(
                (ui.nodePropertiesSaveError || 'Error saving properties: {message}').replace('{message}', e.message)
            );
        } finally {
            this._headerMetaSaving = false;
        }
    },

    _captureLessonDraftFromDom() {
        const ed = this.querySelector('#lesson-visual-editor');
        if (!ed || !this._isLessonConstructEdit()) return;
        this._lessonBodyMarkdown = visualHTMLToMarkdown(ed);
    },

    _assignHeadingIdsFromBlocks(editorEl, markdownBody) {
        const blocks = parseContent(markdownBody || '');
        const ids = [];
        for (const b of blocks) {
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'subsection'].includes(b.type)) ids.push(b.id);
        }
        const markers = editorEl.querySelectorAll(
            'h1, h2, h3, h4, h5, h6, .arborito-authoring-outline'
        );
        markers.forEach((h, i) => {
            if (ids[i]) h.id = ids[i];
        });
    },

    _scrollConstructSectionIntoView(idx) {
        const n = this.currentNode;
        if (!n) return;
        const toc = getToc({ content: this._getContentForTocParse() });
        const item = toc[idx];
        if (!item) return;
        const root = this.querySelector('#lesson-visual-editor');
        if (!root) return;
        if (item.id === 'intro') {
            root.scrollIntoView({ block: 'start' });
            return;
        }
        const el = root.querySelector(`#${CSS.escape(item.id)}`);
        if (el) {
            let target = el;
            if ((target.classList && target.classList.contains)('arborito-authoring-outline')) {
                let next = target.nextElementSibling;
                while (next && (next.classList && next.classList.contains)('arborito-authoring-outline')) {
                    next = next.nextElementSibling;
                }
                if (next) target = next;
            }
            target.scrollIntoView({ block: 'start' });
        }
    },

    _pushLessonHistory(editorEl) {
        if (!editorEl) return;
        if (this._lessonHistoryStack.length > 20) this._lessonHistoryStack.shift();
        this._lessonHistoryStack.push(editorEl.innerHTML);
        const btn = this.querySelector('#btn-lesson-undo');
        if (btn) {
            btn.disabled = this._lessonHistoryStack.length === 0;
            btn.style.opacity = btn.disabled ? '0.5' : '1';
        }
    },

    _lessonUndo(editorEl) {
        if (this._lessonHistoryStack.length === 0 || !editorEl) return;
        const prev = this._lessonHistoryStack.pop();
        editorEl.innerHTML = prev;
        this._assignHeadingIdsFromBlocks(editorEl, visualHTMLToMarkdown(editorEl));
        const btn = this.querySelector('#btn-lesson-undo');
        if (btn) {
            btn.disabled = this._lessonHistoryStack.length === 0;
            btn.style.opacity = btn.disabled ? '0.5' : '1';
        }
    },

    _openLessonMagicOverlay() {
        if (!this._isLessonConstructEdit()) return;
        const overlay = this.querySelector('#lesson-magic-overlay');
        const inp = this.querySelector('#inp-lesson-magic-prompt');
        if (!overlay || !inp || this._lessonMagicGenerating) return;
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        inp.focus();
    },

    _closeLessonMagicOverlay() {
        const overlay = this.querySelector('#lesson-magic-overlay');
        const inp = this.querySelector('#inp-lesson-magic-prompt');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
        if (inp) inp.value = '';
    },

    async _runLessonMagicDraft(topic) {
        const ui = store.ui;
        const editorEl = this.querySelector('#lesson-visual-editor');
        if (!editorEl || this._lessonMagicGenerating) return;
        this._closeLessonMagicOverlay();
        this._pushLessonHistory(editorEl);
        const currentMd = visualHTMLToMarkdown(editorEl).trim();
        const originalHtml = editorEl.innerHTML;
        editorEl.innerHTML = `<div class="p-4 text-center animate-pulse text-purple-500">✨ ${ui.sageThinking}</div>`;
        this._lessonMagicGenerating = true;
        try {
            const promptText =
                currentMd.length > 0
                    ? `You revise an existing lesson written in Markdown. Keep the same general structure and tone unless the user asks otherwise.\n\nCurrent lesson (Markdown):\n---\n${currentMd}\n---\n\nUser request (apply thoroughly): "${topic}"\n\nReturn the full updated lesson body in Markdown only (no preamble). Use headings (# ## ###), lists, and short paragraphs as appropriate.`
                    : `Create a comprehensive educational lesson in Markdown about: "${topic}". Include Title, Intro, Subheadings, List, and Summary.`;
            const response = await aiService.chat([{ role: 'user', content: promptText }]);
            const rawMarkdown = response.text
                .replace(/^```markdown\n/, '')
                .replace(/^```\n/, '')
                .replace(/\n```$/, '');
            editorEl.classList.add('arborito-lesson-editor--ghost-outline');
            editorEl.innerHTML = markdownToVisualHTML(rawMarkdown, { authoringGhostOutline: true });
            this._assignHeadingIdsFromBlocks(editorEl, rawMarkdown);
            const titleMatch = rawMarkdown.match(/^# (.*$)/m);
            const titleInp = this.querySelector('#inp-lesson-header-title');
            if (titleMatch && titleInp && !titleInp.value.trim()) {
                titleInp.value = titleMatch[1].trim();
            }
            if (this._lessonSaveState !== 'saving') {
                this._lessonSaveState = 'idle';
                const b = this.querySelector('#btn-lesson-save');
                if (b) b.classList.remove('arborito-lesson-save-btn--saved');
            }
        } catch (e) {
            store.notify(ui.editorAiDraftError.replace('{message}', e.message), true);
            editorEl.innerHTML = originalHtml;
        } finally {
            this._lessonMagicGenerating = false;
        }
    },

    _bindLessonShellEditor() {
        const editorEl = this.querySelector('#lesson-visual-editor');
        if (!editorEl || !this._isLessonConstructEdit()) return;

        if (typeof this._lessonInsertMenuCleanup === 'function') {
            this._lessonInsertMenuCleanup();
            this._lessonInsertMenuCleanup = null;
        }

        const node = store.findNode(this.currentNode.id) || this.currentNode;
        if (this._lessonDraftLessonId !== node.id) {
            this._lessonDraftLessonId = node.id;
            this._lessonBodyMarkdown = null;
            this._lessonHistoryStack = [];
            this._tocInlineEditIdx = null;
        }

        const parsed = parseArboritoFile(node.content || '');
        const bodyMd = this._lessonBodyMarkdown !== null ? this._lessonBodyMarkdown : parsed.body;
        editorEl.classList.add('arborito-lesson-editor--ghost-outline');
        editorEl.innerHTML = markdownToVisualHTML(bodyMd, { authoringGhostOutline: true });
        this._assignHeadingIdsFromBlocks(editorEl, bodyMd);

        const undoBtn = this.querySelector('#btn-lesson-undo');
        if (undoBtn) {
            undoBtn.disabled = this._lessonHistoryStack.length === 0;
            undoBtn.style.opacity = undoBtn.disabled ? '0.5' : '1';
            undoBtn.onclick = () => this._lessonUndo(editorEl);
        }

        /** Prevents focus moving to toolbar button and losing contenteditable selection. */
        const restoreLessonEditorSelection = () => {
            const saved = this._lessonEditorSavedRange;
            if (!saved || !editorEl.isConnected) return;
            try {
                if (!editorEl.contains(saved.commonAncestorContainer)) return;
                editorEl.focus();
                const sel = window.getSelection();
                if (!sel) return;
                sel.removeAllRanges();
                sel.addRange(saved.cloneRange());
            } catch {
                /* invalid range after DOM mutation */
            }
        };

        this._lessonOnSelectionChange = () => {
            try {
                const sel = window.getSelection();
                if (!(sel && sel.rangeCount)) return;
                const r = sel.getRangeAt(0);
                if (editorEl.contains(r.commonAncestorContainer)) {
                    this._lessonEditorSavedRange = r.cloneRange();
                }
            } catch {
                /* ignore */
            }
        };
        document.addEventListener('selectionchange', this._lessonOnSelectionChange);

        this._lessonToolbarMousedownKeepSel = (ev) => {
            const t = ev.target;
            if (!(t instanceof Element)) return;
            if (
                !t.closest(
                    '#lesson-editor-format-panel, #lesson-editor-insert-panel, .arborito-lesson-actions--construct'
                )
            ) {
                return;
            }
            if (t.closest('button, .tool-btn, .block-btn, [role="menuitem"]')) {
                ev.preventDefault();
            }
        };
        document.addEventListener('mousedown', this._lessonToolbarMousedownKeepSel, true);

        const chainLessonToolbarSelCleanup = (prev) => {
            const prevCleanup = typeof prev === 'function' ? prev : null;
            return () => {
                if (prevCleanup) prevCleanup();
                document.removeEventListener('selectionchange', this._lessonOnSelectionChange);
                document.removeEventListener('mousedown', this._lessonToolbarMousedownKeepSel, true);
                this._lessonOnSelectionChange = null;
                this._lessonToolbarMousedownKeepSel = null;
            };
        };

        this.querySelectorAll('.arborito-lesson-actions--construct .tool-btn:not(#btn-lesson-undo)').forEach((btn) => {
            btn.onclick = () => {
                this._pushLessonHistory(editorEl);
                editorEl.focus();
                restoreLessonEditorSelection();
                execCmdOnEditor(editorEl, btn.dataset.cmd, btn.dataset.val);
            };
        });

        const formatToggle = this.querySelector('.lesson-editor-format-toggle');
        const formatPanel = this.querySelector('#lesson-editor-format-panel');
        const formatPanelHome = (formatPanel && formatPanel.parentElement) || null;
        const formatPanelNextSibling = (formatPanel && formatPanel.nextSibling) || null;
        const positionFormatPanel = () => {
            if (!formatToggle || !formatPanel) return;
            const r = formatToggle.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const gap = 6;
            const panelW = Math.min(formatPanel.offsetWidth || 288, vw - 16);
            const desiredLeft = r.left;
            const left = Math.max(8, Math.min(desiredLeft, vw - panelW - 8));
            const panelH = formatPanel.offsetHeight || 0;
            const belowTop = r.bottom + gap;
            const top = belowTop + panelH > vh - 8 && r.top - gap - panelH > 8
                ? Math.max(8, r.top - gap - panelH)
                : belowTop;
            formatPanel.style.position = 'fixed';
            formatPanel.style.left = `${Math.round(left)}px`;
            formatPanel.style.top = `${Math.round(top)}px`;
            formatPanel.style.maxWidth = `${Math.round(Math.min(320, vw - 16))}px`;
            formatPanel.style.zIndex = '2147483647';
        };
        const closeFormatPanel = () => {
            if (!formatPanel) return;
            formatPanel.classList.add('hidden');
            (formatToggle && formatToggle.setAttribute)('aria-expanded', 'false');
            formatPanel.style.position = '';
            formatPanel.style.left = '';
            formatPanel.style.top = '';
            formatPanel.style.maxWidth = '';
            formatPanel.style.zIndex = '';
            if (formatPanel.parentElement === document.body) {
                if (formatPanelHome && formatPanelHome.isConnected) {
                    formatPanelHome.insertBefore(formatPanel, formatPanelNextSibling);
                } else {
                    formatPanel.remove();
                }
            }
        };
        if (formatToggle && formatPanel) {
            formatToggle.onclick = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const opening = formatPanel.classList.contains('hidden');
                if (opening) {
                    if (formatPanel.parentElement !== document.body) {
                        document.body.appendChild(formatPanel);
                    }
                    formatPanel.classList.remove('hidden');
                    formatToggle.setAttribute('aria-expanded', 'true');
                    requestAnimationFrame(positionFormatPanel);
                } else {
                    closeFormatPanel();
                }
            };
            const onDocDownFmt = (ev) => {
                if (!formatPanel || formatPanel.classList.contains('hidden')) return;
                const t = ev.target;
                if (t instanceof Node && (formatPanel.contains(t) || formatToggle.contains(t))) return;
                closeFormatPanel();
            };
            const onRepositionFmt = () => {
                if (formatPanel.classList.contains('hidden')) return;
                positionFormatPanel();
            };
            const onKeyFmt = (ev) => {
                if (ev.key === 'Escape' && !formatPanel.classList.contains('hidden')) closeFormatPanel();
            };
            document.addEventListener('mousedown', onDocDownFmt, true);
            document.addEventListener('touchstart', onDocDownFmt, true);
            window.addEventListener('resize', onRepositionFmt);
            window.addEventListener('scroll', onRepositionFmt, true);
            document.addEventListener('keydown', onKeyFmt);
            const prevCleanup = this._lessonInsertMenuCleanup;
            this._lessonInsertMenuCleanup = () => {
                if (typeof prevCleanup === 'function') prevCleanup();
                document.removeEventListener('mousedown', onDocDownFmt, true);
                document.removeEventListener('touchstart', onDocDownFmt, true);
                window.removeEventListener('resize', onRepositionFmt);
                window.removeEventListener('scroll', onRepositionFmt, true);
                document.removeEventListener('keydown', onKeyFmt);
                closeFormatPanel();
            };
        }

        /* Chain selection/toolbar cleanup onto current cleanup (e.g. format panel). */
        this._lessonInsertMenuCleanup = chainLessonToolbarSelCleanup(this._lessonInsertMenuCleanup);

        const insertToggle = this.querySelector('.lesson-editor-insert-toggle');
        const insertPanel = this.querySelector('#lesson-editor-insert-panel');
        /*
         * Insert panel failed because it lived inside `.lesson-editor-toolbar-row--primary`
         * with mobile `overflow-x-auto` (clipped absolute). Port to `document.body` with
         * `position: fixed` — escapes clipping and always stacks above content.
         */
        const insertPanelHome = (insertPanel && insertPanel.parentElement) || null;
        const insertPanelNextSibling = (insertPanel && insertPanel.nextSibling) || null;
        const positionInsertPanel = () => {
            if (!insertToggle || !insertPanel) return;
            const r = insertToggle.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const gap = 6;
            const panelW = Math.min(insertPanel.offsetWidth || 288, vw - 16);
            const desiredLeft = r.left;
            const left = Math.max(8, Math.min(desiredLeft, vw - panelW - 8));
            const panelH = insertPanel.offsetHeight || 0;
            const belowTop = r.bottom + gap;
            const top = belowTop + panelH > vh - 8 && r.top - gap - panelH > 8
                ? Math.max(8, r.top - gap - panelH)
                : belowTop;
            insertPanel.style.position = 'fixed';
            insertPanel.style.left = `${Math.round(left)}px`;
            insertPanel.style.top = `${Math.round(top)}px`;
            insertPanel.style.maxWidth = `${Math.round(Math.min(288, vw - 16))}px`;
            insertPanel.style.zIndex = '2147483647';
        };
        const closeInsertPanel = () => {
            if (!insertPanel) return;
            insertPanel.classList.add('hidden');
            (insertToggle && insertToggle.setAttribute)('aria-expanded', 'false');
            insertPanel.style.position = '';
            insertPanel.style.left = '';
            insertPanel.style.top = '';
            insertPanel.style.maxWidth = '';
            insertPanel.style.zIndex = '';
            if (insertPanel.parentElement === document.body) {
                if (insertPanelHome && insertPanelHome.isConnected) {
                    insertPanelHome.insertBefore(insertPanel, insertPanelNextSibling);
                } else {
                    /* Tree repainted: original slot gone; remove orphaned portal. */
                    insertPanel.remove();
                }
            }
        };
        if (insertToggle && insertPanel) {
            insertToggle.onclick = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const opening = insertPanel.classList.contains('hidden');
                if (opening) {
                    if (insertPanel.parentElement !== document.body) {
                        document.body.appendChild(insertPanel);
                    }
                    insertPanel.classList.remove('hidden');
                    insertToggle.setAttribute('aria-expanded', 'true');
                    requestAnimationFrame(positionInsertPanel);
                } else {
                    closeInsertPanel();
                }
            };
            const onDocDown = (ev) => {
                if (!insertPanel || insertPanel.classList.contains('hidden')) return;
                const t = ev.target;
                if (t instanceof Node && (insertPanel.contains(t) || insertToggle.contains(t))) return;
                closeInsertPanel();
            };
            const onReposition = () => {
                if (insertPanel.classList.contains('hidden')) return;
                positionInsertPanel();
            };
            const onKey = (ev) => {
                if (ev.key === 'Escape' && !insertPanel.classList.contains('hidden')) closeInsertPanel();
            };
            document.addEventListener('mousedown', onDocDown, true);
            document.addEventListener('touchstart', onDocDown, true);
            window.addEventListener('resize', onReposition);
            window.addEventListener('scroll', onReposition, true);
            document.addEventListener('keydown', onKey);
            const prevInsertCleanup = this._lessonInsertMenuCleanup;
            this._lessonInsertMenuCleanup = () => {
                if (typeof prevInsertCleanup === 'function') prevInsertCleanup();
                document.removeEventListener('mousedown', onDocDown, true);
                document.removeEventListener('touchstart', onDocDown, true);
                window.removeEventListener('resize', onReposition);
                window.removeEventListener('scroll', onReposition, true);
                document.removeEventListener('keydown', onKey);
                closeInsertPanel();
            };
        }

        this.querySelectorAll('.arborito-lesson-actions--construct .block-btn').forEach((btn) => {
            btn.onclick = () => {
                this._pushLessonHistory(editorEl);
                insertBlockInEditor(editorEl, btn.dataset.type);
                closeInsertPanel();
            };
        });

        const magic = this.querySelector('#btn-magic-draft');
        if (magic) {
            magic.onclick = () => this._openLessonMagicOverlay();
        }

        const magicOverlay = this.querySelector('#lesson-magic-overlay');
        const magicInp = this.querySelector('#inp-lesson-magic-prompt');
        const magicCancel = this.querySelector('#btn-lesson-magic-cancel');
        const magicRun = this.querySelector('#btn-lesson-magic-run');
        if (magicOverlay && magicInp && magicCancel && magicRun) {
            magicCancel.onclick = () => this._closeLessonMagicOverlay();
            magicRun.onclick = () => {
                const val = magicInp.value.trim();
                if (val) void this._runLessonMagicDraft(val);
            };
            magicInp.onkeydown = (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const val = magicInp.value.trim();
                if (val) void this._runLessonMagicDraft(val);
            };
        }

        const saveBtn = this.querySelector('#btn-lesson-save');
        if (saveBtn) {
            saveBtn.onclick = () => void this._saveLessonShell();
            this._setLessonSaveButtonSavedVisual(saveBtn, this._lessonSaveState === 'saved');
        }

        editorEl.oninput = () => {
            if (this._lessonSaveState !== 'saving') {
                this._lessonSaveState = 'idle';
                const b = this.querySelector('#btn-lesson-save');
                if (b) this._setLessonSaveButtonSavedVisual(b, false);
            }
        };

        requestAnimationFrame(() => this._scrollConstructSectionIntoView(this.activeSectionIndex));
    },

    async _saveLessonShell() {
        const editorEl = this.querySelector('#lesson-visual-editor');
        const titleInp = this.querySelector('#inp-lesson-header-title');
        const descInp = this.querySelector('#inp-lesson-header-desc');
        if (!editorEl || !this.currentNode) return;

        const node = store.findNode(this.currentNode.id) || this.currentNode;
        const parsed = parseArboritoFile(node.content || '');
        const bodyMd = visualHTMLToMarkdown(editorEl);

        const name = titleInp ? titleInp.value.trim() : (parsed.meta.title || node.name);
        const description = descInp ? descInp.value.trim() : ((parsed.meta.description != null ? parsed.meta.description : (node.description != null ? node.description : '')));
        const icon = parsed.meta.icon || node.icon || '📄';

        const ui = store.ui;
        if (!name) {
            if (titleInp) {
                titleInp.focus();
                titleInp.classList.add('arborito-input-required-empty');
                setTimeout(() => titleInp.classList.remove('arborito-input-required-empty'), 3000);
            }
            store.notify(ui.lessonNameRequired || ui.graphPromptLessonName || 'Lesson name is required.', true);
            return;
        }

        const saveBtn = this.querySelector('#btn-lesson-save');
        const origLabel = saveBtn ? String(saveBtn.textContent || '').trim() : '';
        const labelRestore = origLabel || ui.editorLocalSave || 'Save';
        this._lessonSaveState = 'saving';
        this._headerMetaSaving = true;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = '…';
            saveBtn.classList.remove('arborito-lesson-save-btn--saved');
            saveBtn.style.filter = '';
        }
        try {
            // Use the unified persist pipeline: this updates content (with new bodyMd),
            // renames the file when the name changed, and reloads tree data so the
            // graph reflects the new lesson name immediately.
            await persistNodeMetaProperties(
                { fileSystem, store },
                {
                    node,
                    name,
                    icon,
                    description,
                    originalMeta: parsed.meta,
                    originalBody: bodyMd
                }
            );
            this._lessonSaveState = 'saved';
            this._lessonBodyMarkdown = null;
            this._headerMetaDraft = null;
            if (saveBtn) {
                saveBtn.textContent = labelRestore;
                this._setLessonSaveButtonSavedVisual(saveBtn, true);
            }
        } catch (e) {
            this._lessonSaveState = 'idle';
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = labelRestore;
                this._setLessonSaveButtonSavedVisual(saveBtn, false);
            }
            store.notify(
                (ui.nodePropertiesSaveError || 'Error saving properties: {message}').replace(
                    '{message}',
                    e.message
                ),
                true
            );
        } finally {
            this._headerMetaSaving = false;
        }
    },

    bindTocRowHandlers() {
        const nav = this.querySelector('#lesson-toc-nav');
        if (!nav) {
            this._abortTocDnD();
            return;
        }

        if (this._tocRenameDocPtr) {
            document.removeEventListener('pointerdown', this._tocRenameDocPtr, true);
            this._tocRenameDocPtr = null;
        }

        const editInp = this.querySelector('.js-toc-edit-title');
        if (editInp && this._tocInlineEditIdx != null && Number.isInteger(this._tocInlineEditIdx)) {
            const editIdx = this._tocInlineEditIdx;
            const disarmDoc = () => {
                if (!this._tocRenameDocPtr) return;
                document.removeEventListener('pointerdown', this._tocRenameDocPtr, true);
                this._tocRenameDocPtr = null;
            };
            const commitTitle = () => {
                if (this._tocInlineEditIdx !== editIdx) return;
                disarmDoc();
                this._applyTocRename(editIdx, editInp.value, '');
            };
            const cancelInline = () => {
                if (this._tocInlineEditIdx !== editIdx) return;
                disarmDoc();
                this._tocInlineEditIdx = null;
                this.lastRenderKey = null;
                this.render();
            };
            const onDocPtr = (ev) => {
                const el = ev.target;
                if (!(el instanceof Node)) return;
                if (el === editInp || editInp.contains(el)) return;
                commitTitle();
            };
            this._tocRenameDocPtr = onDocPtr;
            document.addEventListener('pointerdown', onDocPtr, true);
            editInp.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    commitTitle();
                } else if (ev.key === 'Escape') {
                    ev.preventDefault();
                    cancelInline();
                }
            });
            requestAnimationFrame(() => {
                try {
                    editInp.focus();
                    editInp.select();
                } catch {
                    /* ignore */
                }
            });
        }

        nav.onclick = (e) => {
            const rootEl =
                (typeof e.composedPath === 'function' ? e.composedPath().find((n) => n instanceof Element) : null) ||
                (e.target instanceof Element ? e.target : (e.target && e.target.parentElement));
            const btn = (rootEl && rootEl.closest ? rootEl.closest('.btn-toc') : null);
            if (!btn) return;

            const idx = parseInt(btn.dataset.idx, 10);

            if ((rootEl && rootEl.closest ? rootEl.closest('.js-toc-tick') : null)) {
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

            const nameSlot = (rootEl && rootEl.closest ? rootEl.closest('.js-toc-name-slot[data-toc-renamable="1"]') : null);
            if (nameSlot && this._isLessonConstructEdit() && !(rootEl && rootEl.closest ? rootEl.closest('.js-toc-tick') : null)) {
                e.preventDefault();
                e.stopPropagation();
                if (!Number.isNaN(idx)) {
                    this._tocInlineEditIdx = idx;
                    this.lastRenderKey = null;
                    this.render();
                }
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

        if (this._isLessonConstructEdit()) this.bindTocDragConstruct();
        else this._abortTocDnD();
    },

    _abortTocDnD() {
        if (this._tocDnDAbort) {
            this._tocDnDAbort.abort();
            this._tocDnDAbort = null;
        }
    },

    bindTocDragConstruct() {
        const nav = this.querySelector('#lesson-toc-nav');
        if (!nav || !this._isLessonConstructEdit()) {
            this._abortTocDnD();
            return;
        }
        this._abortTocDnD();
        const ac = new AbortController();
        this._tocDnDAbort = ac;
        const { signal } = ac;
        this._tocDragOriginX = null;

        const clearDropState = () => {
            nav.classList.remove('arborito-lesson-toc-nav--dragging');
            nav.querySelectorAll('.arborito-lesson-toc-row.is-toc-drop-target').forEach((el) => {
                el.classList.remove('is-toc-drop-target');
                el.classList.remove('is-toc-drop-nest');
                el.style.removeProperty('--toc-drop-depth');
            });
            const ind = nav.querySelector('.arborito-lesson-toc-drop-indicator');
            if (ind) {
                ind.classList.add('hidden');
                ind.style.marginLeft = '';
                ind.style.top = '';
            }
        };

        const rowAtPoint = (x, y) => {
            const el = document.elementFromPoint(x, y);
            return el instanceof Element ? el.closest('.arborito-lesson-toc-row[data-toc-idx]') : null;
        };

        const depthOfRowIdx = (idx) => {
            const row = nav.querySelector(`.arborito-lesson-toc-row[data-toc-idx="${idx}"]`);
            if (!row) return 1;
            const d = parseInt(row.getAttribute('data-toc-depth') || '1', 10);
            return Number.isFinite(d) ? d : 1;
        };

        const dropIntent = (row, clientX, forceNest = false, parentDepthOverride = null, fromIdx = null) => {
            const rowDepth = parseInt(row.getAttribute('data-toc-depth') || '1', 10);
            const fromDepth =
                fromIdx != null && Number.isFinite(fromIdx) ? depthOfRowIdx(fromIdx) : null;
            const originX = Number.isFinite(this._tocDragOriginX) ? this._tocDragOriginX : clientX;
            const horizontal = clientX - originX;

            // Nest when user drags right (22px threshold for comfortable
            // mobile without accidental triggers) or holds Shift.
            const NEST_THRESHOLD = 22;
            // Indent per level (must match `buildTocListMarkup`).
            const INDENT_W = 16;
            // Each extra nesting level needs a clear extra push (60px),
            // so a small move nests one level only and does not jump to deepest tree.
            const EXTRA_LEVEL_STEP = 60;
            const leftPx = Math.max(0, -horizontal);
            const outdentSteps = Math.floor(leftPx / INDENT_W);
            const outdentMode = outdentSteps > 0;
            const nestMode = !outdentMode && (forceNest || horizontal > NEST_THRESHOLD);
            const extraSteps = nestMode
                ? Math.max(0, Math.floor((horizontal - NEST_THRESHOLD) / EXTRA_LEVEL_STEP))
                : 0;

            // "Parent" may be target row (drop on another row)
            // or previous sibling (same row, push right).
            const parentDepth =
                parentDepthOverride != null && Number.isFinite(parentDepthOverride)
                    ? parentDepthOverride
                    : rowDepth;
            // data-toc-depth = depth+1 (depth=0 => 1). Convert to depth.
            const fromDepth0 = Math.max(0, ((fromDepth || rowDepth) - 1));
            const desiredDepth = outdentMode
                ? Math.max(0, fromDepth0 - outdentSteps)
                : Math.max(0, Math.min(5, (parentDepth - 1) + 1 + extraSteps));

            return { nestMode, outdentMode, desiredDepth };
        };

        const previousRowDepth = (idx) => {
            if (idx <= 0) return 1;
            const prev = nav.querySelector(`.arborito-lesson-toc-row[data-toc-idx="${idx - 1}"]`);
            return prev ? parseInt(prev.getAttribute('data-toc-depth') || '1', 10) : 1;
        };

        const autoScrollToc = (clientY) => {
            const scroller = nav.closest('.arborito-lesson-toc-sheet__scroll');
            if (!scroller) return;
            const r = scroller.getBoundingClientRect();
            const edge = 42;
            if (clientY < r.top + edge) scroller.scrollTop -= 12;
            else if (clientY > r.bottom - edge) scroller.scrollTop += 12;
        };

        const paintDropState = (row, intent) => {
            nav.querySelectorAll('.arborito-lesson-toc-row.is-toc-drop-target').forEach((el) => {
                if (el !== row) {
                    el.classList.remove('is-toc-drop-target');
                    el.classList.remove('is-toc-drop-nest');
                    el.style.removeProperty('--toc-drop-depth');
                }
            });
            row.classList.add('is-toc-drop-target');
            row.classList.toggle('is-toc-drop-nest', intent.nestMode);
            row.style.setProperty('--toc-drop-depth', String(Math.max(1, (intent.desiredDepth + 1))));
        };

        const insertionIndexAtPoint = (row, clientY) => {
            const idx = parseInt(row.getAttribute('data-toc-idx') || '', 10);
            if (Number.isNaN(idx)) return null;
            const r = row.getBoundingClientRect();
            const after = clientY > r.top + r.height / 2;
            return idx + (after ? 1 : 0);
        };

        const applyTocDrop = (from, row, clientX, clientY, forceNest = false) => {
            if (!row || !nav.contains(row)) return false;
            const insertIndex = insertionIndexAtPoint(row, clientY);
            if (Number.isNaN(from) || insertIndex == null) return false;

            this._captureLessonDraftFromDom();
            const body0 = this._getLessonBodyForToc();
            const outline0 = parseOutline(body0);
            const movedId = (outline0[from] ? outline0[from].id : undefined);
            if (!movedId) return false;

            // Compute intent against reordered outline (source of truth).
            const intent0 = dropIntent(row, clientX, forceNest, null, from);
            const { nextNodes: outline1 } = moveSubtree(outline0, from, insertIndex);
            const movedIdx = outline1.findIndex((n) => n.id === movedId);
            if (movedIdx === -1) return false;
            const prev = movedIdx > 0 ? outline1[movedIdx - 1] : null;
            const maxDepthAllowed = prev ? Math.min(5, prev.depth + 1) : 0;
            const proposedDepth = Math.max(0, Math.min(intent0.desiredDepth, maxDepthAllowed));
            // parentId is implied by depth (grandparent chain) after outdent.
            // Computed on outline already reordered with proposed depth.
            const parentId =
                proposedDepth === 0
                    ? null
                    : impliedParentId(
                          outline1.map((n, i) => (i === movedIdx ? { ...n, depth: proposedDepth } : n)),
                          movedIdx
                      );

            // Step 1: reorder on Y axis.
            let body1 = body0;
            body1 = reorderTocSectionRange(body0, from, insertIndex);

            // Real index of moved block after reorder.
            const toc1 = getToc({ content: body1 });
            const movedIdx2 = toc1.findIndex((t) => t.id === movedId);
            if (movedIdx2 === -1) return false;

            // Step 2: apply depth on X axis (depth=0 => '##').
            let body2 = body1;
            const targetHeadingLevel = proposedDepth + 2;
            body2 = setTocSectionLevel(body1, movedIdx2, targetHeadingLevel);

            if (body2 === body0) return false;
            this._lessonBodyMarkdown = body2;
            this._lessonDraftLessonId = this.currentNode.id;
            this._lessonDraftNonce += 1;
            const tocAfter = getToc({ content: body2 });
            let newActive = movedIdx2;
            if (movedId) {
                const j = tocAfter.findIndex((t) => t.id === movedId);
                if (j !== -1) newActive = j;
            }
            this.activeSectionIndex = Math.max(0, Math.min(newActive, tocAfter.length - 1));
            this._skipLessonDraftDomCapture = true;
            this.lastRenderKey = null;
            this._lessonSaveState = 'idle';
            this.render();
            return true;
        };

        nav.addEventListener(
            'dragstart',
            (e) => {
                const h = e.target instanceof Element ? e.target.closest('.js-toc-drag-handle') : null;
                if (!h || !nav.contains(h) || h.getAttribute('draggable') !== 'true') return;
                const from = parseInt(h.getAttribute('data-idx') || '', 10);
                if (Number.isNaN(from)) return;
                try {
                    (e.dataTransfer && e.dataTransfer.setData)('application/x-arborito-toc', String(from));
                    (e.dataTransfer && e.dataTransfer.setData)('text/plain', String(from));
                } catch {
                    /* ignore */
                }
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                this._tocDragOriginX = e.clientX;
                this._tocDragFromIdx = from;
                nav.classList.add('arborito-lesson-toc-nav--dragging');
            },
            { signal }
        );

        nav.addEventListener(
            'dragend',
            () => {
                clearDropState();
                this._tocDragOriginX = null;
                this._tocDragFromIdx = null;
            },
            { signal }
        );

        // Compute row that will receive drop and matching intent
        // (aligned with `applyTocDrop` so visual feedback is truthful: if pushing right
        // on same row nests under previous sibling, that row is highlighted).
        const resolveDropTarget = (row, clientX, forceNest, fromIdx) => {
            const idx = parseInt(row.getAttribute('data-toc-idx') || '', 10);
            if (Number.isNaN(idx)) return null;
            if (Number.isFinite(fromIdx) && fromIdx === idx) {
                const fastIntent = dropIntent(row, clientX, forceNest, null, fromIdx);
                if (fastIntent.outdentMode) {
                    return { row, intent: fastIntent };
                }
                if (!fastIntent.nestMode || fromIdx <= 0) return null;
                const prev = nav.querySelector(`.arborito-lesson-toc-row[data-toc-idx="${fromIdx - 1}"]`);
                if (!prev) return null;
                const intent = dropIntent(row, clientX, forceNest, previousRowDepth(fromIdx), fromIdx);
                return { row: prev, intent };
            }
            const intent = dropIntent(row, clientX, forceNest, null, fromIdx);
            return { row, intent };
        };

        const clearDropPaintOnly = () => {
            nav.querySelectorAll('.arborito-lesson-toc-row.is-toc-drop-target').forEach((el) => {
                el.classList.remove('is-toc-drop-target');
                el.classList.remove('is-toc-drop-nest');
                el.style.removeProperty('--toc-drop-depth');
            });
            const ind = nav.querySelector('.arborito-lesson-toc-drop-indicator');
            if (ind) {
                ind.classList.add('hidden');
                ind.style.marginLeft = '';
                ind.style.top = '';
            }
        };

        nav.addEventListener(
            'dragover',
            (e) => {
                const row = e.target instanceof Element ? e.target.closest('.arborito-lesson-toc-row[data-toc-idx]') : null;
                if (!row || !nav.contains(row)) return;
                e.preventDefault();
                const fromIdx = Number.isFinite(this._tocDragFromIdx) ? this._tocDragFromIdx : NaN;
                const resolved = resolveDropTarget(row, e.clientX, e.shiftKey, fromIdx);
                if (!resolved) {
                    /* No valid target yet (e.g. user has not pushed far enough
                     * on same row): clear paint to avoid misleading UI. */
                    clearDropPaintOnly();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    autoScrollToc(e.clientY);
                    return;
                }
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = resolved.intent.outdentMode
                        ? 'move'
                        : (resolved.intent.nestMode ? 'copy' : 'move');
                }
                paintDropState(resolved.row, resolved.intent);
                autoScrollToc(e.clientY);
            },
            { signal }
        );

        nav.addEventListener(
            'dragleave',
            (e) => {
                const rel = e.relatedTarget;
                /* Only clear when pointer truly leaves nav: if still inside,
                 * next `dragover` repaints correct target
                 * (may differ from leave row when redirecting drop to previous sibling). */
                if (rel instanceof Node && nav.contains(rel)) return;
                clearDropPaintOnly();
            },
            { signal }
        );

        nav.addEventListener(
            'drop',
            (e) => {
                const row = e.target instanceof Element ? e.target.closest('.arborito-lesson-toc-row[data-toc-idx]') : null;
                if (!row || !nav.contains(row)) return;
                e.preventDefault();
                row.classList.remove('is-toc-drop-target');
                row.classList.remove('is-toc-drop-nest');
                row.style.removeProperty('--toc-drop-depth');
                let from = NaN;
                try {
                    from = parseInt((e.dataTransfer && e.dataTransfer.getData)('application/x-arborito-toc') || '', 10);
                } catch {
                    from = NaN;
                }
                if (Number.isNaN(from)) return;
                applyTocDrop(from, row, e.clientX, e.clientY, e.shiftKey);
            },
            { signal }
        );

        nav.addEventListener(
            'pointerdown',
            (e) => {
                const h = e.target instanceof Element ? e.target.closest('.js-toc-drag-handle') : null;
                if (!h || !nav.contains(h)) return;
                const from = parseInt(h.getAttribute('data-idx') || '', 10);
                if (Number.isNaN(from)) return;
                e.preventDefault();
                e.stopPropagation();
                this._tocDragOriginX = e.clientX;
                this._tocDragFromIdx = from;
                nav.classList.add('arborito-lesson-toc-nav--dragging');
                (h.setPointerCapture && h.setPointerCapture(e.pointerId));

                const onMove = (ev) => {
                    const row = rowAtPoint(ev.clientX, ev.clientY);
                    if (!row || !nav.contains(row)) {
                        clearDropPaintOnly();
                        return;
                    }
                    const resolved = resolveDropTarget(row, ev.clientX, ev.shiftKey, from);
                    if (!resolved) {
                        clearDropPaintOnly();
                    } else {
                        paintDropState(resolved.row, resolved.intent);
                    }
                    autoScrollToc(ev.clientY);
                };
                const onUp = (ev) => {
                    document.removeEventListener('pointermove', onMove, true);
                    document.removeEventListener('pointerup', onUp, true);
                    document.removeEventListener('pointercancel', onUp, true);
                    const row = rowAtPoint(ev.clientX, ev.clientY);
                    clearDropState();
                    applyTocDrop(from, row, ev.clientX, ev.clientY, ev.shiftKey);
                    this._tocDragOriginX = null;
                    this._tocDragFromIdx = null;
                };
                document.addEventListener('pointermove', onMove, true);
                document.addEventListener('pointerup', onUp, true);
                document.addEventListener('pointercancel', onUp, true);
            },
            { signal }
        );
    }

};
