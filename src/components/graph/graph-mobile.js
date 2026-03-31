import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import {
    curriculumBaseName,
    getVersionPresentation,
    applyReleaseSwitch,
    applyLiveSwitch
} from '../../utils/version-switch-logic.js';

const VERSION_TOGGLE_ID = 'arborito-version-toggle';
const VERSION_LIVE_ID = 'arborito-version-live';
const VERSION_DROPDOWN_ID = 'arborito-version-dropdown-panel';
const VERSION_DROPDOWN_BACKDROP_ID = 'arborito-version-dropdown-backdrop';
const VERSION_ARCHIVE_ITEM_CLASS = 'arborito-version-archive-item';
const VERSION_DROPDOWN_Z = '130';

export function escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function escAttr(s) {
    return escHtml(s).replace(/'/g, '&#39;');
}

export function _onDocClickCurriculum(e) {
        if (!this._versionMenuOpen) return;
        const t = e.target;
        const chrome = this.querySelector('#arborito-curriculum-chrome');
        const versionFixed = this.querySelector('#arborito-mobile-version-fixed');
        const panel = document.getElementById(VERSION_DROPDOWN_ID);
        if (chrome?.contains(t) || versionFixed?.contains(t) || panel?.contains(t)) return;
        this._versionMenuOpen = false;
        this._mobileRenderKey = null;
        if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
    }







/**
 * Toque en móvil: además de `click` (ratón / teclado), maneja `touchend` cuando el dedo casi no se movió.
 * En WebKit, tras scroll en el tronco a veces el `click` sintético no llega; esto evita taps “muertos”.
 * Si ya disparó por touch, ignoramos el `click` duplicado que sigue en algunos navegadores.
 */
export function bindMobileTap(el, handler) {
        if (!el) return;
        el.setAttribute('role', 'button');
        el.tabIndex = 0;

        let touchStartX = 0;
        let touchStartY = 0;
        let lastTouchFireAt = 0;

        el.addEventListener(
            'touchstart',
            (e) => {
                if (!e.changedTouches?.length) return;
                touchStartX = e.changedTouches[0].clientX;
                touchStartY = e.changedTouches[0].clientY;
            },
            { passive: true }
        );

        el.addEventListener(
            'touchend',
            (e) => {
                if (!e.changedTouches?.length) return;
                const t = e.changedTouches[0];
                if (Math.abs(t.clientX - touchStartX) > 14 || Math.abs(t.clientY - touchStartY) > 14) {
                    return;
                }
                try {
                    e.preventDefault();
                } catch {
                    /* noop */
                }
                lastTouchFireAt = Date.now();
                handler(e);
            },
            { passive: false }
        );

        el.addEventListener('click', (ev) => {
            if (Date.now() - lastTouchFireAt < 450) return;
            handler(ev);
        });

        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                handler(ev);
            }
        });
    }


export function getMobileTone(node) {
        if (!node || !node.type) return 'branch';
        if (node.type === 'root') return 'root';
        if (node.type === 'exam') return 'exam';
        if (node.type === 'leaf') return 'leaf';
        return 'branch';
    }


export function _syncMobileTreeUiLayer() {
        if (!this.mobileTreeUI) return;
        this.mobileTreeUI.classList.toggle('arborito-version-dropdown-open', this._versionMenuOpen);
    }

export function refreshCurriculumChrome() {
        if (!store.value.data) return;
        this.renderMobileTopBanner();
        this._syncMobileTreeUiLayer();
        this._mobileRenderKey = null;
        this.renderMobilePrototypeTree(store.value.data);
    }



/**
     * Curriculum title: same block as mobile root (eyebrow, name, construction badge, optional meta).
     * @param {{ showMeta?: boolean, metaText?: string }} [opts]
     */
export function buildCurriculumTitleHTML(opts = {}) {
        const state = store.value;
        const ui = store.ui;
        const src = state.activeSource;
        if (!src) return '';
        const con = !!state.constructionMode;
        const conLabel = (ui.navConstruct || 'Construction').trim();
        const badge = con
            ? `<span class="shrink-0 rounded-full bg-amber-400/25 dark:bg-amber-500/20 text-amber-900 dark:text-amber-100 text-[9px] font-black px-2 py-0.5 uppercase tracking-wide border border-amber-500/30" role="status">🚧 ${escHtml(conLabel)}</span>`
            : '';
        const meta =
            opts.showMeta && opts.metaText
                ? `<span class="mobile-label-meta">${escHtml(opts.metaText)}</span>`
                : '';
        if (!badge && !meta) return '';

        return `
            <div class="min-w-0 flex-1 text-left">
                <div class="flex items-start gap-1.5 min-w-0 flex-wrap">
                    ${meta}
                    ${badge}
                </div>
            </div>`;
    }

/**
     * Fila curriculum en el árbol móvil: título/meta.
     * En móvil estrecho (no arborito-desktop): nombre del árbol + versión como texto estático junto al tronco.
     * En bosque de escritorio: el conmutador de versiones sigue en #arborito-mobile-version-fixed.
     * @param {{ showMeta?: boolean, metaText?: string }} [titleOpts]
     */
