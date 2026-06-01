import { store } from '../../../core/store.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { parseNostrTreeUrl } from '../../nostr/nostr-refs.js';
import { modalWindowCloseXHtml } from '../../../shared/ui/dock-sheet-chrome.js';
import { calloutHtml } from '../../../shared/ui/callout.js';
import { formatUserHandle, computePublicTag } from '../../../shared/lib/user-handle.js';
import {
    esc,
    escAttr,
    timeAgo,
    fullTime,
    pseudonym,
    snippetText,
    isGeneral,
    displayThreadTitle,
    threadNode,
    threadsFor,
    countMsgs,
    lastMsgTime,
    sortByActivity,
    placeTypeFallbackIcon,
    placeIconFromNode,
    forumPlacesById,
    buildPlaces,
    defaultForumCollapsedBranchIds,
    forumPlaceFilterMatchSet,
    forumPlaceRowShownInDesktopSidebar,
    snapForumPlaceIdIfCollapsed,
    normalizedParentId
} from './forum-modal-utils.js';
import { forumModalRenderMethods } from './forum-modal-render-mixin.js';

/* ── Mobile panel states: 'threads' | 'posts' ── */

class ArboritoModalForum extends HTMLElement {
    constructor() {
        super();
        this._placeId = null;
        /** null = user has not opened a topic yet (pick from list before posting). */
        this._threadId = null;
        this._searchQ = '';
        this._searching = false;
        this._searchResults = [];
        this._searchTimer = null;
        this._draft = '';
        this._mobilePanel = 'threads';
        /** Scroll post list to end only after explicit user actions (not every store sync). */
        this._scrollPostsToEnd = true;
        this._posting = false;
        this._newTopicOpen = false;
        this._newTopicTitle = '';
        this._newTopicBody = '';
        this._creatingTopic = false;
        /** Newly created thread: empty copy until there are messages or thread changes. */
        this._justCreatedThreadId = null;
        /** After paint, focus and show compose panel. */
        this._focusComposeNext = false;
        /** Reply target message id (same thread). */
        this._replyParentId = null;
        /** @type {(() => void) | null} */
        this._ntEscCleanup = null;
        /** Pagination: show only last N messages in long threads (UI-only). */
        this._maxThreadMessages = 220;
        /** Collapsed course-area rows in the forum sidebar (branch ids). */
        this._collapsedForumPlaceIds = new Set();
        /** Filter sidebar / mobile zone list by section title. */
        this._forumPlaceFilterQ = '';
        /** Scroll topics column to top after changing course area (lg+). */
        this._forumScrollThreadsTop = false;
        /** Mobile: left navigation drawer (course areas). */
        this._forumMobNavOpen = false;
        /** Mobile: drill-down navigation stack (place ids). */
        this._forumMobNavStack = [];
        /** Desktop: drill-down navigation stack (place ids). */
        this._forumDeskNavStack = [];
        /** Strict moderation panel state (mod-only). */
        this._modPanelOpen = false;
        this._modPolicyMode = 'free';
        this._modPolicyLoading = false;
        this._modPendingList = [];
        this._modPendingLoading = false;
    }

    _reseedForumPlaceCollapse() {
        this._collapsedForumPlaceIds.clear();
        const places = buildPlaces(store.state.data);
        for (const id of defaultForumCollapsedBranchIds(places)) {
            this._collapsedForumPlaceIds.add(id);
        }
    }

    /** Open forum focused on a course node: expand ancestors in the sidebar. */
    _applyForumOpenPlaceId(nodeId) {
        const id = String(nodeId || '').trim();
        if (!id) return;
        const root = store.state.data;
        if (!root) return;
        const places = buildPlaces(root);
        const byId = forumPlacesById(places);
        let cur = byId.get(id);
        if (!cur) {
            this._placeId = null;
            return;
        }
        while (cur) {
            this._collapsedForumPlaceIds.delete(String(cur.id));
            const pid = cur.parentId;
            if (!pid) break;
            cur = byId.get(String(pid));
        }
        this._placeId = id;
    }

