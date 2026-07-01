import { useForum } from '../hooks/useForum.js';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { formatUserHandle, computePublicTag } from '../../../shared/lib/user-handle.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import {
    timeAgo,
    fullTime,
    displayThreadTitle,
    normalizedParentId,
} from '../api/modals/logic/forum-modal-utils.js';
import { ForumThreadRow } from './components/ForumThreadRow.jsx';
import { ForumReplyForm } from './components/ForumReplyForm.jsx';
import { NestedSheetShell } from '../../../shared/ui/NestedSheetShell.jsx';

function ForumMessageCard({ m, replyIndex, ui, mod, lang, isOpening, showReply, myPub, onAction }) {
    const ap = String((m.author && m.author.pub) || '');
    const anon = ui.forumAnonName || 'Anon';
    const nm = (m.author && m.author.name) && String(m.author.name).trim() ? String(m.author.name).trim() : '';
    const pub = String((m.author && m.author.pub) || '').trim();
    const displayName = nm ? formatUserHandle(nm, pub) : anon;
    const tag = pub ? computePublicTag(pub) : '';
    const ob = (ui.forumOpeningBadge || '').trim();

    return (
        <article
            className={`forum-msg-card${isOpening ? ' forum-msg-card--op' : ''} rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm overflow-hidden`}
        >
            <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-xl">
                    {(m.author && m.author.avatar) || '💬'}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {isOpening && ob ? (
                            <span className="arborito-pill arborito-pill--sm arborito-pill--slate">{ob}</span>
                        ) : null}
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-50">{displayName || anon}</span>
                        {tag ? (
                            <span
                                className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 select-none"
                                title={ui.forumUserTagHint || 'Public user tag'}
                            >
                                #{tag}
                            </span>
                        ) : null}
                        <time
                            className="text-xs font-medium text-slate-500 dark:text-slate-400"
                            dateTime={m.createdAt}
                            title={fullTime(m.createdAt)}
                        >
                            {timeAgo(m.createdAt, lang) || fullTime(m.createdAt)}
                        </time>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">#{replyIndex}</span>
                    </div>
                    <div className="mt-2 text-[15px] text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words leading-relaxed forum-msg-body">
                        {m.body}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3 empty:hidden">
                        {showReply ? (
                            <button
                                type="button"
                                className="forum-act text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white min-h-10 px-2 py-1.5 rounded-md"
                                data-act="reply-to"
                                data-id={m.id}
                                aria-label={ui.forumReplyToButton || 'Reply'}
                                onClick={() => onAction('reply-to', m.id)}
                            >
                                {ui.forumReplyToButton || 'Reply'}
                            </button>
                        ) : null}
                        {myPub && ap === myPub ? (
                            <button
                                type="button"
                                className="forum-act text-xs font-bold text-slate-500 hover:text-red-500 min-h-10 px-2 py-1.5 rounded-md"
                                data-act="self-del"
                                data-id={m.id}
                                aria-label={ui.forumSelfDeleteMessage || 'Delete'}
                                onClick={() => onAction('self-del', m.id)}
                            >
                                {ui.forumSelfDeleteMessage || 'Delete'}
                            </button>
                        ) : null}
                        {mod ? (
                            <button
                                type="button"
                                className="forum-act text-xs font-bold text-slate-500 hover:text-red-500 min-h-10 px-2 py-1.5 rounded-md"
                                data-act="mod-del"
                                data-id={m.id}
                                aria-label={ui.forumModDeleteMessage || 'Remove'}
                                onClick={() => onAction('mod-del', m.id)}
                            >
                                {ui.forumModDeleteMessage || 'Remove'}
                            </button>
                        ) : null}
                        {mod && ap ? (
                            <button
                                type="button"
                                className="forum-act text-xs font-bold text-amber-600 hover:text-red-500 min-h-10 px-2 py-1.5 rounded-md"
                                data-act="mod-user"
                                data-id={ap}
                                aria-label={ui.forumModBanUserButton || ui.forumModRemoveUser || 'Ban user'}
                                onClick={() => onAction('mod-user', ap)}
                            >
                                {ui.forumModBanUserButton || ui.forumModRemoveUser || 'Ban user'}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </article>
    );
}

function ForumPosts({ messages, ui, mod, lang, threadId, justCreatedThreadId, maxThreadMessages, myPub, onAction }) {
    const sortedAll = [...messages].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const maxN = Math.max(30, Math.min(800, Number(maxThreadMessages) || 220));
    const sorted = sortedAll.length > maxN ? sortedAll.slice(sortedAll.length - maxN) : sortedAll;
    const freshEmpty = !sorted.length && justCreatedThreadId === threadId;

    if (!sorted.length) {
        const emptyTitle = freshEmpty
            ? ui.forumEmptyNewTopicTitle || ui.forumEmpty
            : ui.forumEmpty || 'No messages yet.';
        const emptyBody = freshEmpty ? ui.forumEmptyNewTopicBody || ui.forumEmptyHint : ui.forumEmptyHint || '';
        return (
            <div className="arborito-empty arborito-empty--dashed mx-1 my-2">
                <div className="arborito-empty__icon" aria-hidden="true">
                    ✍️
                </div>
                <p className="arborito-empty__title text-base">{emptyTitle}</p>
                <p className="arborito-empty__body mt-2 max-w-sm">{emptyBody}</p>
                {(ui.forumEmptyPointToCompose || '').trim() ? (
                    <Callout
                        tone="slate"
                        size="sm"
                        inline
                        extraClass="mt-4"
                        body={ui.forumEmptyPointToCompose}
                    />
                ) : null}
            </div>
        );
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

    let seq = 0;
    const walk = (m, isOp) => {
        seq += 1;
        const children = byParent.get(m.id) || [];
        return (
            <div key={m.id} className="forum-msg-tree-node">
                <ForumMessageCard
                    m={m}
                    replyIndex={seq}
                    ui={ui}
                    mod={mod}
                    lang={lang}
                    isOpening={isOp}
                    showReply={!!threadId}
                    myPub={myPub}
                    onAction={onAction}
                />
                {children.length ? (
                    <div className="forum-msg-children border-l-2 border-slate-200 dark:border-slate-600 ml-2 sm:ml-4 pl-2 sm:pl-3 mt-2 space-y-2">
                        {children.map((c) => walk(c, false))}
                    </div>
                ) : null}
            </div>
        );
    };

    const roots = byParent.get('') || [];
    let body;
    if (roots.length === 0 && norm.length > 0) {
        const flat = [...norm].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        body = flat.map((m, i) => (
            <div key={m.id} className="forum-msg-tree-node">
                <ForumMessageCard
                    m={m}
                    replyIndex={i + 1}
                    ui={ui}
                    mod={mod}
                    lang={lang}
                    isOpening={i === 0}
                    showReply={!!threadId}
                    myPub={myPub}
                    onAction={onAction}
                />
            </div>
        ));
    } else {
        body = roots.map((r, i) => walk(r, i === 0));
    }

    const clipped = sortedAll.length > sorted.length;
    return (
        <>
            {clipped ? (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                    {(ui.forumThreadClipped ||
                        'Showing the most recent {n} posts in this topic. Older posts are hidden to keep the forum fast.'
                    ).replace('{n}', String(sorted.length))}
                </div>
            ) : null}
            {body}
        </>
    );
}

function ForumSearchResults({ ui, lang, searching, searchQ, searchResults, onHit }) {
    if (searching) {
        return <div className="p-4 text-xs text-slate-600 dark:text-slate-300">{ui.forumSearching || 'Searching…'}</div>;
    }
    const q = String(searchQ || '').trim();
    if (!q) return null;
    const rows = Array.isArray(searchResults) ? searchResults : [];
    if (!rows.length) {
        return (
            <div className="p-4 text-xs text-slate-600 dark:text-slate-300">
                {ui.forumNoSearchResults || 'No matches found (only pages that still exist are searchable).'}
            </div>
        );
    }
    const fmt = (iso) => timeAgo(iso, lang) || iso;
    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
            {rows.slice(0, 40).map((r) => (
                <button
                    key={`${r.threadId}-${r.weekKey}-${r.createdAt}`}
                    type="button"
                    className="forum-search-hit w-full text-left px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    data-tid={r.threadId}
                    data-wk={r.weekKey}
                    data-pid={r.placeId || ''}
                    onClick={() => onHit(r)}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{r.weekKey}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{fmt(r.createdAt)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-700 dark:text-slate-200 line-clamp-2">{r.snippet || ''}</div>
                </button>
            ))}
        </div>
    );
}

export function ForumNewTopicOverlay({
    ui,
    pLabel,
    newTopicTitle,
    newTopicBody,
    creatingTopic,
    onTitleChange,
    onBodyChange,
    onCancel,
    onCreate,
}) {
    useEffect(() => {
        const h = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            onCancel();
        };
        document.addEventListener('keydown', h, true);
        return () => document.removeEventListener('keydown', h, true);
    }, [onCancel]);

    useEffect(() => {
        const inp = document.getElementById('forum-new-topic-input');
        inp?.focus();
    }, []);

    return (
        <NestedSheetShell
            panelId="forum-new-topic-card"
            ariaLabelledBy="forum-nt-heading"
            panelSizeTier="STANDARD"
            onBackdropClick={onCancel}
            cardExtraClass="rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-600/80 bg-white dark:bg-slate-900 p-5 sm:p-7"
        >
                <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
                    <div className="min-w-0">
                        <p className="arborito-eyebrow mb-1">{ui.forumNewTopicSheetKicker || ''}</p>
                        <h3 id="forum-nt-heading" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">
                            {ui.forumNewTopicSheetTitle || ui.forumNewThread || 'New topic'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                            {(ui.forumNewTopicSheetHint || '').replace('{place}', pLabel)}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="forum-nt-dismiss arborito-icon-btn arborito-icon-btn--md"
                        aria-label={ui.close || 'Close'}
                        onClick={onCancel}
                    >
                        ×
                    </button>
                </div>
                <div className="arborito-mob-scroll-pane custom-scrollbar space-y-4 pr-1">
                    <div>
                        <label className="arborito-eyebrow block mb-2" htmlFor="forum-new-topic-input">
                            {ui.forumNewThreadPrompt || 'Title'}
                        </label>
                        <input
                            type="text"
                            id="forum-new-topic-input"
                            autoComplete="off"
                            maxLength={200}
                            value={newTopicTitle}
                            className="forum-nt-input arborito-input text-base py-3.5 font-semibold"
                            placeholder={ui.forumNewTopicPlaceholder || ui.forumNewThreadPrompt || ''}
                            onChange={(e) => onTitleChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    document.getElementById('forum-new-topic-body')?.focus();
                                }
                            }}
                        />
                    </div>
                    <div>
                        <label className="arborito-eyebrow block mb-2" htmlFor="forum-new-topic-body">
                            {ui.forumNewTopicFirstMessageLabel || 'First message'}
                        </label>
                        <textarea
                            id="forum-new-topic-body"
                            rows={5}
                            maxLength={8000}
                            value={newTopicBody}
                            className="forum-nt-body arborito-input arborito-textarea font-medium min-h-[7rem] max-h-[min(40vh,14rem)]"
                            onChange={(e) => onBodyChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    onCreate();
                                }
                            }}
                        />
                    </div>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 mt-5 shrink-0 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                        type="button"
                        className="forum-nt-cancel flex-1 min-h-12 rounded-xl font-bold text-sm border-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                        onClick={onCancel}
                    >
                        {ui.forumNewTopicCancel || ui.cancel || 'Cancel'}
                    </button>
                    <button
                        type="button"
                        className="forum-nt-create flex-1 min-h-12 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900 transition-all active:scale-[0.98] disabled:opacity-40"
                        disabled={creatingTopic}
                        aria-busy={creatingTopic ? 'true' : undefined}
                        onClick={onCreate}
                    >
                        {ui.forumNewTopicPublish || ui.forumNewTopicCreate || ui.forumPost || 'Publish'}
                    </button>
                </div>
        </NestedSheetShell>
    );
}

