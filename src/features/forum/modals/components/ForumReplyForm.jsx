import { pseudonym, snippetText } from '../../api/modals/logic/forum-modal-utils.js';

export function ForumReplyForm({
    ui,
    threadId,
    isAuthed,
    msgs,
    replyTarget,
    composeLabel,
    composePlaceholder,
    postButtonText,
    draft,
    posting,
    composeRef,
    composePanelRef,
    onCancelReply,
    onDraftChange,
    onPost,
}) {
    if (!threadId) return null;

    if (!isAuthed) {
        return (
            <div id="forum-compose-panel" className="shrink-0 border-t-2 border-slate-300 dark:border-slate-600 p-3 md:p-4 bg-slate-100 dark:bg-slate-900">
                <div className="flex flex-col items-center justify-center text-center py-6">
                    <span className="text-2xl mb-2" aria-hidden="true">
                        🔒
                    </span>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {ui.forumLoginRequiredTitle || 'Sign in to participate'}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {ui.forumLoginRequiredBody || 'Debes estar logueado para escribir en el foro.'}
                    </p>
                </div>
            </div>
        );
    }

    const replyWho = replyTarget
        ? String((replyTarget.author && replyTarget.author.name) || pseudonym(replyTarget.author && replyTarget.author.pub) || '…')
        : '';
    const replyPreview = replyTarget ? snippetText(replyTarget.body, 100) : '';

    return (
        <div
            id="forum-compose-panel"
            ref={composePanelRef}
            className="shrink-0 border-t-2 border-slate-300 dark:border-slate-600 p-3 md:p-4 bg-slate-100 dark:bg-slate-900"
        >
            {replyTarget ? (
                <div className="forum-reply-target mb-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 flex items-start justify-between gap-2">
                    <span className="min-w-0">
                        <span className="font-bold">
                            {(ui.forumReplyingToLabel || 'Replying to {name}').replace('{name}', replyWho)}
                        </span>
                        {replyPreview ? (
                            <span className="block mt-1 text-slate-500 dark:text-slate-400 line-clamp-2">{replyPreview}</span>
                        ) : null}
                    </span>
                    <button
                        type="button"
                        className="forum-cancel-reply shrink-0 min-h-8 px-2 py-1 rounded-md font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white text-[11px]"
                        aria-label={ui.forumCancelReply || 'Cancel reply'}
                        onClick={onCancelReply}
                    >
                        {ui.forumCancelReply || 'Cancel'}
                    </button>
                </div>
            ) : null}
            {composeLabel ? (
                <label htmlFor="forum-compose" className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
                    {composeLabel}
                </label>
            ) : null}
            <textarea
                id="forum-compose"
                ref={composeRef}
                rows={3}
                className="forum-compose-input arborito-input arborito-textarea min-h-[5rem] max-h-[min(40vh,15rem)] disabled:resize-none w-full"
                placeholder={composePlaceholder}
                aria-label={composePlaceholder}
                value={draft}
                disabled={posting}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        onPost();
                    }
                }}
            />
            <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2 mt-2.5">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 flex-1 min-w-[8rem] basis-0">
                    {ui.forumPostShortcutHint || 'Ctrl+Enter to send'}
                </p>
                <button
                    type="button"
                    className="forum-post min-h-11 px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-white disabled:opacity-40 disabled:pointer-events-none text-white dark:text-slate-900 shrink-0 tracking-wide ml-auto"
                    disabled={posting || !draft.trim()}
                    aria-busy={posting ? 'true' : undefined}
                    onClick={onPost}
                >
                    {postButtonText || ui.forumPost || 'Send'}
                </button>
            </div>
        </div>
    );
}