    connectedCallback() {
        this._lastSid = (store.state.activeSource && store.state.activeSource.id);
        this._reseedForumPlaceCollapse();
        const restored = store.consumeForumShellSnapshot();
        if (restored) {
            if (Object.prototype.hasOwnProperty.call(restored, 'threadId')) this._threadId = restored.threadId;
            if (Object.prototype.hasOwnProperty.call(restored, 'placeId')) this._placeId = restored.placeId;
            if (restored.mobilePanel) this._mobilePanel = restored.mobilePanel;
            if (restored.draft !== undefined) this._draft = restored.draft;
            if (Object.prototype.hasOwnProperty.call(restored, 'replyParentId')) this._replyParentId = restored.replyParentId;
        }
        const m = store.state.modal;
        if (m && typeof m === 'object' && m.type === 'forum' && m.placeId != null && String(m.placeId).trim() !== '') {
            this._applyForumOpenPlaceId(String(m.placeId));
        }
        this._forumRenderRaf = null;
        this._onStore = () => {
            if (!this.isConnected) return;
            const sid = (store.state.activeSource && store.state.activeSource.id);
            if (this._lastSid !== sid) {
                this._lastSid = sid;
                this._placeId = null;
                this._threadId = null;
                this._mobilePanel = 'threads';
                this._scrollPostsToEnd = true;
                this._justCreatedThreadId = null;
                this._focusComposeNext = false;
                this._replyParentId = null;
                this._searchQ = '';
                this._searching = false;
                this._searchResults = [];
                this._reseedForumPlaceCollapse();
                this._forumPlaceFilterQ = '';
                this._forumScrollThreadsTop = false;
                this._forumMobNavOpen = false;
                this._forumMobNavStack = [];
                this._forumDeskNavStack = [];
                this._clearNewTopicUi();
            }
            const u = (store.state.activeSource && store.state.activeSource.url);
            if (u && parseNostrTreeUrl(String(u))) {
                const forumAuthed = typeof store.isSignedIn === 'function' && store.isSignedIn();
                if (forumAuthed) {
                    void store.ensureTreeForumPlaceLoaded(this._placeId);
                    if (this._threadId) void store.ensureTreeForumThreadLoaded(this._threadId);
                }
            }
            if (this._forumRenderRaf) return;
            this._forumRenderRaf = requestAnimationFrame(() => {
                this._forumRenderRaf = null;
                if (this.isConnected) this.render();
            });
        };
        store.addEventListener('state-change', this._onStore);
        void (async () => {
            try {
                const u = (store.state.activeSource && store.state.activeSource.url);
                if (u && parseNostrTreeUrl(String(u))) {
                    const forumAuthed = typeof store.isSignedIn === 'function' && store.isSignedIn();
                    if (forumAuthed) {
                        await store.hydrateTreeForumIfNeeded();
                        await store.ensureTreeForumPlaceLoaded(this._placeId);
                        if (this._threadId) await store.ensureTreeForumThreadLoaded(this._threadId);
                    }
                }
            } catch {
                /* hydrateTreeForumIfNeeded already logs the warning. */
            }
            if (this.isConnected) this.render();
        })();
    }

    disconnectedCallback() {
        store.removeEventListener('state-change', this._onStore);
        if (this._forumRenderRaf) {
            cancelAnimationFrame(this._forumRenderRaf);
            this._forumRenderRaf = null;
        }
        this._clearNewTopicUi();
    }

    _clearNewTopicUi() {
        this._newTopicOpen = false;
        this._newTopicTitle = '';
        this._newTopicBody = '';
        if (this._ntEscCleanup) {
            this._ntEscCleanup();
            this._ntEscCleanup = null;
        }
    }

    /** Keeps thread / place / draft when a global dialog temporarily unmounts the forum. */
    _beforeGlobalDialog() {
        store.stashForumShellBeforeDialog({
            threadId: this._threadId,
            placeId: this._placeId,
            mobilePanel: this._mobilePanel,
            draft: this._draft,
            replyParentId: this._replyParentId
        });
    }

    close() { store.dismissModal(); }

    snap() {
        const src = store.state.activeSource;
        return src ? store.forumStore.getSnapshot(src.id) : null;
    }

    myPub() {
        try { return ((store.getNetworkUserPair && store.getNetworkUserPair()) ? store.getNetworkUserPair().pub : undefined) || ''; } catch { return ''; }
    }

    canMod() { return !!(store.value && store.value.constructionMode) && store.canModerateForum(); }

    isAuthenticated() { return typeof store.isSignedIn === 'function' && store.isSignedIn(); }

    actor() { return fileSystem.isLocal ? 'local-owner' : 'web'; }

    // --- Actions ---

    openNewTopicSheet() {
        if (!this.isAuthenticated()) {
            this._showLoginRequiredDialog();
            return;
        }
        (this._ntEscCleanup && this._ntEscCleanup());
        this._ntEscCleanup = null;
        this._newTopicOpen = true;
        this._newTopicTitle = '';
        this._newTopicBody = '';
        this.render();
        requestAnimationFrame(() => {
            const inpF = this.querySelector('#forum-new-topic-input'); if (inpF) inpF.focus();
        });
        if (!this._ntEscCleanup) {
            const h = (e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                e.stopImmediatePropagation();
                this.cancelNewTopicSheet();
            };
            /* Capture so we run before arborito-modals' Escape → dismissModal (would close whole forum). */
            document.addEventListener('keydown', h, true);
            this._ntEscCleanup = () => document.removeEventListener('keydown', h, true);
        }
    }