export function buildCurriculumChromeTitleRowHTML(titleOpts = {}) {
        const src = store.value.activeSource;
        if (!src) return '';
        const isDesktopForest =
            typeof document !== 'undefined' && document.documentElement.classList.contains('arborito-desktop');
        const explore = store.value.viewMode === 'explore';
        const title = this.buildCurriculumTitleHTML(titleOpts);
        const nameHint = curriculumBaseName(src) || src.name || '';
        const releases = store.value.availableReleases || [];
        const vp = getVersionPresentation(src, releases, store.ui);

        let trunkStatic = '';
        if (explore && !isDesktopForest) {
            const displayName = nameHint || '—';
            const versionText = [vp.icon, vp.chipSub].filter(Boolean).join(' ').trim();
            trunkStatic = `
            <div class="arborito-mobile-trunk-static w-full min-w-0 flex flex-col gap-0.5 items-start">
                <span class="mobile-label-text" title="${escAttr(displayName)}">${escHtml(displayName)}</span>
                <span class="mobile-label-meta mobile-trunk-version-static">${escHtml(versionText)}</span>
            </div>`;
        }

        const fallback =
            (!explore || isDesktopForest) && !title.trim() && nameHint
                ? `<span class="mobile-label-text" title="${escAttr(nameHint)}">${escHtml(nameHint)}</span>`
                : '';

        return `
            <div class="arborito-mobile-curriculum-chrome arborito-mobile-curriculum-chrome--title-only flex w-full min-w-0 flex-col items-stretch gap-2">
                <div class="mobile-label-row__text min-w-0 flex-1 flex flex-col items-start gap-1">
                    ${title}
                    ${trunkStatic}
                    ${fallback}
                </div>
            </div>`;
    }

export function bindVersionSwitchAnchors(scope, cfg) {
        if (!scope) return;
        const { toggleId, liveBtnId, itemClass, afterToggle } = cfg;
        const toggle = scope.querySelector(`#${toggleId}`);
        if (toggle) {
            toggle.onclick = (e) => {
                e.stopPropagation();
                const opening = !this._versionMenuOpen;
                if (!opening) {
                    this._clearVersionDropdownPanelStyles();
                }
                this._versionMenuOpen = opening;
                if (afterToggle) afterToggle();
                else this.refreshCurriculumChrome();
            };
        }
        const liveBtn = scope.querySelector(`#${liveBtnId}`);
        if (liveBtn) {
            liveBtn.onclick = (e) => {
                e.stopPropagation();
                applyLiveSwitch();
                this.afterVersionSwitchCloseMenu();
            };
        }
        scope.querySelectorAll(`.${itemClass}`).forEach((btn) => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const raw = btn.getAttribute('data-json');
                if (!raw) return;
                try {
                    const data = JSON.parse(decodeURIComponent(raw));
                    applyReleaseSwitch(data);
                } catch {
                    return;
                }
                this.afterVersionSwitchCloseMenu();
            };
        });
    }

/** Enlaza el único bloque curriculum (mismos IDs en móvil y escritorio; solo uno montado). */
export function bindCurriculumChrome(scope, afterToggle) {
        if (!scope) return;
        this.bindVersionSwitchAnchors(scope, {
            toggleId: VERSION_TOGGLE_ID,
            liveBtnId: VERSION_LIVE_ID,
            itemClass: VERSION_ARCHIVE_ITEM_CLASS,
            afterToggle: afterToggle || (() => this.refreshCurriculumChrome())
        });
    }

export function renderMobileTopBanner() {
        const el = this.querySelector('#mobile-overlays');
        if (!el) return;
        el.className =
            'absolute top-0 left-0 right-0 z-40 flex flex-col items-center pointer-events-none px-3';
        el.style.paddingTop = 'max(0.35rem, env(safe-area-inset-top))';
        /* Construction state is shown on the curriculum chrome row (same as desktop). */
        el.innerHTML = '';
        el.style.display = 'none';
    }

/**
     * Barra de herramientas del nodo en el panel del camino (sustituye al dock flotante).
     */