export function ForumThreads({
    ui,
    lang,
    mobile,
    mod,
    isAuthed,
    isPublicForumTree,
    placeId,
    threadId,
    mobilePanel,
    here,
    msgs,
    allMessages,
    pLabel,
    placeIsGeneral,
    searchQ,
    searching,
    searchResults,
    draft,
    posting,
    replyParentId,
    justCreatedThreadId,
    maxThreadMessages,
    myPub,
    newTopicOpen,
    newTopicTitle,
    newTopicBody,
    creatingTopic,
    scrollPostsToEnd,
    scrollThreadsTop,
    focusComposeNext,
    onPostsScrolled,
    onThreadsScrolled,
    onComposeFocused,
    onSearchChange,
    onSelectThread,
    onSearchHit,
    onLoadOlder,
    onBackToTopics,
    onOpenNewTopic,
    onPost,
    onDraftChange,
    onCancelReply,
    onMessageAction,
    onDeleteAccount,
    onNewTopicTitleChange,
    onNewTopicBodyChange,
    onCancelNewTopic,
    onCreateNewTopic,
}) {
    const { forumActions } = useForum();
    const { getLoadedForumThreadWeeks } = forumActions;
    const postsScrollRef = useRef(null);
    const threadsScrollRef = useRef(null);
    const composeRef = useRef(null);
    const composePanelRef = useRef(null);

    const activeT = threadId ? here.find((t) => t.id === threadId) || null : null;
    const tTitle = activeT ? displayThreadTitle(activeT, ui) : ui.forumPickThread || 'Select a topic';
    const replyTarget = replyParentId ? msgs.find((m) => m.id === replyParentId) : null;

    const composeLabel = threadId
        ? replyTarget
            ? ui.forumComposeInlineReplyLabel || ui.forumComposeReplyLabel || 'Your reply'
            : msgs.length === 0
              ? ui.forumComposeFirstPostLabel || 'First post in this topic'
              : ui.forumComposeThreadReplyLabel || ui.forumComposeReplyLabel || ui.forumReplyLabel || 'Reply'
        : '';
    const composePlaceholder = threadId
        ? replyTarget || msgs.length > 0
            ? ui.forumPlaceholderReply || ui.forumPlaceholder || ''
            : ui.forumPlaceholderFirstPost || ui.forumPlaceholder || ''
        : ui.forumReplyDisabled || '';
    const postButtonText = threadId
        ? msgs.length === 0 && !replyTarget
            ? ui.forumPostFirstButton || ui.forumPostReply || 'Post message'
            : ui.forumPostReply || 'Send reply'
        : '';

    useLayoutEffect(() => {
        if (!scrollPostsToEnd) return;
        const el = postsScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        onPostsScrolled?.();
    }, [scrollPostsToEnd, msgs, onPostsScrolled]);

    useLayoutEffect(() => {
        if (!scrollThreadsTop) return;
        const el = threadsScrollRef.current;
        if (el) el.scrollTop = 0;
        onThreadsScrolled?.();
    }, [scrollThreadsTop, placeId, onThreadsScrolled]);

    useLayoutEffect(() => {
        if (!focusComposeNext) return;
        composePanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        composeRef.current?.focus();
        onComposeFocused?.();
    }, [focusComposeNext, onComposeFocused]);

    const threadColumnHead = placeIsGeneral ? (
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ui.forumThreadsColumnTitle || 'Threads'}</p>
    ) : (
        <>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ui.forumThreadsColumnTitle || 'Threads'}</p>
            <p className="hidden lg:block text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate" title={pLabel}>
                {pLabel}
            </p>
        </>
    );

    const threadsListEmpty =
        !(searchQ && isPublicForumTree) && !here.length ? (
            <div className="forum-threads-empty-host flex flex-col flex-1 min-h-0 w-full py-3 lg:justify-center lg:py-0">
                <div className="arborito-empty arborito-empty--dashed mx-1 shrink-0">
                    <div className="arborito-empty__icon opacity-35 grayscale" aria-hidden="true">
                        💬
                    </div>
                    <p className="arborito-empty__title max-w-[17rem]">{ui.forumNoThreadsInPlace || 'No topics yet.'}</p>
                    {(ui.forumEmptyThreadsSubtitle || '').trim() && !mobile ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-[19rem] leading-relaxed">
                            {ui.forumEmptyThreadsSubtitle}
                        </p>
                    ) : null}
                    <button
                        type="button"
                        className="forum-empty-first-topic arborito-cta-emerald mt-5 min-h-11 px-6 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-emerald-900/15"
                        onClick={onOpenNewTopic}
                    >
                        {ui.forumCreateFirstTopicCta || ui.forumNewTopic || '+ Topic'}
                    </button>
                </div>
            </div>
        ) : null;

    const pickTopicEmpty = !threadId ? (
        <div className="flex flex-col flex-1 min-h-[min(48dvh,14rem)] lg:min-h-0 justify-center">
            <div className="lg:hidden arborito-empty arborito-empty--dashed mx-2 my-4 p-8 text-sm font-medium">
                {ui.forumPickThreadBody || ui.forumPickThread || 'Select a topic from the list.'}
            </div>
            <div className="hidden lg:flex flex-1 arborito-empty arborito-empty--card px-6 py-8">
                <div className="arborito-empty__icon opacity-25" aria-hidden="true">
                    🗂️
                </div>
                <p className="arborito-empty__title text-base max-w-md">{ui.forumMasterSelectSectionHint || ''}</p>
                <p className="arborito-empty__body mt-3 max-w-md">{ui.forumMasterSelectTopicHint || ''}</p>
            </div>
        </div>
    ) : null;

    const threadHead = !threadId ? (
        <>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{pLabel}</p>
            <h3 className="text-base md:text-lg font-semibold text-slate-900 dark:text-white leading-snug mt-1">
                {ui.forumPickThreadHeading || ui.forumPickThread || 'Choose a topic'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed max-w-prose">{ui.forumPickThreadLead || ''}</p>
        </>
    ) : (
        <>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                <button
                    type="button"
                    className="forum-crumb-place inline align-baseline rounded-md px-1.5 py-0.5 -mx-0.5 text-left text-slate-800 dark:text-slate-200 bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300/90 dark:hover:bg-slate-600/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 cursor-pointer transition-colors"
                    aria-label={ui.forumAriaBackToList || ui.forumBackToTopicsAria || 'Back to topic list'}
                    onClick={onBackToTopics}
                >
                    {pLabel}
                </button>
                <span className="mx-1 text-slate-400">/</span>
                <span>{ui.forumThreadLabel || 'Thread'}</span>
            </p>
            <h3 className="text-base md:text-lg font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 mt-1">
                {tTitle}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {(ui.forumInTopic || '{n} messages').replace('{n}', String(msgs.length))}
            </p>
            {msgs.length === 0 && (ui.forumThreadNoMessagesHint || '').trim() ? (
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-2">{ui.forumThreadNoMessagesHint}</p>
            ) : null}
        </>
    );

    return (
        <>
            <aside
                className={`forum-aside forum-aside--threads forum-master-topics w-full min-h-0 flex-1 flex-col border-r-0 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 lg:flex-none lg:shrink-0 lg:w-[min(22rem,34vw)] lg:min-w-[17rem] xl:w-[23rem] lg:min-h-0 lg:border-r lg:border-l lg:border-l-slate-200/80 dark:lg:border-l-slate-700/80 ${mobilePanel === 'posts' ? 'hidden lg:flex' : 'flex'}`}
            >
                <div className="forum-threads-head shrink-0 w-full border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-30 lg:static lg:z-auto py-2.5 lg:py-2.5 px-2">
                    {threadColumnHead}
                    {isPublicForumTree ? (
                        <div className="mt-2">
                            <input
                                id="forum-search"
                                type="search"
                                value={searchQ}
                                placeholder={ui.forumSearchPlaceholder || 'Search forum (best effort)…'}
                                className="arborito-input arborito-input--compact rounded-lg font-semibold w-full"
                                onChange={(e) => onSearchChange(e.target.value)}
                            />
                        </div>
                    ) : null}
                </div>
                <div
                    id="forum-threads-scroll"
                    ref={threadsScrollRef}
                    className="flex-1 overflow-y-auto custom-scrollbar min-h-0 p-2 bg-slate-50 dark:bg-slate-950 flex flex-col"
                >
                    {searchQ && isPublicForumTree ? (
                        <ForumSearchResults
                            ui={ui}
                            lang={lang}
                            searching={searching}
                            searchQ={searchQ}
                            searchResults={searchResults}
                            onHit={onSearchHit}
                        />
                    ) : here.length ? (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                            {here.map((t) => (
                                <ForumThreadRow
                                    key={t.id}
                                    thread={t}
                                    active={t.id === threadId}
                                    allMessages={allMessages}
                                    ui={ui}
                                    lang={lang}
                                    mod={mod}
                                    onSelectThread={onSelectThread}
                                    onMessageAction={onMessageAction}
                                />
                            ))}
                        </div>
                    ) : (
                        threadsListEmpty
                    )}
                </div>
            </aside>

            <section
                className={`forum-thread-view forum-master-content flex-1 flex flex-col min-h-0 min-w-0 bg-slate-50 dark:bg-slate-950 ${mobilePanel === 'threads' ? 'hidden lg:flex' : 'flex'}`}
            >
                <div
                    className={`shrink-0 px-4 py-3 md:px-5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-30 lg:static lg:z-auto ${threadId ? 'hidden lg:block' : ''}`}
                >
                    {threadHead}
                </div>
                <div
                    id="forum-posts-scroll"
                    ref={postsScrollRef}
                    className="flex-1 overflow-y-auto custom-scrollbar min-h-0 p-3 md:p-4 space-y-3 forum-posts-feed bg-slate-50 dark:bg-slate-950"
                    tabIndex={-1}
                    role="region"
                    aria-label={
                        threadId
                            ? ui.forumPostsRegionAria || 'Forum messages'
                            : ui.forumPickThreadRegionAria || ui.forumPickThread || 'Choose a topic'
                    }
                >
                    {threadId ? (
                        <ForumPosts
                            messages={msgs}
                            ui={ui}
                            mod={mod}
                            lang={lang}
                            threadId={threadId}
                            justCreatedThreadId={justCreatedThreadId}
                            maxThreadMessages={maxThreadMessages}
                            myPub={myPub}
                            onAction={onMessageAction}
                        />
                    ) : (
                        pickTopicEmpty
                    )}
                </div>
                {isPublicForumTree && threadId ? (
                    <div className="shrink-0 px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {ui.forumWeeksLoadedLabel || 'Loaded pages'}:{' '}
                            {getLoadedForumThreadWeeks(threadId).sort().join(', ') || '—'}
                        </span>
                        <button
                            type="button"
                            className="forum-load-older min-h-10 px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                            onClick={onLoadOlder}
                        >
                            {ui.forumLoadOlderWeek || 'Load older'}
                        </button>
                    </div>
                ) : null}
                {isPublicForumTree ? (
                    <div className="shrink-0 px-3 py-2 border-t border-slate-200 dark:border-slate-700">
                        <details className="forum-account-details group rounded-xl border border-amber-200/90 dark:border-amber-800/80 bg-white/60 dark:bg-slate-900/40 px-3 py-2">
                            <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-xs font-bold text-amber-950 dark:text-amber-100 select-none [&::-webkit-details-marker]:hidden">
                                <span>{ui.forumAccountDangerSummary || 'Account options'}</span>
                                <span className="text-amber-600 dark:text-amber-400 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">
                                    ▼
                                </span>
                            </summary>
                            <p className="text-[11px] text-amber-900/90 dark:text-amber-200/90 mt-2 mb-2 leading-relaxed">
                                {ui.forumAccountDangerHint || ''}
                            </p>
                            <button
                                type="button"
                                className="forum-del-account w-full min-h-11 px-3 py-2 rounded-lg text-xs font-bold border-2 border-amber-600 dark:border-amber-600 text-amber-950 dark:text-amber-50 hover:bg-amber-100 dark:hover:bg-amber-950/80"
                                onClick={onDeleteAccount}
                            >
                                {ui.forumDeleteMyAccountButton || 'Remove my online identity'}
                            </button>
                        </details>
                    </div>
                ) : null}
                {threadId ? (
                    <ForumReplyForm
                        ui={ui}
                        threadId={threadId}
                        isAuthed={isAuthed}
                        msgs={msgs}
                        replyTarget={replyTarget}
                        composeLabel={composeLabel}
                        composePlaceholder={composePlaceholder}
                        postButtonText={postButtonText}
                        draft={draft}
                        posting={posting}
                        composeRef={composeRef}
                        composePanelRef={composePanelRef}
                        onCancelReply={onCancelReply}
                        onDraftChange={onDraftChange}
                        onPost={onPost}
                    />
                ) : null}
            </section>

            {newTopicOpen ? (
                <ForumNewTopicOverlay
                    ui={ui}
                    pLabel={pLabel}
                    newTopicTitle={newTopicTitle}
                    newTopicBody={newTopicBody}
                    creatingTopic={creatingTopic}
                    onTitleChange={onNewTopicTitleChange}
                    onBodyChange={onNewTopicBodyChange}
                    onCancel={onCancelNewTopic}
                    onCreate={onCreateNewTopic}
                />
            ) : null}
        </>
    );
}