    _showLoginRequiredDialog() {
        const ui = store.ui;
        const title = ui.forumLoginRequiredTitle || 'Inicia sesión para participar';
        const body = ui.forumLoginRequiredBody || 'Debes estar logueado para escribir en el foro.';
        store.showDialog({
            type: 'alert',
            title: title,
            body: body,
            confirmText: ui.forumLoginGoToProfile || ui.publishNeedLoginTitle || 'Ir a Perfil',
            cancelText: ui.cancel || 'Cancelar'
        }).then((confirmed) => {
            if (confirmed) {
                store.setModal({ type: 'profile' });
            }
        });
    }

    cancelNewTopicSheet() {
        if (!this._newTopicOpen) return;
        this._clearNewTopicUi();
        this.render();
    }

    onReplyTo(messageId) {
        if (!this._threadId || !messageId) return;
        this._replyParentId = String(messageId);
        this._draft = '';
        this._scrollPostsToEnd = false;
        this.render();
        requestAnimationFrame(() => {
            const panel = this.querySelector('#forum-compose-panel');
            const ta = this.querySelector('#forum-compose');
            if (panel) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            if (ta) ta.focus();
        });
    }

    async commitNewTopic() {
        if (this._creatingTopic) return;
        const inp = this.querySelector('#forum-new-topic-input');
        const ta = this.querySelector('#forum-new-topic-body');
        const title = String((inp && inp.value) || this._newTopicTitle || '').trim();
        const body = String((ta && ta.value) || this._newTopicBody || '').trim();
        const ui = store.ui;
        if (!title) {
            store.notify(ui.forumNewTopicNeedsTitle || ui.forumNewThreadPrompt || 'Title required.', true);
            if (inp) inp.focus();
            return;
        }
        if (!body) {
            store.notify(ui.forumNewTopicNeedsBody || 'Write the first message for this topic.', true);
            const el = (ta || inp); if (el) el.focus();
            return;
        }
        const src = store.state.activeSource;
        if (!src) return;
        this._creatingTopic = true;
        const btn = this.querySelector('.forum-nt-create');
        if (btn) {
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
        }
        const t = store.addForumThread(src.id, {
            title,
            nodeId: isGeneral(this._placeId) ? null : String(this._placeId)
        });
        const author = { name: '', avatar: '💬' };
        try {
            await store.addForumMessage(src.id, { threadId: t.id, body, author, parentId: null });
        } catch (e) {
            console.warn('Forum first post failed', e);
            /* Roll back the empty thread we just created so the forum doesn't
             * accumulate orphaned headers when the first message can't be
             * published (network down, NIP-04 missing key, etc.). */
            try {
                if (store.forumStore && typeof store.forumStore.deleteThread === 'function') {
                    store.forumStore.deleteThread(src.id, t.id, { actor: 'self-rollback' });
                }
            } catch (_) { /* best-effort cleanup */ }
            store.notify(ui.forumPostFailed || 'Could not create topic. Try again.', true);
            this._creatingTopic = false;
            if (btn) {
                btn.disabled = false;
                btn.removeAttribute('aria-busy');
            }
            return;
        }
        this._creatingTopic = false;
        this._clearNewTopicUi();
        this._threadId = t.id;
        this._mobilePanel = 'posts';
        this._justCreatedThreadId = null;
        this._focusComposeNext = false;
        this._replyParentId = null;
        this._draft = '';
        this._scrollPostsToEnd = true;
        const openedMsg = ui.forumNewTopicOpened;
        if (openedMsg) store.notify(openedMsg, false);
        store.update({});
        this.render();
    }

    renderNewTopicOverlay(ui, pLabel) {
        return `<div id="forum-new-topic-scrim" class="forum-nt-scrim absolute inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-8" role="presentation">
            <div id="forum-new-topic-card" role="dialog" aria-modal="true" aria-labelledby="forum-nt-heading" class="forum-nt-card w-full max-w-[480px] rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-600/80 bg-white dark:bg-slate-900 p-5 sm:p-7 max-h-[min(92dvh,720px)] flex flex-col min-h-0">
                <div class="flex items-start justify-between gap-3 mb-4 shrink-0">
                    <div class="min-w-0">
                        <p class="arborito-eyebrow mb-1">${esc(ui.forumNewTopicSheetKicker || '')}</p>
                        <h3 id="forum-nt-heading" class="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">${esc(ui.forumNewTopicSheetTitle || ui.forumNewThread || 'New topic')}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">${esc((ui.forumNewTopicSheetHint || '').replace('{place}', pLabel))}</p>
                    </div>
                    <button type="button" class="forum-nt-dismiss arborito-icon-btn arborito-icon-btn--md" aria-label="${escAttr(ui.close || 'Close')}">${'\u00d7'}</button>
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 pr-1">
                    <div>
                        <label class="arborito-eyebrow block mb-2" for="forum-new-topic-input">${esc(ui.forumNewThreadPrompt || 'Title')}</label>
                        <input type="text" id="forum-new-topic-input" autocomplete="off" maxlength="200" value="${escAttr(this._newTopicTitle)}"
                            class="forum-nt-input arborito-input text-base py-3.5 font-semibold" placeholder="${escAttr(ui.forumNewTopicPlaceholder || ui.forumNewThreadPrompt || '')}" />
                    </div>
                    <div>
                        <label class="arborito-eyebrow block mb-2" for="forum-new-topic-body">${esc(ui.forumNewTopicFirstMessageLabel || 'First message')}</label>
                        <textarea id="forum-new-topic-body" rows="5" maxlength="8000" class="forum-nt-body arborito-input arborito-textarea font-medium min-h-[7rem] max-h-[min(40vh,14rem)]">${esc(this._newTopicBody)}</textarea>
                    </div>
                </div>
                <div class="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 mt-5 shrink-0 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <button type="button" class="forum-nt-cancel flex-1 min-h-12 rounded-xl font-bold text-sm border-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">${esc(ui.forumNewTopicCancel || ui.cancel || 'Cancel')}</button>
                    <button type="button" class="forum-nt-create flex-1 min-h-12 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900 transition-all active:scale-[0.98]">${esc(ui.forumNewTopicPublish || ui.forumNewTopicCreate || ui.forumPost || 'Publish')}</button>
                </div>
            </div>
        </div>`;
    }