export function createMobileNodeToolbarElement(node) {
        const ui = store.ui;
        const canWrite = fileSystem.features.canWrite;
        const wrap = document.createElement('div');
        wrap.className = 'mobile-node-toolbar';
        wrap.setAttribute('role', 'toolbar');
        if (!node) return wrap;

        if (!canWrite) {
            wrap.innerHTML = `<div class="mobile-node-toolbar--readonly"><span aria-hidden="true">🔒</span> ${ui.graphReadOnly || 'Read Only'}</div>`;
            return wrap;
        }

        const isRoot = node.type === 'root';
        const canAddChildren = node.type !== 'exam';
        const canMove = !isRoot && canWrite && !fileSystem.isLocal;
        const moveTitle = !canWrite
            ? (ui.graphReadOnly || 'Read Only')
            : isRoot
              ? (ui.graphMoveDisabledRoot || 'The curriculum root cannot be moved.')
              : fileSystem.isLocal
                ? (ui.moveLocalUnsupported || 'Not available for local trees')
                : (ui.graphMove || 'Move');

        const inner = document.createElement('div');
        inner.className = 'mobile-node-toolbar-inner';

        const addBtn = (act, icon, title, opts = {}) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mobile-node-tool' + (opts.danger ? ' mobile-node-tool--danger' : '');
            b.setAttribute('data-act', act);
            b.title = title;
            b.setAttribute('aria-label', title);
            b.innerHTML = `<span class="mobile-node-tool__ic" aria-hidden="true">${icon}</span>`;
            if (opts.disabled) b.disabled = true;
            inner.appendChild(b);
        };

        addBtn('move', '✥', moveTitle, { disabled: !canMove });
        addBtn('edit', '✏️', ui.graphEdit || 'Edit');
        if (canAddChildren) {
            addBtn('add-folder', '📁+', ui.graphAddFolder || 'Add folder');
            addBtn('add-file', '📄+', ui.graphAddLesson || 'Add lesson');
        }
        if (!isRoot) {
            addBtn('delete', '🗑️', ui.graphDelete || 'Delete', { danger: true });
        }

        wrap.appendChild(inner);
        return wrap;
    }

export function bindMobileNodeToolbar(wrap, node) {
        wrap.querySelectorAll('.mobile-node-tool[data-act]').forEach((btn) => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (btn.disabled) return;
                this.selectedNodeId = node.id;
                const act = btn.getAttribute('data-act');
                if (act === 'move') this.openMoveNodePicker();
                else if (act === 'edit') {
                    if (node.type === 'branch' || node.type === 'root') store.setModal({ type: 'node-properties', node });
                    else store.openEditor(node);
                } else if (act === 'delete') this.handleDockAction('delete');
                else if (act === 'add-folder') this.handleDockAction('new-folder');
                else if (act === 'add-file') this.handleDockAction('new-file');
            };
        });
    }

export function buildMobileInlineNodeToolsHTML(node, opts = {}) {
        const ui = store.ui;
        const canWrite = fileSystem.features.canWrite;
        if (!node || !canWrite) return '';
        const compactClass = opts.compact ? ' mobile-inline-tools--compact' : '';
        const isRoot = node.type === 'root';
        const canAddChildren = node.type !== 'exam';
        const canMove = !isRoot && !fileSystem.isLocal;
        const moveTitle = !canMove
            ? (ui.moveLocalUnsupported || 'Move unavailable')
            : (ui.graphMove || 'Move');

        const btn = (act, icon, title, extra = '') =>
            `<button type="button" class="mobile-inline-tool${extra}" data-act="${act}" aria-label="${title}" title="${title}"><span aria-hidden="true">${icon}</span></button>`;

        let html = `<div class="mobile-inline-tools${compactClass}" role="group" aria-label="${ui.navConstruct || 'Construction'}">`;
        html += btn('edit', '✏️', ui.graphEdit || 'Edit');
        if (canAddChildren) {
            html += btn('add-folder', '📁+', ui.graphAddFolder || 'Add folder');
            html += btn('add-file', '📄+', ui.graphAddLesson || 'Add lesson');
        }
        html += btn('move', '↕️', moveTitle, canMove ? '' : ' is-disabled');
        if (!isRoot) html += btn('delete', '🗑️', ui.graphDelete || 'Delete', ' mobile-inline-tool--danger');
        html += `</div>`;
        return html;
    }

export function createMobileInlineNodeTools(node, opts = {}) {
        const html = this.buildMobileInlineNodeToolsHTML(node, opts);
        if (!html) return null;
        const host = document.createElement('div');
        host.innerHTML = html;
        return host.firstElementChild;
    }

export function runMobileNodeAction(node, act) {
        if (!node || !act) return;
        if (act === 'move') {
            if (node.type === 'root' || fileSystem.isLocal) return;
            this.selectedNodeId = node.id;
            this.openMoveNodePicker();
            return;
        }
        if (act === 'edit') {
            this.selectedNodeId = node.id;
            this.isMoveMode = false;
            if (node.type === 'branch' || node.type === 'root') store.setModal({ type: 'node-properties', node });
            else store.openEditor(node);
            return;
        }
        if (act === 'delete' || act === 'add-folder' || act === 'add-file') {
            this.selectedNodeId = node.id;
            this.handleDockAction(act === 'add-folder' ? 'new-folder' : act === 'add-file' ? 'new-file' : 'delete');
        }
    }

export function bindMobileInlineNodeTools(scope, node) {
        if (!scope || !node) return;
        scope.querySelectorAll('.mobile-inline-tool[data-act]').forEach((btn) => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (btn.classList.contains('is-disabled')) return;
                const act = btn.getAttribute('data-act');
                this.runMobileNodeAction(node, act);
                this._mobileRenderKey = null;
                this.renderMobilePrototypeTree(store.value.data);
            };
        });
    }
