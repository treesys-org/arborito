import { store } from '../../../core/store.js';
import { defaultSageGuideNav } from '../sage-guide-drill.js';
import { shouldAnimateDockEnter } from '../../../shared/ui/modal-enter.js';
import { aiService, DEFAULT_BROWSER_MODEL } from '../ai.js';
import { isDesktopLlamacppBridgePresent } from '../ai-llamacpp-bridge.js';
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
        document.documentElement.classList.remove('arborito-sage-open');
    }

    _resolveLessonContext(modal) {
        return !!(modal && modal.sageLessonContext);
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
                this._sageGuideNav = defaultSageGuideNav();
            }
            this._lastLessonNodeId = lessonNodeId;
            this._sageLessonContext = lessonCtx;

            if (!this.isVisible) {
                this.isVisible = true;
                this._sageEnterAnim = shouldAnimateDockEnter(store._prevModal, modal);
                this._sageGuideNav = defaultSageGuideNav();
                const requested = modal.mode;
                if (requested === 'settings') this.mode = 'settings';
                else this.mode = 'context';
                if (!lessonCtx) this._sageGuideNav = defaultSageGuideNav();
            } else if (modal.mode === 'settings' && this.mode !== 'settings') {
                this.mode = 'settings';
            } else if (modal.mode !== 'settings' && this.mode === 'settings' && modal.mode !== 'architect') {
                this.mode = 'context';
            }
            document.documentElement.classList.add('arborito-sage-open');
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
        this._sageGuideNav = defaultSageGuideNav();
        this._lastLessonNodeId = null;
        this._sageEnterAnim = false;
        this.mode = 'context';
        this._sageLessonContext = false;
        document.documentElement.classList.remove('arborito-sage-open');
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
        // The build environment chooses the provider — there is no user-facing toggle.
        const provider = isDesktopLlamacppBridgePresent() ? 'llamacpp' : 'browser';
        aiService.setConfig({
            provider,
            browserModel: browserModel || DEFAULT_BROWSER_MODEL,
            contextPreset: preset || 'minimal',
            browserMaxNewTokens: maxTokensRaw != null ? Number(maxTokensRaw) : undefined
        });
        this.mode = 'context';
        this.render();
    }
}
customElements.define('arborito-sage', ArboritoSage);