    async onPost() {
        if (this._posting) return;
        const ta = this.querySelector('#forum-compose');
        const body = ((ta && ta.value) || '').trim();
        if (!body || !this._threadId) return;
        const src = store.state.activeSource;
        if (!src) return;
        this._posting = true;
        const postBtn = this.querySelector('.forum-post');
        if (postBtn) {
            postBtn.disabled = true;
            postBtn.setAttribute('aria-busy', 'true');
        }
        if (ta) ta.disabled = true;
        // Anonymous by default (public forum).
        const author = { name: '', avatar: '💬' };
        try {
            await store.addForumMessage(src.id, {
                threadId: this._threadId,
                body,
                author,
                parentId: this._replyParentId || null
            });
            this._draft = '';
            if (ta) ta.value = '';
            this._justCreatedThreadId = null;
            this._replyParentId = null;
            this._scrollPostsToEnd = true;
            store.update({});
        } catch (e) {
            console.warn('Forum post failed', e);
            store.notify(store.ui.forumPostFailed || 'Could not send your message. Try again.', true);
        } finally {
            this._posting = false;
            this.render();
        }
    }

    async onModDeleteMsg(id) {
        const ui = store.ui;
        const src = store.state.activeSource;
        if (!src || !this.canMod()) return;
        this._beforeGlobalDialog();
        if (!(await store.confirm(ui.forumModDeleteMessageConfirm || 'Remove this message?', ui.forumModDeleteTitle || 'Remove message', true))) return;
        if (store.moderateDeleteForumMessage(src.id, id, { actor: this.actor() })) {
            store.notify(ui.forumModRepublishHint || 'Republish the tree so shared links update.', false);
            store.update({});
            this.render();
        }
    }

    async onSelfDeleteMsg(id) {
        const ui = store.ui;
        const src = store.state.activeSource;
        if (!src) return;
        this._beforeGlobalDialog();
        if (!(await store.confirm(ui.forumSelfDeleteConfirm || 'Delete your message?', ui.forumSelfDeleteTitle || 'Delete my message', true))) return;
        await store.selfDeleteForumMessage(src.id, id);
        store.update({});
        this.render();
    }

    async onModDeleteThread(tid) {
        const ui = store.ui;
        const src = store.state.activeSource;
        if (!src || !this.canMod()) return;
        this._beforeGlobalDialog();
        if (!(await store.confirm(ui.forumModDeleteThreadConfirm || 'Delete this entire topic?', ui.forumModDeleteThreadTitle || 'Delete topic', true))) return;
        if (store.moderateDeleteForumThread(src.id, tid, { actor: this.actor() })) {
            if (this._threadId === tid) {
                this._threadId = null;
                this._mobilePanel = 'threads';
            }
            store.notify(ui.forumModRepublishHint || 'Republish the tree so shared links update.', false);
            store.update({});
            this.render();
        }
    }

    async onModRemoveUser(pub) {
        const ui = store.ui;
        const src = store.state.activeSource;
        if (!src || !this.canMod() || !pub) return;
        this._beforeGlobalDialog();
        const treeRef = parseNostrTreeUrl(src.url);
        let isBanned = false;
        try {
            if (treeRef && (store.nostr && store.nostr.loadForumBansV3)) {
                const set = await store.nostr.loadForumBansV3({ ownerPub: treeRef.pub, universeId: treeRef.universeId });
                isBanned = !!(set && typeof set.has === 'function' && set.has(String(pub)));
            }
        } catch {
            /* ignore */
        }
        if (isBanned) {
            if (!(await store.confirm(ui.forumModUnbanUserConfirm || 'Unban this user? (Their previously deleted messages will not come back.)', ui.forumModUnbanUserTitle || 'Unban user', true))) return;
            await store.setForumBanForActiveTree({ targetPub: pub, banned: false });
        } else {
            if (!(await store.confirm(ui.forumModBanUserConfirm || 'Ban this user AND remove every message they posted in this forum? This cannot be undone.', ui.forumModBanUserTitle || 'Ban user and remove messages', true))) return;
            await store.setForumBanForActiveTree({ targetPub: pub, banned: true });
        }
        this.render();
    }

