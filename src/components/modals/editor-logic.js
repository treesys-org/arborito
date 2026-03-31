import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import { aiService } from '../../services/ai.js';
import {
    BLOCKS,
    parseArboritoFile,
    markdownToVisualHTML,
    visualHTMLToMarkdown,
    reconstructArboritoFile
} from '../../utils/editor-engine.js';

/** Keys must match `editorEmojiCategory*` entries in locales */
export const EMOJI_DATA = {
    editorEmojiCategoryGeneral: ['📄', '📁', '📂', '✨', '🔥', '💡', '🚀', '⭐', '📝', '📌'],
    editorEmojiCategoryScience: ['🧬', '🔬', '⚗️', '⚛️', '🔭', '💊', '🦠', '🧪', '🧫', '🩺'],
    editorEmojiCategoryComputing: ['💻', '🖥️', '⌨️', '🖱️', '💾', '💿', '🌐', '🔌', '🔋', '📱'],
    editorEmojiCategoryArts: ['🎨', '🎭', '🖌️', '✍️', '📖', '📚', '🗣️', '🎹', '🎸', '🎻'],
    editorEmojiCategorySociety: ['⚖️', '💰', '🏛️', '🌍', '🧠', '🤝', '🎓', '🏘️', '🏙️', '🏭']
};

export class ArboritoEditorLogic extends HTMLElement {
    constructor() {
        super();
        this.node = null;
        this.meta = { title: '', icon: '📄', description: '', order: '99', isExam: false, extra: [] };
        this.currentSha = null;
        this.isMetaJson = false;
        this.returnTo = null;
        this.historyStack = [];
        this.showAiPrompt = false;
        this.isGenerating = false;
        this.saveState = 'idle';
    }

