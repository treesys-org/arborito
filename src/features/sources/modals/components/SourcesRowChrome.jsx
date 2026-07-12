export function SourcesVoteLikeIcon({ liked }) {
    if (liked) {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="block">
                <path
                    fill="currentColor"
                    d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"
                />
            </svg>
        );
    }
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="block">
            <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"
            />
        </svg>
    );
}

export function SourcesVoteGroup({ ui, liked, votes, ownerPub, universeId, onVote }) {
    const voteLbl = ui.sourcesGlobalVoteUp || ui.sourcesGlobalVote;
    const countAria = ui.sourcesGlobalVote || ui.sourcesGlobalVoteUp;
    return (
        <div className="arborito-sources-vote-group" role="group" aria-label={voteLbl}>
            <button
                type="button"
                className={`arborito-sources-vote-group__btn${liked ? ' is-liked' : ''}`}
                aria-label={voteLbl}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onVote?.({ ownerPub, universeId, vote: 'up' });
                }}
            >
                <SourcesVoteLikeIcon liked={liked} />
            </button>
            <span className="arborito-sources-vote-group__count" aria-label={countAria}>
                {String(votes == null ? 0 : Math.max(0, votes))}
            </span>
        </div>
    );
}

export function SourcesShareButton({ ui, shareOpts, onShare }) {
    if (!shareOpts) return null;
    const aria = ui.sourcesShareButton || 'Share tree';
    return (
        <button
            type="button"
            className="arborito-sources-icon-btn"
            aria-label={aria}
            title={aria}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onShare?.(shareOpts);
            }}
        >
            <span aria-hidden="true">🔗</span>
        </button>
    );
}

export function SourcesMoreButton({ ui, rowKey, open, onToggle }) {
    return (
        <button
            type="button"
            className="arborito-sources-icon-btn text-sm font-black"
            aria-expanded={open ? 'true' : 'false'}
            aria-label={ui.navMore || ui.more || 'More'}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle?.(rowKey);
            }}
        >
            ⋯
        </button>
    );
}