    async onDelAccount() {
        const ui = store.ui;
        const src = store.state.activeSource;
        if (!src || !parseNostrTreeUrl(src.url)) return;
        this._beforeGlobalDialog();
        if (!(await store.confirm(ui.forumDeleteMyAccountConfirm || 'Remove your online identity?', ui.forumDeleteMyAccountTitle || 'Remove my online identity', true))) return;
        if (!(await store.confirm(ui.forumDeleteMyAccountConfirmFinal || 'This is your last step. Remove your online identity for this course?', ui.forumDeleteMyAccountTitle || 'Remove my online identity', true))) return;
        await store.selfDeleteNostrForumAccount(src.id);
        this.render();
    }

    // --- Strict moderation (owner-only) ---

    async _refreshModPolicyMode() {
        const treeRef = parseNostrTreeUrl((store.state.activeSource && store.state.activeSource.url) || '');
        if (!treeRef) return;
        try {
            this._modPolicyMode = await store.getForumModerationModeForActiveTree(treeRef);
        } catch {
            this._modPolicyMode = 'free';
        }
    }

    async toggleModPanel() {
        if (!this.canMod()) return;
        this._modPanelOpen = !this._modPanelOpen;
        if (this._modPanelOpen) {
            await this._refreshModPolicyMode();
            void this.refreshPendingList();
        }
        this.render();
    }

    async setModPolicy(mode) {
        if (!this.canMod()) return;
        const next = mode === 'strict' ? 'strict' : 'free';
        if (this._modPolicyLoading || this._modPolicyMode === next) return;
        this._modPolicyLoading = true;
        this.render();
        const ok = await store.setForumModerationPolicyMode(next);
        if (ok) this._modPolicyMode = next;
        this._modPolicyLoading = false;
        if (this._modPanelOpen) await this.refreshPendingList();
        this.render();
    }

    async refreshPendingList() {
        if (!this.canMod()) {
            this._modPendingList = [];
            return;
        }
        this._modPendingLoading = true;
        this.render();
        try {
            this._modPendingList = await store.listForumPendingSummariesForActiveTree();
        } catch {
            this._modPendingList = [];
        }
        this._modPendingLoading = false;
        this.render();
    }

    async approvePending(messageId) {
        const src = store.state.activeSource;
        if (!src || !this.canMod() || !messageId) return;
        await store.approveForumPendingMessage(src.id, messageId);
        await this.refreshPendingList();
    }

    async rejectPending(messageId) {
        const ui = store.ui;
        const src = store.state.activeSource;
        if (!src || !this.canMod() || !messageId) return;
        this._beforeGlobalDialog();
        if (!(await store.confirm(
            ui.forumModRejectConfirm || 'Reject and discard this pending message?',
            ui.forumModRejectTitle || 'Reject message',
            true
        ))) return;
        await store.rejectForumPendingMessage(src.id, messageId);
        await this.refreshPendingList();
    }

    // --- Render helpers ---

    placeLabel(places, ui) {
        const p = places.find((x) => isGeneral(this._placeId) ? x.isGeneral : String(x.id) === String(this._placeId));
        return (!p || p.isGeneral) ? (ui.forumGeneralPlace || 'General') : p.name;
    }

