import { store } from '../../store.js';
import { parseNostrTreeUrl } from '../../services/nostr-refs.js';
import { modalWindowCloseXHtml } from '../../utils/dock-sheet-chrome.js';
import {
    esc,
    escAttr,
    pseudonym,
    snippetText,
    isGeneral,
    displayThreadTitle,
    threadNode,
    threadsFor,
    sortByActivity,
    buildPlaces,
    forumPlacesById,
    snapForumPlaceIdIfCollapsed,
    forumPlaceFilterMatchSet
} from './forum-modal-utils.js';

/** Main forum modal render + DOM bindings (split from forum.js). */
export const forumModalRenderMethods = {

    render() {
        const ui = store.ui;
        const lang = (store.state.lang || 'en').toLowerCase();
        const embedded = this.hasAttribute('embed');
        const snap = this.snap();
        const src = store.state.activeSource;
        const root = store.state.data;
        const mod = this.canMod();

        const shell = `<div id="modal-backdrop" class="forum-outer-backdrop fixed inset-0 z-[70] flex items-stretch md:items-center justify-center bg-slate-950/80 backdrop-blur-[4px] p-0 md:p-4 animate-in arborito-modal-root">
            <div role="dialog" aria-modal="true" aria-labelledby="forum-modal-title" class="forum-shell-panel relative bg-white dark:bg-slate-950 shadow-[0_32px_120px_-20px_rgba(0,0,0,0.45)] dark:shadow-[0_32px_120px_-20px_rgba(0,0,0,0.75)] w-full max-w-7xl md:rounded-[1.75rem] border border-slate-200/90 dark:border-slate-700/90 overflow-hidden h-[100dvh] md:h-[min(94vh,920px)] flex flex-col min-h-0 ring-1 ring-slate-900/5 dark:ring-white/10">`;
        const shellEnd = `</div></div>`;

        if (!src || !store.state.rawGraphData) {
            this.innerHTML = `${shell}
                <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
                    <h2 id="forum-modal-title" class="arborito-mmenu-subtitle m-0 text-lg font-bold text-slate-900 dark:text-white">${esc(ui.forumTitle || 'Forum')}</h2>
                    ${embedded ? '' : modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="p-6 sm:p-8 flex flex-col items-center gap-4 text-center max-w-md mx-auto">
                    <p class="text-slate-600 dark:text-slate-400 leading-relaxed m-0">${esc(ui.forumNoTree || 'Load a tree first.')}</p>
                    <button type="button" class="forum-open-trees w-full sm:w-auto min-h-12 px-6 py-3 rounded-2xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 transition-colors">${esc(ui.forumOpenTreesButton || ui.navSources || 'Trees')}</button>
                </div>
            ${shellEnd}`;
            this.querySelectorAll('.btn-close').forEach((b) => { b.onclick = () => this.close(); });
            this.querySelector('.forum-open-trees')?.addEventListener('click', () => {
                if (!this.hasAttribute('embed')) this.close();
                store.setModal('sources');
            });
            const emptyBd = this.querySelector('#modal-backdrop');
            if (emptyBd) {
                emptyBd.onclick = (e) => {
                    if (e.target === emptyBd) this.close();
                };
            }
            return;
        }

        const isPublicForumTree = !!(src && parseNostrTreeUrl(src.url));
        const forumGateAuthed = typeof store.isPasskeyAuthed === 'function' && store.isPasskeyAuthed();
        if (isPublicForumTree && !forumGateAuthed) {
            const title = esc(ui.forumParticipationNeedLoginTitle || ui.publishNeedLoginTitle || 'Sign in required');
            const body = esc(
                ui.forumParticipationNeedLoginBody ||
                    ui.publishNeedLoginBody ||
                    'Sign in from Profile to use the forum on public courses.'
            );
            const profileCta = esc(ui.forumParticipationOpenProfile || ui.navProfile || 'Profile');
            const closeEmbedded = embedded ? '' : modalWindowCloseXHtml(ui, 'btn-close');
            this.innerHTML = `${shell}
                <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
                    <h2 id="forum-modal-title" class="arborito-mmenu-subtitle m-0 text-lg font-bold text-slate-900 dark:text-white">${esc(ui.forumTitle || 'Forum')}</h2>
                    ${closeEmbedded}
                </div>
                <div class="flex flex-1 flex-col items-center justify-center p-5 sm:p-6 text-center min-h-0 overflow-y-auto">
                    <p class="text-sm font-bold text-slate-800 dark:text-slate-100 m-0 max-w-md leading-snug">${title}</p>
                    <p class="text-xs text-slate-600 dark:text-slate-400 mt-2.5 leading-relaxed max-w-md m-0">${body}</p>
                    <div class="mt-5 flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center shrink-0">
                        <button type="button" class="forum-gate-open-profile min-h-10 flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-900/15 hover:bg-emerald-500 transition-colors">${profileCta}</button>
                        ${
                            embedded
                                ? ''
                                : `<button type="button" class="forum-gate-back min-h-10 flex-1 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800/80">${esc(ui.close || 'Close')}</button>`
                        }
                    </div>
                </div>
            ${shellEnd}`;
            this.querySelectorAll('.btn-close').forEach((b) => {
                b.onclick = () => this.close();
            });
            this.querySelector('.forum-gate-open-profile')?.addEventListener('click', () => {
                if (!this.hasAttribute('embed')) this.close();
                store.setModal({ type: 'profile' });
            });
            this.querySelector('.forum-gate-back')?.addEventListener('click', () => this.close());
            const gateBd = this.querySelector('#modal-backdrop');
            if (gateBd) {
                gateBd.onclick = (e) => {
                    if (e.target !== gateBd || embedded) return;
                    this.close();
                };
            }
            return;
        }

        const allT = (snap && snap.threads) || [];
        const allM = (snap && snap.messages) || [];
        const places = buildPlaces(root);
        const placeById = forumPlacesById(places);
        const collapsedPlaces = this._collapsedForumPlaceIds;
        const snappedPlace = snapForumPlaceIdIfCollapsed(this._placeId, collapsedPlaces, placeById);
        if (snappedPlace !== undefined) {
            this._placeId = snappedPlace;
            this._threadId = null;
            this._replyParentId = null;
            this._mobilePanel = 'threads';
            this._scrollPostsToEnd = true;
        }

        const placeFilterSet = forumPlaceFilterMatchSet(places, this._forumPlaceFilterQ);
        if (placeFilterSet && !isGeneral(this._placeId) && !placeFilterSet.has(String(this._placeId))) {
            this._placeId = null;
            this._threadId = null;
            this._replyParentId = null;
            this._mobilePanel = 'threads';
            this._scrollPostsToEnd = true;
        }

        // Keep active thread in view
        if (this._threadId) {
            const meta = allT.find((x) => x.id === this._threadId);
            if (meta && !threadsFor(allT, this._placeId).some((x) => x.id === this._threadId)) {
                this._placeId = threadNode(meta);
            }
        }

        let here = threadsFor(allT, this._placeId);
        if (this._threadId && !here.some((t) => t.id === this._threadId)) {
            this._threadId = null;
        }
        if (!this._threadId) {
            this._mobilePanel = 'threads';
        }
        here = sortByActivity(here, allM);

        const msgs = this._threadId ? allM.filter((m) => m.threadId === this._threadId) : [];
        if (this._replyParentId && !msgs.some((m) => m.id === this._replyParentId)) {
            this._replyParentId = null;
        }
        const replyTarget = this._replyParentId ? msgs.find((m) => m.id === this._replyParentId) : null;
        const activeT = allT.find((t) => t.id === this._threadId);
        const tTitle = activeT ? displayThreadTitle(activeT, ui) : (ui.forumPickThread || 'Select a topic');
        const pLabel = this.placeLabel(places, ui);
        const placeIsGeneral = isGeneral(this._placeId);
        const structureHint = String(ui.forumStructureHint || '').trim();
        const structureHintHtml = structureHint
            ? `<p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">${esc(structureHint)}</p>`
            : '';
        const subtitleRaw = String(ui.forumSubtitle || '').trim();
        const heroSubtitleHtml = subtitleRaw
            ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">${esc(subtitleRaw)}</p>`
            : '';
        const threadColumnHeadHtml = placeIsGeneral
            ? `<p class="text-sm font-semibold text-slate-900 dark:text-slate-100">${esc(ui.forumThreadsColumnTitle || 'Threads')}</p>`
            : `<p class="text-sm font-semibold text-slate-900 dark:text-slate-100">${esc(ui.forumThreadsColumnTitle || 'Threads')}</p>
               <p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate" title="${escAttr(pLabel)}">${esc(pLabel)}</p>`;
        const searchBoxHtml = isPublicForumTree
            ? `<div class="mt-2">
                <input id="forum-search" type="search" value="${escAttr(this._searchQ)}" placeholder="${escAttr(ui.forumSearchPlaceholder || 'Search forum (best effort)…')}"
                  class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2.5 font-semibold placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30" />
              </div>`
            : '';
        const showThreadCrumb = true;

        const composeLabel = this._threadId
            ? (replyTarget
                ? (ui.forumComposeInlineReplyLabel || ui.forumComposeReplyLabel || 'Your reply')
                : msgs.length === 0
                    ? (ui.forumComposeFirstPostLabel || 'First post in this topic')
                    : (ui.forumComposeThreadReplyLabel || ui.forumComposeReplyLabel || ui.forumReplyLabel || 'Reply'))
            : '';
        const composePlaceholder = this._threadId
            ? (replyTarget || msgs.length > 0
                ? (ui.forumPlaceholderReply || ui.forumPlaceholder || '')
                : (ui.forumPlaceholderFirstPost || ui.forumPlaceholder || ''))
            : (ui.forumReplyDisabled || '');
        const composeAria = this._threadId ? composePlaceholder : (ui.forumReplyDisabled || '');
        const postButtonText = this._threadId
            ? (msgs.length === 0 && !replyTarget
                ? (ui.forumPostFirstButton || ui.forumPostReply || 'Post message')
                : (ui.forumPostReply || 'Send reply'))
            : '';

        const replyWho = replyTarget
            ? String((replyTarget.author && replyTarget.author.name) || pseudonym((replyTarget.author && replyTarget.author.pub)) || '…')
            : '';
        const replyPreview = replyTarget ? snippetText(replyTarget.body, 100) : '';
        const replyBannerHtml = replyTarget
            ? `<div class="forum-reply-target mb-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 flex items-start justify-between gap-2">
                        <span class="min-w-0"><span class="font-bold">${esc((ui.forumReplyingToLabel || 'Replying to {name}').replace('{name}', replyWho))}</span>
                        ${replyPreview ? `<span class="block mt-1 text-slate-500 dark:text-slate-400 line-clamp-2">${esc(replyPreview)}</span>` : ''}</span>
                        <button type="button" class="forum-cancel-reply shrink-0 min-h-8 px-2 py-1 rounded-md font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white text-[11px]" aria-label="${escAttr(ui.forumCancelReply || 'Cancel reply')}">${esc(ui.forumCancelReply || 'Cancel')}</button>
                    </div>`
            : '';

        const fqVal = escAttr(this._forumPlaceFilterQ || '');
        const fqPh = escAttr(ui.forumPlaceFilterPlaceholder || 'Filter by section…');
        const fqLabel = esc(ui.forumPlaceFilterAria || ui.forumPlaceFilterPlaceholder || 'Filter sections');
        const placeFilterDeskHtml = `<div class="mt-2">
                <label class="sr-only" for="forum-place-filter-desk">${fqLabel}</label>
                <input id="forum-place-filter-desk" type="search" enterkeyhint="search" autocomplete="off" value="${fqVal}" placeholder="${fqPh}" class="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm px-2.5 py-1.5 font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-300/80 dark:focus:ring-slate-600" />
            </div>`;

        const limitBody = esc(
            ui.forumLimitNotice ||
                'Note: this forum is community-hosted. Older pages may disappear if nobody keeps seeding them. Search is best-effort and only covers pages that still exist.'
        );
        const limitSummary = esc(ui.forumLimitSummaryShort || 'Forum notice');
        const forumLimitNote = isPublicForumTree
            ? `<div class="hidden lg:block shrink-0 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                <p class="m-0 text-[11px] leading-snug text-slate-600 dark:text-slate-300">${limitBody}</p>
              </div>
              <details class="forum-mob-limit-details lg:hidden shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                <summary class="cursor-pointer select-none list-none flex items-center justify-between gap-2 px-3 py-2.5 min-h-11 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <span>${limitSummary}</span>
                  <span class="forum-mob-limit-chev text-slate-400 shrink-0 text-[10px] leading-none transition-transform" aria-hidden="true">▼</span>
                </summary>
                <div class="px-3 pb-3 pt-0 border-t border-slate-200/80 dark:border-slate-700/80">
                  <p class="m-0 text-[11px] leading-snug text-slate-600 dark:text-slate-300">${limitBody}</p>
                </div>
              </details>`
            : '';
        const publicForumFooter = isPublicForumTree
            ? `<div class="shrink-0 px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-amber-50/80 dark:bg-amber-950/30">
                <details class="forum-account-details group rounded-xl border border-amber-200/90 dark:border-amber-800/80 bg-white/60 dark:bg-slate-900/40 px-3 py-2">
                    <summary class="cursor-pointer list-none flex items-center justify-between gap-2 text-xs font-bold text-amber-950 dark:text-amber-100 select-none [&::-webkit-details-marker]:hidden">
                        <span>${esc(ui.forumAccountDangerSummary || 'Account options')}</span>
                        <span class="text-amber-600 dark:text-amber-400 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">▼</span>
                    </summary>
                    <p class="text-[11px] text-amber-900/90 dark:text-amber-200/90 mt-2 mb-2 leading-relaxed">${esc(ui.forumAccountDangerHint || '')}</p>
                    <button type="button" class="forum-del-account w-full min-h-11 px-3 py-2 rounded-lg text-xs font-bold border-2 border-amber-600 dark:border-amber-600 text-amber-950 dark:text-amber-50 hover:bg-amber-100 dark:hover:bg-amber-950/80">${esc(ui.forumDeleteMyAccountButton || 'Remove my online identity')}</button>
                </details>
            </div>` : '';

        const modBadge = mod
            ? `<span class="text-[10px] text-amber-800 dark:text-amber-200/90 mt-0.5 block font-bold">${esc(ui.forumModModeBanner || 'Moderation on')}</span>`
            : '';

        /** Mobile: single stack — in thread → thread list; on list → close forum (do not reuse generic modal btn-close). */
        const showStackBack = this._mobilePanel === 'posts' || (!embedded && this._mobilePanel === 'threads');
        const stackBackAria = this._mobilePanel === 'posts'
            ? (ui.forumAriaBackToList || ui.forumBackToTopicsAria || 'Back')
            : (ui.forumAriaCloseForum || ui.navBack || 'Close');
        const stackBackHtml = showStackBack
            ? `<button type="button" class="forum-stack-back lg:hidden shrink-0 flex items-center justify-center w-10 h-10 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-10 text-lg font-bold leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 dark:focus-visible:ring-slate-500/50" aria-label="${escAttr(stackBackAria)}">←</button>`
            : '';

        const heroHeadingInner = this._mobilePanel === 'posts' && this._threadId
            ? `<span class="lg:hidden">${esc(tTitle)}</span><span class="hidden lg:inline">${esc(ui.forumTitle || 'Forum')}</span>`
            : `<span>${esc(ui.forumTitle || 'Forum')}</span>`;

        const threadHeadHtml = !this._threadId
            ? `<p class="text-xs font-medium text-slate-600 dark:text-slate-400">${esc(pLabel)}</p>
                        <h3 class="text-base md:text-lg font-semibold text-slate-900 dark:text-white leading-snug mt-1">${esc(ui.forumPickThreadHeading || ui.forumPickThread || 'Choose a topic')}</h3>
                        <p class="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed max-w-prose">${esc(ui.forumPickThreadLead || '')}</p>`
            : `${showThreadCrumb ? `<p class="text-xs font-medium text-slate-600 dark:text-slate-400">
                            <button type="button" class="forum-crumb-place inline align-baseline rounded-md px-1.5 py-0.5 -mx-0.5 text-left text-slate-800 dark:text-slate-200 bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300/90 dark:hover:bg-slate-600/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 cursor-pointer transition-colors" aria-label="${escAttr(ui.forumAriaBackToList || ui.forumBackToTopicsAria || 'Back to topic list')}">${esc(pLabel)}</button>
                            <span class="mx-1 text-slate-400">/</span>
                            <span>${esc(ui.forumThreadLabel || 'Thread')}</span>
                        </p>` : ''}
                        <h3 class="text-base md:text-lg font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 ${showThreadCrumb ? 'mt-1' : ''}">${esc(tTitle)}</h3>
                        <p class="text-xs text-slate-600 dark:text-slate-400 mt-1">${esc((ui.forumInTopic || '{n} messages').replace('{n}', String(msgs.length)))}</p>
                        ${msgs.length === 0 && (ui.forumThreadNoMessagesHint || '').trim() ? `<p class="text-xs font-medium text-slate-700 dark:text-slate-300 mt-2">${esc(ui.forumThreadNoMessagesHint)}</p>` : ''}`;

        const firstTopicBtnLabel = esc(ui.forumCreateFirstTopicCta || ui.forumNewTopic || '+ Topic');
        const emptyThreadsSub = String(ui.forumEmptyThreadsSubtitle || '').trim();
        const emptyThreadsSubHtml = emptyThreadsSub
            ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-[19rem] leading-relaxed">${esc(emptyThreadsSub)}</p>`
            : '';
        const threadsListEmptyHtml =
            !(this._searchQ && isPublicForumTree) && !here.length
                ? `<div class="flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-10 mx-1">
                        <span class="text-4xl mb-3 opacity-35 grayscale" aria-hidden="true">💬</span>
                        <p class="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-snug max-w-[17rem]">${esc(ui.forumNoThreadsInPlace || 'No topics yet.')}</p>
                        ${emptyThreadsSubHtml}
                        <button type="button" class="forum-empty-first-topic mt-5 min-h-11 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white shadow-md shadow-emerald-900/15 transition-colors">${firstTopicBtnLabel}</button>
                   </div>`
                : '';

        const pickTopicEmptyHtml = !this._threadId
            ? `<div class="flex flex-col flex-1 min-h-[min(48dvh,14rem)] lg:min-h-0 justify-center">
                    <div class="lg:hidden rounded-2xl border-2 border-dashed border-slate-300/90 dark:border-slate-600 bg-white/70 dark:bg-slate-900/50 p-8 mx-2 my-4 text-center text-sm font-medium text-slate-600 dark:text-slate-300">${esc(ui.forumPickThreadBody || ui.forumPickThread || 'Select a topic from the list.')}</div>
                    <div class="hidden lg:flex flex-1 flex-col items-center justify-center text-center px-6 py-8">
                        <span class="text-5xl opacity-25 mb-4 select-none" aria-hidden="true">📂</span>
                        <p class="text-base font-bold text-slate-800 dark:text-slate-100 max-w-md leading-snug">${esc(ui.forumMasterSelectSectionHint || '')}</p>
                        <p class="text-sm text-slate-600 dark:text-slate-400 mt-3 max-w-md leading-relaxed">${esc(ui.forumMasterSelectTopicHint || '')}</p>
                    </div>
               </div>`
            : '';

        const isAuthed = typeof store.isPasskeyAuthed === 'function' && store.isPasskeyAuthed();
        const composePanelHtml = this._threadId && isAuthed
            ? `<div id="forum-compose-panel" class="shrink-0 border-t-2 border-slate-300 dark:border-slate-600 p-3 md:p-4 bg-slate-100 dark:bg-slate-900">
                        ${replyBannerHtml}
                        ${composeLabel ? `<label for="forum-compose" class="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">${esc(composeLabel)}</label>` : ''}
                        <textarea id="forum-compose" rows="3" class="forum-compose-input w-full rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm p-3 resize-y min-h-[5rem] max-h-[min(40vh,15rem)] focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-400/30 focus:outline-none disabled:opacity-50 disabled:resize-none placeholder:text-slate-500 dark:placeholder:text-slate-400" placeholder="${escAttr(composePlaceholder)}" aria-label="${escAttr(composeAria)}">${esc(this._draft)}</textarea>
                        <div class="flex flex-row flex-wrap items-center gap-x-3 gap-y-2 mt-2.5">
                            <p class="text-[10px] text-slate-500 dark:text-slate-400 flex-1 min-w-[8rem] basis-0">${esc(ui.forumPostShortcutHint || 'Ctrl+Enter to send')}</p>
                            <button type="button" class="forum-post min-h-11 px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-white disabled:opacity-40 disabled:pointer-events-none text-white dark:text-slate-900 shrink-0 tracking-wide ml-auto">${esc(postButtonText || ui.forumPost || 'Send')}</button>
                        </div>
                    </div>`
            : this._threadId && !isAuthed
                ? `<div id="forum-compose-panel" class="shrink-0 border-t-2 border-slate-300 dark:border-slate-600 p-3 md:p-4 bg-slate-100 dark:bg-slate-900">
                        <div class="flex flex-col items-center justify-center text-center py-6">
                            <span class="text-2xl mb-2" aria-hidden="true">🔒</span>
                            <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">${esc(ui.forumLoginRequiredTitle || 'Inicia sesión para participar')}</p>
                            <p class="text-xs text-slate-600 dark:text-slate-400 mt-1">${esc(ui.forumLoginRequiredBody || 'Debes estar logueado para escribir en el foro.')}</p>
                        </div>
                    </div>`
                : '';

        const mobNavTitle = esc(ui.forumPlacesHeading || 'Course area');
        const mobNavOpenLabel = esc(ui.forumMobileOpenNav || ui.forumPlacesHeading || 'Course area');
        const mobNavCloseAria = escAttr(ui.forumMobileCloseNavAria || ui.close || 'Close');
        const mobNavBackLabel = esc(ui.forumMobileNavBack || ui.forumBackToTopicsAria || 'Back');
        const mobNavStack = Array.isArray(this._forumMobNavStack) ? this._forumMobNavStack : [];
        const rootPlace = places.find((p) => !p.isGeneral && (p.depth || 0) === 0) || null;
        const rootId = rootPlace ? String(rootPlace.id) : null;
        const mobCurParentId = mobNavStack.length ? String(mobNavStack[mobNavStack.length - 1]) : rootId;
        const mobCurPlace = mobCurParentId ? placeById.get(String(mobCurParentId)) : null;
        const mobCurTitle = mobCurPlace ? mobCurPlace.name : (rootPlace ? rootPlace.name : (ui.forumTitle || 'Forum'));
        const qMob = String(this._forumPlaceFilterQ || '').trim().toLowerCase();
        const mobNameMatches = (p) => {
            if (!qMob) return true;
            const n = String(p.name || '').toLowerCase();
            return n.includes(qMob);
        };
        const mobChildren = (places || []).filter((p) => !p.isGeneral && String(p.parentId != null ? p.parentId : '') === String(mobCurParentId != null ? mobCurParentId : '')).filter(mobNameMatches);
        const mobGeneralRow = !qMob && mobNavStack.length === 0
            ? [{
                id: null,
                isGeneral: true,
                name: ui.forumGeneralPlace || 'General',
                icon: '💬',
                hasChildren: false
            }]
            : [];
        const mobLevelRows = [...mobGeneralRow, ...mobChildren];
        const mobLevelListHtml = mobLevelRows
            .map((p) => {
                const isGen = !!p.isGeneral;
                const id = isGen ? '' : String(p.id);
                const label = isGen ? (ui.forumGeneralPlace || 'General') : String(p.name || '');
                const icon = isGen ? '💬' : esc(p.icon || '📂');
                const n = threadsFor(allT, isGen ? null : id).length;
                const canDrill = !isGen && !!p.hasChildren;
                const drillAria = escAttr((ui.forumMobileNavEnter || 'Open {name}').replace('{name}', label));
                const pickAria = escAttr(`${label}, ${n} ${ui.forumTopicsCountShort || 'topics'}`);
                return `<div class="w-[calc(100%-0.5rem)] mx-auto mb-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 overflow-hidden">
                    <div class="flex items-stretch w-full min-w-0">
                        <button type="button" class="forum-mob-nav-pick flex-1 min-w-0 text-left px-3 py-3 min-h-11 flex items-start gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500" data-place-id="${escAttr(id)}" aria-label="${pickAria}">
                            <span class="shrink-0 text-lg leading-none mt-0.5 opacity-90" aria-hidden="true">${icon}</span>
                            <span class="min-w-0 flex-1">
                                <span class="block text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug truncate">${esc(label)}</span>
                                <span class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">${esc(String(n))} ${esc(ui.forumTopicsCountShort || 'topics')}</span>
                            </span>
                        </button>
                        ${
                            canDrill
                                ? `<button type="button" class="forum-mob-nav-drill shrink-0 w-14 min-h-11 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 font-black text-slate-700 dark:text-slate-200" data-place-id="${escAttr(id)}" aria-label="${drillAria}">›</button>`
                                : `<span class="shrink-0 w-14 border-l border-slate-200/0 dark:border-slate-700/0" aria-hidden="true"></span>`
                        }
                    </div>
                </div>`;
            })
            .join('');

        const deskNavStack = Array.isArray(this._forumDeskNavStack) ? this._forumDeskNavStack : [];
        const deskCurParentId = deskNavStack.length ? String(deskNavStack[deskNavStack.length - 1]) : rootId;
        const deskCurPlace = deskCurParentId ? placeById.get(String(deskCurParentId)) : null;
        const deskCurTitle = deskCurPlace ? deskCurPlace.name : (rootPlace ? rootPlace.name : (ui.forumTitle || 'Forum'));
        const qDesk = String(this._forumPlaceFilterQ || '').trim().toLowerCase();
        const deskNameMatches = (p) => {
            if (!qDesk) return true;
            const n = String(p.name || '').toLowerCase();
            return n.includes(qDesk);
        };
        const deskChildren = (places || []).filter((p) => !p.isGeneral && String(p.parentId != null ? p.parentId : '') === String(deskCurParentId != null ? deskCurParentId : '')).filter(deskNameMatches);
        const deskGeneralRow = !qDesk && deskNavStack.length === 0
            ? [{
                id: null,
                isGeneral: true,
                name: ui.forumGeneralPlace || 'General',
                icon: '💬',
                hasChildren: false
            }]
            : [];
        const deskLevelRows = [...deskGeneralRow, ...deskChildren];
        const deskLevelListHtml = deskLevelRows
            .map((p) => {
                const isGen = !!p.isGeneral;
                const id = isGen ? '' : String(p.id);
                const label = isGen ? (ui.forumGeneralPlace || 'General') : String(p.name || '');
                const icon = isGen ? '💬' : esc(p.icon || '📂');
                const n = threadsFor(allT, isGen ? null : id).length;
                const canDrill = !isGen && !!p.hasChildren;
                const drillAria = escAttr((ui.forumMobileNavEnter || 'Open {name}').replace('{name}', label));
                const pickAria = escAttr(`${label}, ${n} ${ui.forumTopicsCountShort || 'topics'}`);
                return `<div class="w-[calc(100%-0.75rem)] mx-auto mb-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 overflow-hidden">
                    <div class="flex items-stretch w-full min-w-0">
                        <button type="button" class="forum-desk-nav-pick flex-1 min-w-0 text-left px-3 py-2.5 min-h-11 flex items-start gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500" data-place-id="${escAttr(id)}" aria-label="${pickAria}">
                            <span class="shrink-0 text-lg leading-none mt-0.5 opacity-90" aria-hidden="true">${icon}</span>
                            <span class="min-w-0 flex-1">
                                <span class="block text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">${esc(label)}</span>
                                <span class="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">${esc(String(n))} ${esc(ui.forumTopicsCountShort || 'topics')}</span>
                            </span>
                        </button>
                        ${
                            canDrill
                                ? `<button type="button" class="forum-desk-nav-drill shrink-0 w-12 min-h-11 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 font-black text-slate-800 dark:text-slate-100 text-lg" data-place-id="${escAttr(id)}" aria-label="${drillAria}" title="${drillAria}">›</button>`
                                : `<span class="shrink-0 w-12 border-l border-slate-200/0 dark:border-slate-700/0" aria-hidden="true"></span>`
                        }
                    </div>
                </div>`;
            })
            .join('');

        const mobNavDrawerHtml = this._forumMobNavOpen
            ? `<div class="forum-mob-nav-backdrop lg:hidden fixed inset-0 z-[90] bg-slate-950/50 backdrop-blur-[2px]" role="presentation">
                    <div class="forum-mob-nav-panel absolute left-0 top-0 bottom-0 w-[min(22rem,86vw)] max-w-[86vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shadow-[16px_0_80px_-20px_rgba(0,0,0,0.45)] flex flex-col min-h-0">
                        <div class="shrink-0 px-3 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                            <div class="min-w-0 flex items-center gap-2">
                                ${
                                    mobNavStack.length
                                        ? `<button type="button" class="forum-mob-nav-back w-10 h-10 min-h-10 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold leading-none hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="${escAttr(mobNavBackLabel)}">←</button>`
                                        : ''
                                }
                                <div class="min-w-0">
                                    <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">${mobNavTitle}</p>
                                    <p class="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight truncate" title="${escAttr(mobCurTitle)}">${esc(mobCurTitle)}</p>
                                </div>
                            </div>
                            <button type="button" class="forum-mob-nav-close w-10 h-10 min-h-10 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold leading-none hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="${mobNavCloseAria}">×</button>
                        </div>
                        <div class="shrink-0 px-3 py-2.5 border-b border-slate-200 dark:border-slate-700">
                            ${structureHintHtml}
                            <label class="sr-only" for="forum-place-filter-mob">${fqLabel}</label>
                            <input id="forum-place-filter-mob" type="search" enterkeyhint="search" autocomplete="off" value="${fqVal}" placeholder="${fqPh}" class="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm px-2.5 py-2 font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-300/80 dark:focus:ring-slate-600 min-h-11" />
                        </div>
                        <div class="forum-mob-places-scroll flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar px-1 py-2" role="navigation" aria-label="${escAttr(ui.forumPlaceSelectAria || ui.forumPlacesHeading || 'Course areas')}">
                            ${mobLevelListHtml || `<div class="p-4 text-xs text-slate-600 dark:text-slate-300">${esc(ui.forumNoSearchResults || 'No matches found')}</div>`}
                        </div>
                    </div>
               </div>`
            : '';

        this.innerHTML = `${shell}
            <div class="forum-head shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div class="arborito-float-modal-head arborito-dock-modal-hero relative flex flex-wrap items-center justify-between gap-x-2 gap-y-2 px-3 py-3 md:px-5 md:py-3.5">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                        ${stackBackHtml}
                        <span class="text-2xl shrink-0 leading-none hidden sm:block" aria-hidden="true">💬</span>
                        <div class="min-w-0 flex-1">
                            <h2 id="forum-modal-title" class="arborito-mmenu-subtitle m-0 text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate min-w-0">${heroHeadingInner}</h2>
                            ${heroSubtitleHtml}
                            ${modBadge}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button type="button" class="forum-new-thread min-h-11 px-4 py-2 rounded-xl text-xs font-bold tracking-wide bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white shadow-sm shadow-emerald-900/15 transition-all" aria-label="${escAttr(ui.forumNewTopicAria || ui.forumNewThread || 'New topic')}">${esc(ui.forumNewTopic || '+ Topic')}</button>
                        ${embedded ? '' : modalWindowCloseXHtml(ui, 'btn-close', { showOnMobile: false })}
                    </div>
                </div>
            </div>
            ${forumLimitNote}
            <div class="forum-mob-zone-root lg:hidden shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <div class="px-3 py-2.5 flex items-center justify-between gap-2">
                    <button type="button" class="forum-mob-nav-open min-h-11 w-11 px-0 py-0 rounded-xl text-sm font-black tracking-wide border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0" aria-label="${escAttr(mobNavOpenLabel)}"><span aria-hidden="true">☰</span></button>
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">${mobNavTitle}</p>
                        <p class="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight truncate" title="${escAttr(pLabel)}">${esc(pLabel)}</p>
                    </div>
                </div>
            </div>
            ${mobNavDrawerHtml}

            <div class="forum-master-detail-root flex-1 flex flex-col lg:flex-row min-h-0 bg-slate-100 dark:bg-slate-950 forum-body-canvas">

                <aside class="forum-aside forum-aside--categories forum-master-nav hidden lg:flex lg:w-[13rem] xl:w-[14rem] shrink-0 flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 min-h-0">
                    <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
                        <p class="text-xs font-bold tracking-wide text-slate-600 dark:text-slate-300">${esc(ui.forumPlacesHeading || 'Categories')}</p>
                        ${structureHintHtml}
                        ${placeFilterDeskHtml}
                    </div>
                    <div class="shrink-0 px-4 py-2 border-b border-slate-200 dark:border-slate-700 ${deskNavStack.length ? '' : 'hidden'}">
                        <button type="button" class="forum-desk-nav-back min-h-10 px-3 py-2 rounded-xl text-xs font-bold tracking-wide border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 w-full text-left" aria-label="${escAttr(mobNavBackLabel)}">← ${esc(mobNavBackLabel)} <span class="text-slate-500 dark:text-slate-400 font-semibold">·</span> <span class="font-black">${esc(deskCurTitle)}</span></button>
                    </div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar min-h-0 py-2">
                        ${deskLevelListHtml || `<div class="p-4 text-xs text-slate-600 dark:text-slate-300">${esc(ui.forumNoSearchResults || 'No matches found')}</div>`}
                    </div>
                </aside>

                <aside class="forum-aside forum-aside--threads forum-master-topics w-full min-h-0 flex-1 flex-col border-r-0 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 lg:flex-none lg:shrink-0 lg:w-[min(22rem,34vw)] lg:min-w-[17rem] xl:w-[23rem] lg:min-h-0 lg:border-r lg:border-l lg:border-l-slate-200/80 dark:lg:border-l-slate-700/80 ${this._mobilePanel === 'posts' ? 'hidden lg:flex' : 'flex'}">
                    <div class="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 shrink-0 sticky top-0 z-30 bg-white dark:bg-slate-900 lg:static lg:z-auto">
                        ${threadColumnHeadHtml}
                        ${searchBoxHtml}
                    </div>
                    <div id="forum-threads-scroll" class="flex-1 overflow-y-auto custom-scrollbar min-h-0 p-2 bg-slate-50 dark:bg-slate-950">
                        ${
                            this._searchQ && isPublicForumTree
                                ? this._renderSearchResults(ui, lang)
                                : here.length
                                    ? `<div class="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">${this.renderThreads(here, allM, ui, mod, lang)}</div>`
                                    : threadsListEmptyHtml
                        }
                    </div>
                </aside>

                <section class="forum-thread-view forum-master-content flex-1 flex flex-col min-h-0 min-w-0 bg-slate-50 dark:bg-slate-950 ${this._mobilePanel === 'threads' ? 'hidden lg:flex' : 'flex'}">
                    <div class="shrink-0 px-4 py-3 md:px-5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-30 lg:static lg:z-auto">
                        ${threadHeadHtml}
                    </div>
                    <div id="forum-posts-scroll" class="flex-1 overflow-y-auto custom-scrollbar min-h-0 p-3 md:p-4 space-y-3 forum-posts-feed bg-slate-50 dark:bg-slate-950" tabindex="-1" role="region" aria-label="${escAttr(this._threadId ? (ui.forumPostsRegionAria || 'Forum messages') : (ui.forumPickThreadRegionAria || ui.forumPickThread || 'Choose a topic'))}">
                        ${this._threadId ? this.renderPosts(msgs, ui, mod, lang) : pickTopicEmptyHtml}
                    </div>
                    ${
                        isPublicForumTree && this._threadId
                            ? `<div class="shrink-0 px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
                                <span class="text-xs text-slate-500 dark:text-slate-400">${esc(ui.forumWeeksLoadedLabel || 'Loaded pages')}: ${esc(String(store.getLoadedForumThreadWeeks(this._threadId).sort().join(', ') || '—'))}</span>
                                <button type="button" class="forum-load-older min-h-10 px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100">${esc(ui.forumLoadOlderWeek || 'Load older')}</button>
                              </div>`
                            : ''
                    }
                    ${publicForumFooter}
                    ${composePanelHtml}
                </section>
            </div>
            ${this._newTopicOpen ? this.renderNewTopicOverlay(ui, pLabel) : ''}
        ${shellEnd}`;

        // --- Bind events ---
        this.querySelectorAll('.btn-close').forEach((b) => { b.onclick = () => this.close(); });

        this.querySelector('.forum-mob-nav-open')?.addEventListener('click', () => {
            this._forumMobNavOpen = true;
            this.render();
        });
        const mobBd = this.querySelector('.forum-mob-nav-backdrop');
        if (mobBd) {
            mobBd.addEventListener('click', (e) => {
                if (e.target === mobBd) {
                    this._forumMobNavOpen = false;
                    this.render();
                }
            });
        }
        this.querySelector('.forum-mob-nav-close')?.addEventListener('click', () => {
            this._forumMobNavOpen = false;
            this.render();
        });
        this.querySelector('.forum-mob-nav-back')?.addEventListener('click', () => {
            if (!Array.isArray(this._forumMobNavStack) || !this._forumMobNavStack.length) return;
            this._forumMobNavStack.pop();
            this.render();
        });
        this.querySelector('.forum-desk-nav-back')?.addEventListener('click', () => {
            if (!Array.isArray(this._forumDeskNavStack) || !this._forumDeskNavStack.length) return;
            this._forumDeskNavStack.pop();
            this.render();
        });

        this.querySelectorAll('.forum-mob-nav-drill').forEach((b) => {
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const v = b.dataset.placeId;
                const sid = (v === '' || v == null) ? null : String(v);
                if (!sid) return;
                if (!Array.isArray(this._forumMobNavStack)) this._forumMobNavStack = [];
                this._forumMobNavStack.push(sid);
                this.render();
            });
        });
        this.querySelectorAll('.forum-mob-nav-pick').forEach((b) => {
            b.addEventListener('click', () => {
                const v = b.dataset.placeId;
                this._placeId = (v === '' || v == null) ? null : v;
                this._justCreatedThreadId = null;
                this._threadId = null;
                this._replyParentId = null;
                this._mobilePanel = 'threads';
                this._forumMobNavOpen = false;
                this._scrollPostsToEnd = true;
                this.render();
            });
        });

        this.querySelectorAll('.forum-desk-nav-drill').forEach((b) => {
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const v = b.dataset.placeId;
                const sid = (v === '' || v == null) ? null : String(v);
                if (!sid) return;
                if (!Array.isArray(this._forumDeskNavStack)) this._forumDeskNavStack = [];
                this._forumDeskNavStack.push(sid);
                this.render();
            });
        });
        this.querySelectorAll('.forum-desk-nav-pick').forEach((b) => {
            b.addEventListener('click', () => {
                const prevPlaceId = this._placeId;
                const v = b.dataset.placeId;
                this._placeId = (v === '' || v == null) ? null : v;
                const placeChanged = String(this._placeId != null ? this._placeId : '') !== String(prevPlaceId != null ? prevPlaceId : '');
                this._justCreatedThreadId = null;
                this._threadId = null;
                this._replyParentId = null;
                this._mobilePanel = 'threads';
                if (placeChanged) this._forumScrollThreadsTop = true;
                this._scrollPostsToEnd = true;
                this.render();
            });
        });

        this.querySelectorAll('.forum-place').forEach((b) => {
            b.onclick = () => {
                const prevPlaceId = this._placeId;
                const v = b.dataset.placeId;
                this._placeId = (v === '' || v == null) ? null : v;
                const placeChanged = String(this._placeId != null ? this._placeId : '') !== String(prevPlaceId != null ? prevPlaceId : '');
                this._justCreatedThreadId = null;
                this._threadId = null;
                this._replyParentId = null;
                this._mobilePanel = 'threads';
                this._forumMobNavOpen = false;
                if (placeChanged) this._forumScrollThreadsTop = true;
                this._scrollPostsToEnd = true;
                this.render();
            };
        });

        const bindForumPlaceFilter = (id) => {
            const el = this.querySelector(`#${id}`);
            if (!el) return;
            el.oninput = () => {
                const start = el.selectionStart;
                const end = el.selectionEnd;
                this._forumPlaceFilterQ = el.value;
                this.render();
                const otherId = id === 'forum-place-filter-desk' ? 'forum-place-filter-mob' : 'forum-place-filter-desk';
                requestAnimationFrame(() => {
                    const twin = this.querySelector(`#${otherId}`);
                    if (twin) twin.value = this._forumPlaceFilterQ;
                    const next = this.querySelector(`#${id}`);
                    if (next) {
                        next.focus();
                        try {
                            if (typeof start === 'number' && typeof end === 'number') next.setSelectionRange(start, end);
                        } catch (_) { /* noop */ }
                    }
                });
            };
        };
        bindForumPlaceFilter('forum-place-filter-desk');
        bindForumPlaceFilter('forum-place-filter-mob');

        this.querySelectorAll('.forum-thread').forEach((b) => {
            b.onclick = () => {
                const id = b.dataset.id;
                if (id !== this._justCreatedThreadId) this._justCreatedThreadId = null;
                this._threadId = id;
                this._searchQ = '';
                this._searchResults = [];
                this._replyParentId = null;
                this._mobilePanel = 'posts';
                this._scrollPostsToEnd = true;
                this.render();
            };
        });

        const searchInp = this.querySelector('#forum-search');
        if (searchInp) {
            searchInp.oninput = () => {
                this._searchQ = searchInp.value || '';
                this._scheduleSearch();
                this.render();
            };
        }

        this.querySelectorAll('.forum-search-hit').forEach((b) => {
            b.onclick = async () => {
                const tid = b.dataset.tid;
                const wk = b.dataset.wk;
                const pid = b.dataset.pid;
                this._placeId = pid ? pid : null;
                this._threadId = tid;
                this._mobilePanel = 'posts';
                this._searchQ = '';
                this._searchResults = [];
                this.render();
                await store.ensureTreeForumPlaceLoaded(this._placeId);
                if (tid && wk) await store.ensureTreeForumThreadWeekLoaded(tid, wk);
                this.render();
            };
        });

        this.querySelector('.forum-load-older')?.addEventListener('click', async () => {
            if (!this._threadId) return;
            const all = await store.getTreeForumThreadWeeks(this._threadId);
            const loaded = new Set(store.getLoadedForumThreadWeeks(this._threadId));
            const next = all.find((wk) => !loaded.has(wk));
            if (!next) return;
            await store.ensureTreeForumThreadWeekLoaded(this._threadId, next);
            this.render();
        });

        this.querySelector('.forum-crumb-place')?.addEventListener('click', () => {
            if (!this._threadId) return;
            this._threadId = null;
            this._replyParentId = null;
            this._mobilePanel = 'threads';
            this._scrollPostsToEnd = true;
            this.render();
        });

        this.querySelector('.forum-stack-back')?.addEventListener('click', () => {
            if (this._mobilePanel === 'posts') {
                this._mobilePanel = 'threads';
                this.render();
                return;
            }
            if (!this.hasAttribute('embed')) this.close();
        });

        this.querySelectorAll('.forum-act').forEach((b) => {
            b.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const act = b.dataset.act;
                const id = b.dataset.id;
                if (act === 'reply-to') this.onReplyTo(id);
                else if (act === 'del-thread') await this.onModDeleteThread(id);
                else if (act === 'mod-del') await this.onModDeleteMsg(id);
                else if (act === 'self-del') await this.onSelfDeleteMsg(id);
                else if (act === 'mod-user') await this.onModRemoveUser(id);
            };
        });

        this.querySelector('.forum-cancel-reply')?.addEventListener('click', (e) => {
            e.preventDefault();
            this._replyParentId = null;
            this.render();
        });

        { const _el = this.querySelector('.forum-del-account'); if (_el) _el.addEventListener('click', () => this.onDelAccount()); }
        { const _el = this.querySelector('.forum-new-thread'); if (_el) _el.addEventListener('click', () => this.openNewTopicSheet()); }
        this.querySelectorAll('.forum-empty-first-topic').forEach((btn) => {
            btn.addEventListener('click', () => this.openNewTopicSheet());
        });
        { const _el = this.querySelector('.forum-post'); if (_el) _el.addEventListener('click', () => this.onPost()); }

        const ntScrim = this.querySelector('#forum-new-topic-scrim');
        if (ntScrim) {
            ntScrim.addEventListener('click', (e) => {
                if (e.target === ntScrim) this.cancelNewTopicSheet();
            });
        }
        { const _el = this.querySelector('#forum-new-topic-card'); if (_el) _el.addEventListener('click', (e) => e.stopPropagation()); }
        { const _el = this.querySelector('.forum-nt-cancel'); if (_el) _el.addEventListener('click', () => this.cancelNewTopicSheet()); }
        { const _el = this.querySelector('.forum-nt-dismiss'); if (_el) _el.addEventListener('click', () => this.cancelNewTopicSheet()); }
        { const _el = this.querySelector('.forum-nt-create'); if (_el) _el.addEventListener('click', () => { void this.commitNewTopic(); }); }
        const ntInp = this.querySelector('#forum-new-topic-input');
        if (ntInp) {
            ntInp.addEventListener('input', (e) => { this._newTopicTitle = e.target.value; });
            ntInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.querySelector('#forum-new-topic-body')?.focus();
                }
            });
        }
        const ntBody = this.querySelector('#forum-new-topic-body');
        if (ntBody) {
            ntBody.addEventListener('input', (e) => { this._newTopicBody = e.target.value; });
            ntBody.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void this.commitNewTopic();
                }
            });
        }

        const compose = this.querySelector('#forum-compose');
        if (compose && !compose.disabled) {
            compose.oninput = () => { this._draft = compose.value; };
            compose.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this.onPost();
                }
            });
        }

        const backdrop = this.querySelector('#modal-backdrop');
        if (backdrop) {
            backdrop.onclick = (e) => {
                if (e.target !== backdrop) return;
                if (this._newTopicOpen) this.cancelNewTopicSheet();
                else this.close();
            };
        }

        if (this._scrollPostsToEnd) {
            requestAnimationFrame(() => {
                const el = this.querySelector('#forum-posts-scroll');
                if (el) el.scrollTop = el.scrollHeight;
            });
            this._scrollPostsToEnd = false;
        }

        if (this._focusComposeNext) {
            this._focusComposeNext = false;
            requestAnimationFrame(() => {
                const panel = this.querySelector('#forum-compose-panel');
                const ta = this.querySelector('#forum-compose');
                (panel && panel.scrollIntoView)({ block: 'nearest', behavior: 'smooth' });
                (ta && ta.focus)();
            });
        }

        if (this._forumScrollThreadsTop) {
            this._forumScrollThreadsTop = false;
            requestAnimationFrame(() => {
                const el = this.querySelector('#forum-threads-scroll');
                if (el) el.scrollTop = 0;
            });
        }
    }
};
