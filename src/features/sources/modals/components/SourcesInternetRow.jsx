import { useMemo } from 'react';
import { useSources } from '../../hooks/useSources.js';
import { formatNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import { findCommunitySourceByUrl } from '../../api/modals/logic/sources-helpers.js';
import { kindEmoji, listingKind } from '../../api/sources-kind-ui.js';
import { computeDirectoryRowState } from '../../api/modals/logic/sources-directory-row-state.js';
import { SourcesPill } from './SourcesPill.jsx';
import { LanguagePills } from './LanguagePills.jsx';
import {
    SourcesMoreButton,
    SourcesShareButton,
    SourcesVoteGroup,
} from './SourcesRowChrome.jsx';
import {
    sourcesLsGet,
    sourcesVoteKey,
    sourcesVoteKeyFallback,
} from '../../api/modals/logic/sources-local-storage.js';

function readLiked(shell, ownerPub, universeId) {
    try {
        const pair = shell.getNetworkUserPair?.();
        const pub = String(pair?.pub || '').trim();
        if (pub) {
            return sourcesLsGet(sourcesVoteKey(ownerPub, universeId, pub)) === '1';
        }
        return sourcesLsGet(sourcesVoteKeyFallback(ownerPub, universeId)) === '1';
    } catch {
        return false;
    }
}

function ownerModerationBanner(ui, modState) {
    if (!modState) return null;
    if (modState.legalPendingDefense && !modState.covered) {
        if (modState.legalWithin48h) {
            return (
                ui.sourcesOwnerModerationBannerLegalWindow ||
                'Legal notice: you have about 48 hours to publish a signed owner response (⋯ menu). Until then your listing is deprioritized in Discover but stays visible.'
            );
        }
        return (
            ui.sourcesOwnerModerationBannerLegalHidden ||
            'Legal notice without owner response: your tree is hidden from Discover for others (you still see it here). Publish a signed response via ⋯ to reopen the dispute.'
        );
    }
    if (modState.isReported) {
        return (
            ui.sourcesOwnerModerationBannerHidden ||
            ui.sourcesGlobalHiddenHint ||
            'Community reports reached the threshold: hidden from Discover for others. You can contest via ⋯.'
        );
    }
    if (modState.reportScore != null && modState.threshold != null && modState.reportScore > 0) {
        const tpl =
            ui.sourcesOwnerModerationBannerCommunity ||
            'Community reports: score {score} / threshold {threshold} (14 days). Respond or fix via ⋯ before the listing is hidden.';
        return tpl
            .replace('{score}', String(modState.reportScore))
            .replace('{threshold}', String(modState.threshold));
    }
    return null;
}

export function SourcesInternetRow({
    row,
    localInfo,
    metrics,
    ui,
    actionsOpen,
    onAction,
    onToggleRowActions,
    onVote,
    onShare,
}) {
    const shell = useSources();
    const ownerPub = String(row?.ownerPub || '').trim();
    const universeId = String(row?.universeId || '').trim();
    const key = `internet:${ownerPub}/${universeId}`;
    const open = actionsOpen?.has(key);
    const rowKind = listingKind(row?.contentKind, row?.universeId);
    const kindBorder =
        rowKind === 'composed-tree'
            ? 'border-violet-200/60 dark:border-violet-900/50'
            : 'border-emerald-200/60 dark:border-emerald-900/40';
    const author = String(row?.authorName || '').trim();
    const desc = String(row?.description || '').trim();
    const votes = Number.isFinite(Number(metrics?.votes)) ? Number(metrics.votes) : null;
    const liked = readLiked(shell, ownerPub, universeId);
    const isOwner = (() => {
        try {
            return !!(ownerPub && shell.getNostrPublisherPair?.(ownerPub)?.priv);
        } catch {
            return false;
        }
    })();
    const metricsMap = useMemo(() => {
        if (!ownerPub || !universeId) return {};
        return { [`${ownerPub}/${universeId}`]: metrics || {} };
    }, [ownerPub, universeId, metrics]);
    const modState = useMemo(
        () => computeDirectoryRowState(row, metricsMap),
        [row, metricsMap]
    );
    const ownerBanner = isOwner ? ownerModerationBanner(ui, modState) : null;
    const showOwnerAppeal =
        isOwner &&
        (modState.isReported || (modState.reportScore != null && modState.reportScore > 0));
    const showOwnerLegalDefense = isOwner && modState.legalPendingDefense && !modState.covered;
    const communityEntry = (() => {
        try {
            const url = formatNostrTreeUrl(ownerPub, universeId);
            return findCommunitySourceByUrl(shell.communitySources, url);
        } catch {
            return null;
        }
    })();
    const isCommunityInstalled = !!communityEntry;
    const installLbl = ui.sourcesGlobalInstall || ui.sourcesInstall;
    const removeLbl = ui.sourcesGlobalRemove || ui.sourceRemove;
    const editOwnLbl = ui.sourcesGlobalEditOwnTree || ui.navConstruct || 'Edit';
    const primaryLbl = isOwner ? editOwnLbl : isCommunityInstalled ? removeLbl : installLbl;
    const internetLangs = Array.isArray(row?.languages) ? row.languages : [];
    const shareOpts = row?.shareCode
        ? {
              name: row?.title || '',
              url: formatNostrTreeUrl(ownerPub, universeId),
              shareCode: row.shareCode,
              ownerPub,
              universeId,
          }
        : null;

    const primaryAction = () => {
        if (isOwner) {
            onAction?.('global-open', {
                ownerPub,
                universeId,
                shareCode: row?.shareCode || '',
                editOwn: '1',
            });
        } else if (isCommunityInstalled) {
            onAction?.('remove-source', { id: communityEntry?.id });
        } else {
            onAction?.('install-source', { ownerPub, universeId });
        }
    };

    return (
        <div
            className={`p-4 bg-white dark:bg-slate-900 border ${kindBorder} rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors arborito-kind-card arborito-kind-card--${rowKind === 'composed-tree' ? 'composed' : 'branch'}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 items-center mb-1">
                        <SourcesPill
                            className={
                                rowKind === 'composed-tree'
                                    ? 'arborito-pill--violet arborito-pill--bordered'
                                    : 'arborito-pill--emerald arborito-pill--bordered'
                            }
                        >
                            {rowKind === 'composed-tree'
                                ? ui.sourcesPillComposedTree || 'Tree'
                                : ui.sourcesPillBranch || 'Branch'}
                        </SourcesPill>
                        <SourcesPill className="arborito-pill--sky arborito-pill--bordered">
                            {ui.sourcesPillInternet || 'Internet'}
                        </SourcesPill>
                        {modState.isReported && !isOwner ? (
                            <SourcesPill className="arborito-pill--rose arborito-pill--bordered">
                                {ui.sourcesGlobalReportedPill || 'Reported'}
                            </SourcesPill>
                        ) : null}
                        {modState.legalPendingDefense && !modState.covered ? (
                            <SourcesPill className="arborito-pill--amber arborito-pill--bordered">
                                {ui.sourcesGlobalDisputePill || 'Dispute'}
                            </SourcesPill>
                        ) : null}
                        {row?.shareCode ? (
                            <SourcesPill className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                #{row.shareCode}
                            </SourcesPill>
                        ) : null}
                        <LanguagePills langCodes={internetLangs} />
                    </div>
                    <button
                        type="button"
                        className="arborito-sources-row-title arborito-sources-row-title--button leading-snug line-clamp-2 hover:underline w-full text-left"
                        onClick={() =>
                            onAction?.('global-open', {
                                ownerPub,
                                universeId,
                                shareCode: row?.shareCode || '',
                                editOwn: isOwner ? '1' : undefined,
                            })
                        }
                    >
                        {kindEmoji(rowKind)} {row?.title}
                    </button>
                    {author ? (
                        <p className="m-0 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                            {ui.sourcesGlobalBy || 'by'} {author}
                        </p>
                    ) : null}
                    {desc ? (
                        <p className="m-0 mt-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-3">
                            {desc}
                        </p>
                    ) : null}
                    {ownerBanner ? (
                        <p className="m-0 mt-2 text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-xl px-3 py-2 leading-snug">
                            {ownerBanner}
                        </p>
                    ) : null}
                </div>
                <aside className="arborito-sources-row-aside">
                    <div className="arborito-sources-primary-stack">
                        <div className="arborito-sources-cta-row">
                            <button
                                type="button"
                                className={`arborito-sources-row-cta shadow-sm ${
                                    isCommunityInstalled && !isOwner
                                        ? 'arborito-cta-rose'
                                        : 'arborito-cta-emerald'
                                }`}
                                onClick={primaryAction}
                            >
                                {primaryLbl}
                            </button>
                        </div>
                    </div>
                    <div className="arborito-sources-toolbar arborito-sources-toolbar--social">
                        <SourcesVoteGroup
                            ui={ui}
                            liked={liked}
                            votes={votes}
                            ownerPub={ownerPub}
                            universeId={universeId}
                            onVote={onVote}
                        />
                        <SourcesShareButton ui={ui} shareOpts={shareOpts} onShare={onShare} />
                        <SourcesMoreButton
                            ui={ui}
                            rowKey={key}
                            open={open}
                            onToggle={onToggleRowActions}
                        />
                    </div>
                </aside>
            </div>
            {open ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        onClick={() =>
                            onAction?.('global-open', { ownerPub, universeId, shareCode: row?.shareCode || '' })
                        }
                    >
                        {ui.sourcesGlobalOpenTree || ui.sourceLoad}
                    </button>
                    {!isOwner ? (
                        <button
                            type="button"
                            className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            onClick={() => onAction?.('global-report', { ownerPub, universeId })}
                        >
                            {ui.sourcesGlobalReport || 'Report'}
                        </button>
                    ) : null}
                    {showOwnerAppeal ? (
                        <button
                            type="button"
                            className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                            onClick={() => onAction?.('global-directory-appeal', { ownerPub, universeId })}
                        >
                            {ui.sourcesOwnerDirectoryAppealButton || 'Contest community reports (owner)'}
                        </button>
                    ) : null}
                    {showOwnerLegalDefense ? (
                        <button
                            type="button"
                            className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                            onClick={() => onAction?.('global-legal-defense', { ownerPub, universeId })}
                        >
                            {ui.sourcesGlobalLegalDefenseButton || 'Respond to legal dispute (owner)'}
                        </button>
                    ) : null}
                    {localInfo?.id ? (
                        <>
                            <button
                                type="button"
                                className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                                onClick={() =>
                                    onAction?.('tree-info', {
                                        id: localInfo.id,
                                        name: localInfo.name || '',
                                    })
                                }
                            >
                                {ui.sourcesBranchInfoButton || 'Branch information'}
                            </button>
                            <button
                                type="button"
                                className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700"
                                onClick={() =>
                                    onAction?.('export-branch', {
                                        id: localInfo.id,
                                        name: localInfo.name || '',
                                    })
                                }
                            >
                                {ui.sourceExport || 'Export'}
                            </button>
                        </>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