    renderPlaces(places, threads, ui) {
        const collapsed = this._collapsedForumPlaceIds;
        const byId = forumPlacesById(places);
        const filterSet = forumPlaceFilterMatchSet(places, this._forumPlaceFilterQ);
        const rowShell = (inner, sel, extraCls = '') => {
            const base = `w-[calc(100%-0.5rem)] mx-auto mb-1.5 rounded-lg border transition-all flex items-stretch min-h-0 overflow-hidden ${sel ? 'border-slate-800 dark:border-slate-200 bg-slate-100 dark:bg-slate-800 shadow-sm ring-2 ring-slate-800/20 dark:ring-white/15' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/80 hover:border-slate-400 dark:hover:border-slate-500'} ${extraCls}`;
            return `<div class="${base}">${inner}</div>`;
        };
        const parts = [];
        for (const p of places) {
            if (!forumPlaceRowShownInDesktopSidebar(p, collapsed, byId, filterSet)) continue;

            const val = p.isGeneral ? '' : String(p.id);
            const sel = p.isGeneral ? isGeneral(this._placeId) : String(this._placeId) === val;
            const n = threadsFor(threads, p.isGeneral ? null : p.id).length;
            const depth = p.isGeneral ? 0 : Math.min(p.depth || 0, 12);
            const padInner = p.isGeneral ? '' : `padding-left:${12 + depth * 16}px`;
            const depthVar = p.isGeneral ? '' : `--forum-depth:${depth};`;
            const treeBar = !p.isGeneral ? 'box-shadow:none;' : '';
            const label = p.isGeneral ? (ui.forumGeneralPlace || 'General') : p.name;
            const ac = sel ? ' aria-current="true"' : '';
            const hasCh = !p.isGeneral && p.hasChildren;
            const isCollapsed = hasCh && collapsed.has(String(p.id));
            const branchHint = hasCh
                ? ` — ${(isCollapsed ? (ui.forumPlaceExpandAria || '') : (ui.forumPlaceCollapseAria || '')).replace('{name}', label)}`
                : '';
            const ariaFull = escAttr(`${label}, ${n} ${ui.forumTopicsCountShort || 'topics'}${branchHint}`);
            const chev = hasCh ? (isCollapsed ? '▸' : '▾') : '';
            const toggleAria = escAttr(
                (isCollapsed ? (ui.forumPlaceExpandAria || 'Expand {name}') : (ui.forumPlaceCollapseAria || 'Collapse {name}')).replace('{name}', label)
            );
            const toggleBtn = hasCh
                ? `<button type="button" class="forum-place-toggle shrink-0 w-9 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500" data-place-id="${escAttr(val)}" aria-label="${toggleAria}" aria-expanded="${isCollapsed ? 'false' : 'true'}">${esc(chev)}</button>`
                : `<span class="shrink-0 w-9" aria-hidden="true"></span>`;
            const styleInner = [padInner, depthVar, treeBar].filter(Boolean).join(' ');
            const iconSpan = `<span class="shrink-0 text-lg leading-none mt-0.5 opacity-90">${p.isGeneral ? '💬' : esc(p.icon)}</span>
                <span class="min-w-0 flex-1">
                    <span class="block text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">${esc(label)}</span>
                    <span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">${n} ${ui.forumTopicsCountShort || 'topics'}</span>
                </span>`;
            const rowStyle = styleInner ? ` style="${escAttr(styleInner)}"` : '';
            parts.push(rowShell(
                `<div class="flex w-full min-w-0">
                    ${toggleBtn}
                    <button type="button" class="forum-place forum-place-row w-full min-w-0 text-left py-2.5 pr-3 border-0 rounded-none flex items-start gap-1.5 ${p.isGeneral ? 'pl-2' : 'pl-1'} ${sel ? '' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500" data-place-id="${escAttr(val)}"${rowStyle}${ac} aria-label="${ariaFull}" data-depth="${escAttr(String(depth))}">
                        ${iconSpan}
                    </button>
                </div>`,
                sel
            ));
        }
        return parts.join('');
    }

    renderThreads(threads, msgs, ui, mod, lang) {
        return threads.map((t) => {
            const active = t.id === this._threadId;
            const n = countMsgs(msgs, t.id);
            const last = lastMsgTime(msgs, t.id) || t.updatedAt || t.createdAt;
            const countLbl = n === 1 ? (ui.forumReplySingular || '1 reply') : (ui.forumReplyPlural || '{n} replies').replace('{n}', String(n));
            const del = mod
                ? `<button type="button" class="forum-act shrink-0 min-w-12 min-h-[3.25rem] flex items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800/60 text-slate-400 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 dark:hover:border-red-800" data-act="del-thread" data-id="${escAttr(t.id)}" title="${escAttr(ui.forumModDeleteThread || 'Delete')}" aria-label="${escAttr(ui.forumModDeleteThread || 'Delete topic')}">🗑</button>`
                : '';
            const ago = timeAgo(last, lang);
            const titleShown = displayThreadTitle(t, ui);
            const tAria = escAttr(ago ? `${titleShown} — ${countLbl}, ${ago}` : `${titleShown} — ${countLbl}`);
            const cur = active ? ' aria-current="true"' : '';
            return `<div class="flex items-stretch gap-0 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <button type="button" class="forum-thread flex-1 min-w-0 text-left px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 ${active ? 'bg-slate-100 dark:bg-slate-800/90 border-l-[3px] border-l-slate-800 dark:border-l-slate-200' : 'bg-white dark:bg-slate-900 border-l-[3px] border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'}" data-id="${escAttr(t.id)}" aria-label="${tAria}"${cur}>
                    <span class="font-semibold text-slate-900 dark:text-slate-50 text-sm leading-snug line-clamp-2">${esc(titleShown)}</span>
                    <span class="flex items-center gap-2 mt-1 text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        <span class="font-medium">${esc(countLbl)}</span>
                        <span class="text-slate-500 dark:text-slate-400">·</span>
                        <span class="text-slate-600 dark:text-slate-300">${esc(timeAgo(last, lang))}</span>
                    </span>
                </button>
                ${del}
            </div>`;
        }).join('');
    }

