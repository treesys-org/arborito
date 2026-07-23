import { timeAgo, displayThreadTitle, countMsgs, lastMsgTime } from '../../api/modals/logic/forum-modal-utils.js';

export function ForumThreadRow({ thread, active, allMessages, ui, lang, mod, onSelectThread, onMessageAction }) {
    const n = countMsgs(allMessages, thread.id);
    const last = lastMsgTime(allMessages, thread.id) || thread.updatedAt || thread.createdAt;
    const countLbl =
        n === 1
            ? ui.forumReplySingular || '1 reply'
            : (ui.forumReplyPlural || '{n} replies').replace('{n}', String(n));
    const titleShown = displayThreadTitle(thread, ui);
    const ago = timeAgo(last, lang);
    const tAria = ago ? `${titleShown}, ${countLbl}, ${ago}` : `${titleShown}, ${countLbl}`;

    return (
        <div className="flex items-stretch gap-0 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
            <button
                type="button"
                className={`forum-thread flex-1 min-w-0 text-left px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 ${active ? 'bg-slate-100 dark:bg-slate-800/90 border-l-[3px] border-l-slate-800 dark:border-l-slate-200' : 'bg-white dark:bg-slate-900 border-l-[3px] border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                data-id={thread.id}
                aria-label={tAria}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelectThread(thread.id)}
            >
                <span className="font-semibold text-slate-900 dark:text-slate-50 text-sm leading-snug line-clamp-2">
                    {titleShown}
                </span>
                <span className="flex items-center gap-2 mt-1 text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    <span className="font-medium">{countLbl}</span>
                    <span className="text-slate-500 dark:text-slate-400">·</span>
                    <span className="text-slate-600 dark:text-slate-300">{timeAgo(last, lang)}</span>
                </span>
            </button>
            {mod ? (
                <button
                    type="button"
                    className="forum-act shrink-0 min-w-12 min-h-[3.25rem] flex items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800/60 text-slate-400 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 dark:hover:border-red-800"
                    data-act="del-thread"
                    data-id={thread.id}
                    title={ui.forumModDeleteThread || 'Delete'}
                    aria-label={ui.forumModDeleteThread || 'Delete topic'}
                    onClick={() => onMessageAction('del-thread', thread.id)}
                >
                    🗑
                </button>
            ) : null}
        </div>
    );
}
