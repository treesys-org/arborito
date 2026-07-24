import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
    clearVoteUiOverrideIfMatched,
    getVoteUiOverride,
    subscribeVoteUi,
    toggleVoteUiOverride,
} from '../../api/modals/logic/sources-vote-ui.js';
import {
    mergeDisplayedVotes,
    pinVoteCountAfterToggle,
} from '../../api/modals/logic/sources-vote-persist.js';

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

/**
 * Like control — in-memory override + persisted vote floor so close/reopen
 * cannot drop the count while relays still lag.
 */
export function SourcesVoteGroup({ ui, liked, votes, ownerPub, universeId, onVote }) {
    const voteLbl = ui.sourcesGlobalVoteUp || ui.sourcesGlobalVote;
    const countAria = ui.sourcesGlobalVote || ui.sourcesGlobalVoteUp;
    const propLiked = !!liked;
    const mergedVotes = mergeDisplayedVotes(ownerPub, universeId, votes, propLiked);
    const propVotes = mergedVotes == null ? 0 : Math.max(0, Number(mergedVotes) || 0);
    const rowKey = `${String(ownerPub || '').trim()}/${String(universeId || '').trim()}`;

    const subscribe = useCallback(
        (onStoreChange) =>
            subscribeVoteUi((key) => {
                if (!key || key === rowKey) onStoreChange();
            }),
        [rowKey]
    );
    const getSnapshot = useCallback(() => {
        const o = getVoteUiOverride(ownerPub, universeId);
        if (!o) return `${propLiked ? 1 : 0}:${propVotes}`;
        return `o:${o.liked ? 1 : 0}:${o.votes}`;
    }, [ownerPub, universeId, propLiked, propVotes]);

    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        clearVoteUiOverrideIfMatched(ownerPub, universeId, propLiked, propVotes);
    }, [ownerPub, universeId, propLiked, propVotes]);

    const live = getVoteUiOverride(ownerPub, universeId);
    const showLiked = live ? live.liked : propLiked;
    const showVotes = live ? live.votes : propVotes;

    return (
        <div className="arborito-sources-vote-group" role="group" aria-label={voteLbl}>
            <button
                type="button"
                className={`arborito-sources-vote-group__btn${showLiked ? ' is-liked' : ''}`}
                aria-label={voteLbl}
                aria-pressed={showLiked ? 'true' : 'false'}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const next = toggleVoteUiOverride(ownerPub, universeId, propLiked, propVotes);
                    pinVoteCountAfterToggle(ownerPub, universeId, next.votes);
                    try {
                        onVote?.({
                            ownerPub,
                            universeId,
                            vote: 'up',
                            liked: next.liked,
                            votes: next.votes,
                        });
                    } catch (err) {
                        console.warn('onVote', err);
                    }
                }}
            >
                <SourcesVoteLikeIcon liked={showLiked} />
            </button>
            <span className="arborito-sources-vote-group__count" aria-label={countAria}>
                {String(showVotes)}
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
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="block">
                <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3v11M8.5 6.5 12 3l3.5 3.5M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"
                />
            </svg>
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