    _renderSearchResults(ui, lang) {
        if (this._searching) {
            return `<div class="p-4 text-xs text-slate-600 dark:text-slate-300">${esc(ui.forumSearching || 'Searching…')}</div>`;
        }
        const q = String(this._searchQ || '').trim();
        if (!q) return '';
        const rows = Array.isArray(this._searchResults) ? this._searchResults : [];
        if (!rows.length) {
            return `<div class="p-4 text-xs text-slate-600 dark:text-slate-300">${esc(ui.forumNoSearchResults || 'No matches found (only pages that still exist are searchable).')}</div>`;
        }
        const fmt = (iso) => timeAgo(iso, lang) || iso;
        return `<div class="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
            ${rows
                .slice(0, 40)
                .map(
                    (r) => `<button type="button" class="forum-search-hit w-full text-left px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/60" data-tid="${escAttr(
                        r.threadId
                    )}" data-wk="${escAttr(r.weekKey)}" data-pid="${escAttr(r.placeId || '')}">
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-xs font-bold text-slate-800 dark:text-slate-100">${esc(r.weekKey)}</span>
                          <span class="text-[11px] text-slate-500 dark:text-slate-400">${esc(fmt(r.createdAt))}</span>
                        </div>
                        <div class="mt-1 text-xs text-slate-700 dark:text-slate-200 line-clamp-2">${esc(r.snippet || '')}</div>
                    </button>`
                )
                .join('')}
        </div>`;
    }

    _scheduleSearch() {
        if (this._searchTimer) clearTimeout(this._searchTimer);
        const q = String(this._searchQ || '').trim();
        if (!q) {
            this._searchResults = [];
            this._searching = false;
            return;
        }
        this._searching = true;
        this._searchTimer = setTimeout(async () => {
            try {
                this._searchResults = await store.searchTreeForumV3(q, { maxWeeks: 18, maxResults: 80 });
            } catch {
                this._searchResults = [];
            } finally {
                this._searching = false;
                if (this.isConnected) this.render();
            }
        }, 350);
    }

    /** Message card; `replyIndex` is 1-based for the # label. opts: isOpening, showReply */
    _renderMessageCard(m, replyIndex, ui, mod, lang, opts = {}) {
        const { isOpening = false, showReply = true } = opts;
        const myP = this.myPub();
        const ap = String((m.author && m.author.pub) || '');
        const replyBtn = showReply && this._threadId
            ? `<button type="button" class="forum-act text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white min-h-10 px-2 py-1.5 rounded-md" data-act="reply-to" data-id="${escAttr(m.id)}" aria-label="${escAttr(ui.forumReplyToButton || 'Reply')}">${esc(ui.forumReplyToButton || 'Reply')}</button>`
            : '';
        const selfDel = myP && ap === myP
            ? `<button type="button" class="forum-act text-xs font-bold text-slate-500 hover:text-red-500 min-h-10 px-2 py-1.5 rounded-md" data-act="self-del" data-id="${escAttr(m.id)}" aria-label="${escAttr(ui.forumSelfDeleteMessage || 'Delete')}">${esc(ui.forumSelfDeleteMessage || 'Delete')}</button>`
            : '';
        const modDel = mod
            ? `<button type="button" class="forum-act text-xs font-bold text-slate-500 hover:text-red-500 min-h-10 px-2 py-1.5 rounded-md" data-act="mod-del" data-id="${escAttr(m.id)}" aria-label="${escAttr(ui.forumModDeleteMessage || 'Remove')}">${esc(ui.forumModDeleteMessage || 'Remove')}</button>`
            : '';
        const modUser = mod && ap
            ? `<button type="button" class="forum-act text-xs font-bold text-amber-600 hover:text-red-500 min-h-10 px-2 py-1.5 rounded-md" data-act="mod-user" data-id="${escAttr(ap)}" aria-label="${escAttr(ui.forumModBanUserButton || ui.forumModRemoveUser || 'Ban user')}">${esc(ui.forumModBanUserButton || ui.forumModRemoveUser || 'Ban user')}</button>`
            : '';
        const opClass = isOpening ? ' forum-msg-card--op' : '';
        const ob = (ui.forumOpeningBadge || '').trim();
        const openBadge = isOpening && ob
            ? `<span class="arborito-pill arborito-pill--sm arborito-pill--slate">${esc(ob)}</span>`
            : '';
        return `<article class="forum-msg-card${opClass} rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm overflow-hidden">
            <div class="flex items-start gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                <div class="shrink-0 w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-xl">${esc((m.author && m.author.avatar) || '💬')}</div>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        ${openBadge}
                        <span class="font-semibold text-sm text-slate-900 dark:text-slate-50">${(() => {
                            const nm = ((m.author && m.author.name) && String((m.author && m.author.name)).trim()) ? String((m.author && m.author.name)).trim() : '';
                            const pub = String((m.author && m.author.pub) || '').trim();
                            const anon = ui.forumAnonName || 'Anon';
                            const base = nm ? formatUserHandle(nm, pub) : anon;
                            return esc(base || anon);
                        })()}</span>
                        ${(() => {
                            const pub = String((m.author && m.author.pub) || '').trim();
                            if (!pub) return '';
                            const t = computePublicTag(pub);
                            if (!t) return '';
                            const title = escAttr(ui.forumUserTagHint || 'Public user tag');
                            return `<span class="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 select-none" title="${title}">#${esc(t)}</span>`;
                        })()}
                        <time class="text-xs font-medium text-slate-500 dark:text-slate-400" datetime="${escAttr(m.createdAt)}" title="${escAttr(fullTime(m.createdAt))}">${esc(timeAgo(m.createdAt, lang) || fullTime(m.createdAt))}</time>
                        <span class="text-xs text-slate-400 dark:text-slate-500 font-mono">#${replyIndex}</span>
                    </div>
                    <div class="mt-2 text-[15px] text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words leading-relaxed forum-msg-body">${esc(m.body)}</div>
                    <div class="flex flex-wrap items-center gap-2 mt-3 empty:hidden">${replyBtn}${selfDel}${modDel}${modUser}</div>
                </div>
            </div>
        </article>`;
    }

    renderPosts(messages, ui, mod, lang) {
        const sortedAll = [...messages].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        const maxN = Math.max(30, Math.min(800, Number(this._maxThreadMessages) || 220));
        const sorted = sortedAll.length > maxN ? sortedAll.slice(sortedAll.length - maxN) : sortedAll;
        const freshEmpty = !sorted.length && this._justCreatedThreadId === this._threadId;
        if (!sorted.length) {
            const emptyTitle = freshEmpty ? (ui.forumEmptyNewTopicTitle || ui.forumEmpty) : (ui.forumEmpty || 'No messages yet.');
            const emptyBody = freshEmpty ? (ui.forumEmptyNewTopicBody || ui.forumEmptyHint) : (ui.forumEmptyHint || '');
            return `<div class="arborito-empty arborito-empty--dashed mx-1 my-2">
                <div class="arborito-empty__icon" aria-hidden="true">✍️</div>
                <p class="arborito-empty__title text-base">${esc(emptyTitle)}</p>
                <p class="arborito-empty__body mt-2 max-w-sm">${esc(emptyBody)}</p>
                ${(ui.forumEmptyPointToCompose || '').trim() ? calloutHtml({ tone: 'slate', size: 'sm', inline: true, extraClass: 'mt-4', body: esc(ui.forumEmptyPointToCompose) }) : ''}
            </div>`;
        }
        const idSet = new Set(sorted.map((m) => m.id));
        const norm = sorted.map((m) => ({ ...m, _parent: normalizedParentId(m, idSet) }));
        const byParent = new Map();
        for (const m of norm) {
            const key = m._parent || '';
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key).push(m);
        }
        for (const [, arr] of byParent) {
            arr.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        }
        const roots = byParent.get('') || [];
        let seq = 0;
        const walk = (m, isOp) => {
            seq += 1;
            const children = byParent.get(m.id) || [];
            let block = this._renderMessageCard(m, seq, ui, mod, lang, { isOpening: isOp });
            if (children.length) {
                block += `<div class="forum-msg-children border-l-2 border-slate-200 dark:border-slate-600 ml-2 sm:ml-4 pl-2 sm:pl-3 mt-2 space-y-2">`;
                for (const c of children) block += walk(c, false);
                block += '</div>';
            }
            return `<div class="forum-msg-tree-node">${block}</div>`;
        };
        if (roots.length === 0 && norm.length > 0) {
            const flat = [...norm].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
            let s = 0;
            return flat
                .map((m, i) => {
                    s += 1;
                    return `<div class="forum-msg-tree-node">${this._renderMessageCard(m, s, ui, mod, lang, { isOpening: i === 0 })}</div>`;
                })
                .join('');
        }
        const bodyHtml = roots.map((r, i) => walk(r, i === 0)).join('');
        const clipped = sortedAll.length > sorted.length;
        const clipNote = clipped
            ? `<div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                   ${esc((ui.forumThreadClipped || 'Showing the most recent {n} posts in this topic. Older posts are hidden to keep the forum fast.').replace('{n}', String(sorted.length)))}
               </div>`
            : '';
        return `${clipNote}${bodyHtml}`;
    }
}

Object.assign(ArboritoModalForum.prototype, forumModalRenderMethods);

customElements.define('arborito-modal-forum', ArboritoModalForum);
