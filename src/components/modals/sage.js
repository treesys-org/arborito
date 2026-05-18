import { store } from '../../store.js';
import { aiService, DEFAULT_BROWSER_MODEL } from '../../services/ai.js';
import { ArboritoSageUIChat } from './sage-ui-chat.js';

class ArboritoSage extends ArboritoSageUIChat {
    constructor() {
        super();
        this.isVisible = false;
        /** @type {'context'|'settings'} */
        this.mode = 'context';
        this.lastRenderKey = null;
        /** True when Sage opened from inside an open lesson (shortcuts for that page). */
        this._sageLessonContext = false;
        this._lastLessonNodeId = null;
        this._sageEnterAnim = false;
    }

    connectedCallback() {
        this._storeListener = () => this.checkState();
        store.addEventListener('state-change', this._storeListener);
        this.checkState();
    }

    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
    }

    _resolveLessonContext(modal) {
        if (modal && modal.sageLessonContext) return true;
        const node = store.value.selectedNode;
        return !!(node && (node.type === 'leaf' || node.type === 'exam'));
    }

    _lessonNode() {
        return store.value.selectedNode || null;
    }

    checkState() {
        const modal = store.value.modal;
        const isSageReq = modal && (modal === 'sage' || modal.type === 'sage');

        if (isSageReq) {
            const lessonCtx = this._resolveLessonContext(modal);
            const lessonNode = lessonCtx ? this._lessonNode() : null;
            const lessonNodeId = lessonNode?.id || null;

            if (lessonCtx && lessonNodeId && lessonNodeId !== this._lastLessonNodeId) {
                this._contextDisplay = null;
                this._sageAboutOpen = false;
                if (this._sageGuideNav) this._sageGuideNav = { level: 'hub' };
            }
            this._lastLessonNodeId = lessonNodeId;
            this._sageLessonContext = lessonCtx;

            if (!this.isVisible) {
                this.isVisible = true;
                this._sageEnterAnim = true;
                const requested = modal.mode;
                if (requested === 'settings') this.mode = 'settings';
                else this.mode = 'context';
                if (!lessonCtx) this._contextDisplay = null;
            } else if (modal.mode === 'settings' && this.mode !== 'settings') {
                this.mode = 'settings';
            } else if (modal.mode !== 'settings' && this.mode === 'settings' && modal.mode !== 'architect') {
                this.mode = 'context';
            }
            this.render();
            if (this._sageEnterAnim) {
                requestAnimationFrame(() => {
                    this._sageEnterAnim = false;
                });
            }
        } else if (this.isVisible) {
            this.hide();
        }
    }

    hide() {
        this.isVisible = false;
        this.lastRenderKey = null;
        this._contextDisplay = null;
        this._sageAboutOpen = false;
        this._lastLessonNodeId = null;
        this._sageEnterAnim = false;
        this.mode = 'context';
        this._sageLessonContext = false;
        this.innerHTML = '';
        this.className = '';
    }

    close() {
        this.hide();
        store.dismissModal();
    }

    saveConfig() {
        const browserModel = this.querySelector('#inp-browser-model')?.value.trim();
        const preset = this.querySelector('#sel-context-preset')?.value;
        const maxTokensRaw = this.querySelector('#inp-browser-max-tokens')?.value;
        aiService.setConfig({
            provider: 'browser',
            browserModel: browserModel || DEFAULT_BROWSER_MODEL,
            contextPreset: preset || 'minimal',
            browserMaxNewTokens: maxTokensRaw != null ? Number(maxTokensRaw) : undefined
        });
        this.mode = 'context';
        this.render();
    }
}
customElements.define('arborito-sage', ArboritoSage);