    connectedCallback() {
        this._storeListener = () => this.checkState();
        store.addEventListener('state-change', this._storeListener);
    }

    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
    }

    checkState() {
        const modal = store.value.modal;
        if (modal && modal.type === 'editor' && modal.node) {
            if (this.node?.id !== modal.node.id) {
                this.node = modal.node;
                this.returnTo = modal.returnTo || null;
                this.historyStack = [];
                this.showAiPrompt = false;
                this.loadContent();
            }
        } else if (this.node) {
            this.node = null;
            this.returnTo = null;
            this.innerHTML = '';
            this.className = '';
        }
    }

    getTargetPath() {
        let path = this.node.sourcePath;
        if (!path && this.node.type === 'root') {
            const lang = store.value.lang || 'EN';
            path = `content/${lang}`;
        }
        if (this.node.type === 'branch' || this.node.type === 'root') {
            if (path && !path.endsWith('meta.json')) {
                path = path.endsWith('/') ? path + 'meta.json' : path + '/meta.json';
            }
        }
        if (!path && this.node.id && this.node.id.startsWith('local-')) {
            path = `${this.node.name}.md`;
        }
        return path;
    }

    async loadContent() {
        this.renderLoading();
        try {
            const sourcePath = this.getTargetPath();
            const fileData = await fileSystem.getFile(this.node.id, sourcePath);
            this.currentSha = fileData.sha;
            this.isMetaJson = fileData.isMeta;
            this.meta = {
                title: fileData.meta.title || fileData.meta.name || '',
                icon: fileData.meta.icon || '📄',
                description: fileData.meta.description || '',
                order: fileData.meta.order || '99',
                isExam: fileData.meta.isExam || false,
                extra: fileData.meta.extra || []
            };
            const visualHTML = fileData.isMeta ? '' : markdownToVisualHTML(fileData.body);
            this.renderEditor(visualHTML);
        } catch (e) {
            console.warn('[ArboritoEditor] Load error (Rescue Mode Active):', e);
            const ui = store.ui;
            if (e.status === 403 || (e.message && e.message.includes('API rate limit'))) {
                store.notify(ui.editorGithubRateLimit, true);
                this.closeEditor();
                return;
            }
            const isNotFound = e.message.toLowerCase().includes('not found') || e.message.includes('404');
            const isNew = this.node.id.startsWith('new-');
            if (isNew || isNotFound) {
                this.meta = {
                    title: this.node.name || store.ui.editorPathNewFile,
                    icon: this.node.icon || '📄',
                    description: this.node.description || '',
                    order: this.node.order || '99',
                    isExam: this.node.type === 'exam',
                    extra: []
                };
                let recoveredBody = '';
                if (this.node.content) {
                    try {
                        const parsed = parseArboritoFile(this.node.content);
                        this.meta = { ...this.meta, ...parsed.meta };
                        if (parsed.meta.title) this.meta.title = parsed.meta.title;
                        recoveredBody = parsed.body;
                    } catch (err) {
                        console.log('Content recovery failed', err);
                        recoveredBody = this.node.content;
                    }
                }
                const targetPath = this.getTargetPath();
                this.isMetaJson = false;
                if (targetPath && targetPath.endsWith('meta.json')) {
                    this.isMetaJson = true;
                } else if (this.node.type === 'branch' || this.node.type === 'root') {
                    this.isMetaJson = true;
                }
                this.currentSha = null;
                const visualHTML = this.isMetaJson ? '' : markdownToVisualHTML(recoveredBody);
                this.renderEditor(visualHTML);
                if (isNotFound && !isNew) {
                    store.notify(ui.editorRescueMode);
                }
            } else {
                store.notify(ui.editorCriticalError.replace('{message}', e.message), true);
                this.closeEditor();
            }
        }
    }

    closeEditor() {
        if (this.returnTo === 'contributor') {
            store.setModal('contributor');
        } else {
            store.dismissModal();
        }
    }

    generateFinalContent() {
        const title = this.querySelector('#meta-title').value.trim();
        const icon = this.querySelector('#btn-emoji').textContent.trim();
        const desc = this.querySelector('#meta-desc').value.trim();
        const order = this.querySelector('#meta-order').value.trim();
        const visualEditor = this.querySelector('#visual-editor');
        const bodyMarkdown = visualEditor ? visualHTMLToMarkdown(visualEditor) : '';
        if (this.isMetaJson) {
            const json = { name: title, icon, description: desc, order };
            return JSON.stringify(json, null, 2);
        }
        this.meta.title = title;
        this.meta.icon = icon;
        this.meta.description = desc;
        this.meta.order = order;
        return reconstructArboritoFile(this.meta, bodyMarkdown);
    }

    renderLoading() {
        this.className =
            'fixed inset-0 z-[120] w-full h-full bg-slate-950 flex items-center justify-center pointer-events-none';
        this.innerHTML = '<div class="animate-spin text-4xl">⏳</div>';
    }

    toggleEmojiPicker() {
        const picker = this.querySelector('#emoji-picker');
        if (picker) picker.classList.toggle('hidden');
    }

    selectEmoji(char) {
        const btn = this.querySelector('#btn-emoji');
        btn.textContent = char;
        this.toggleEmojiPicker();
    }

    execCmd(cmd, val = null) {
        const editor = this.querySelector('#visual-editor');
        if (!editor) return;
        editor.focus();
        document.execCommand(cmd, false, val);
    }

    insertBlock(type) {
        const editor = this.querySelector('#visual-editor');
        if (!editor) return;
        let html = '';
        if (type === 'section') html = BLOCKS.section();
        if (type === 'subsection') html = BLOCKS.subsection();
        if (type === 'quiz') html = BLOCKS.quiz();
        if (type === 'callout') html = BLOCKS.callout();
        if (type === 'image') html = BLOCKS.media('image');
        if (type === 'video') html = BLOCKS.media('video');
        if (type === 'game') html = BLOCKS.game('', '', true);
        editor.insertAdjacentHTML('beforeend', html);
        editor.scrollTop = editor.scrollHeight;
    }

    pushHistory() {
        const editor = this.querySelector('#visual-editor');
        if (!editor) return;
        if (this.historyStack.length > 20) this.historyStack.shift();
        this.historyStack.push(editor.innerHTML);
        this.updateUndoButton();
    }

    undo() {
        if (this.historyStack.length === 0) return;
        const previousContent = this.historyStack.pop();
        const editor = this.querySelector('#visual-editor');
        if (editor) {
            editor.innerHTML = previousContent;
            this.updateUndoButton();
        }
    }

    updateUndoButton() {
        const btn = this.querySelector('#btn-undo');
        if (btn) {
            btn.disabled = this.historyStack.length === 0;
            btn.style.opacity = btn.disabled ? '0.5' : '1';
        }
    }

    toggleAiPrompt() {
        this.showAiPrompt = !this.showAiPrompt;
        const overlay = this.querySelector('#ai-prompt-overlay');
        if (overlay) {
            if (this.showAiPrompt) {
                overlay.classList.remove('hidden');
                this.querySelector('#inp-ai-prompt').focus();
            } else {
                overlay.classList.add('hidden');
            }
        }
    }

    async runDraft(topic) {
        const ui = store.ui;
        this.toggleAiPrompt();
        const editor = this.querySelector('#visual-editor');
        if (!editor) return;
        this.pushHistory();
        const originalText = editor.innerHTML;
        editor.innerHTML = `<div class="p-4 text-center animate-pulse text-purple-500">✨ ${ui.sageThinking}</div>`;
        this.isGenerating = true;
        try {
            const promptText = `Create a comprehensive educational lesson in Markdown about: "${topic}". Include Title, Intro, Subheadings, List, and Summary.`;
            const response = await aiService.chat([{ role: 'user', content: promptText }]);
            const rawMarkdown = response.text
                .replace(/^```markdown\n/, '')
                .replace(/^```\n/, '')
                .replace(/\n```$/, '');
            editor.innerHTML = markdownToVisualHTML(rawMarkdown);
            const titleMatch = rawMarkdown.match(/^# (.*$)/m);
            if (titleMatch && !this.querySelector('#meta-title').value) {
                this.querySelector('#meta-title').value = titleMatch[1].trim();
            }
        } catch (e) {
            store.notify(ui.editorAiDraftError.replace('{message}', e.message), true);
            editor.innerHTML = originalText;
        } finally {
            this.isGenerating = false;
        }
    }

    async submitChanges() {
        const btn = this.querySelector('#btn-submit');
        const originalText = btn.innerHTML;
        this.saveState = 'saving';
        this.updateSaveStateUI();
        btn.innerHTML = '...';
        btn.disabled = true;
        const finalContent = this.generateFinalContent();
        const msg = store.ui.editorCommitMessagePrefix.replace(
            '{title}',
            this.meta.title || store.ui.editorPathNewFile
        );
        const targetPath = this.getTargetPath();
        if (!targetPath) {
            store.notify(store.ui.editorSavePathError, true);
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
        const nodePayload = { ...this.node, sourcePath: targetPath, sha: this.currentSha };
        try {
            const result = await fileSystem.saveFile(nodePayload, finalContent, this.meta, msg);
            if (result.success) {
                if (result.mode === 'instant') {
                    this.saveState = 'saved';
                    this.updateSaveStateUI();
                    btn.innerHTML = '✔ SAVED';
                    setTimeout(() => this.closeEditor(), 500);
                } else {
                    this.saveState = 'saved';
                    this.updateSaveStateUI();
                    store.notify(store.ui.editorSuccessPublish);
                    this.closeEditor();
                }
            } else {
                throw new Error(store.ui.saveError);
            }
        } catch (e) {
            this.saveState = 'idle';
            this.updateSaveStateUI();
            const ui = store.ui;
            store.notify(ui.graphErrorWithMessage.replace('{message}', e.message), true);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    updateSaveStateUI() {
        const ui = store.ui;
        const status = this.querySelector('#editor-save-status');
        if (!status) return;
        if (this.saveState === 'saving') status.textContent = ui.editorSaving;
        else if (this.saveState === 'saved') status.textContent = ui.editorSaved;
        else status.textContent = ui.editorReady;
    }
}
