import { useEffect } from 'react';
import { isBundledArboritoDemoBranch } from '../../../../core/demo/arborito-demo-ids.js';
import { metricsForPublishedUrl } from '../../api/modals/logic/sources-directory-fetch.js';
import { SourcesPill } from './SourcesPill.jsx';
import { LanguagePills } from './LanguagePills.jsx';
import { SourcesMoreButton, SourcesPublishedSocialToolbar } from './SourcesRowChrome.jsx';
import { usePublishedShareCode } from '../../hooks/usePublishedShareCode.js';
import {
    backfillBranchCatalogIcon,
    resolveBranchCatalogIcon,
} from '../../api/branch-catalog-icon.js';
import { CatalogRowEmoji } from './CatalogRowEmoji.jsx';
import { SwitchRow } from '../../../../shared/ui/SwitchRow.jsx';
import { useSourcesStore, useSources } from '../../hooks/useSources.js';
import { hasGdprNetworkConsent } from '../../../../shared/lib/connected-services/index.js';
import { SourcesMenuPrefs } from './SourcesMenuPrefs.jsx';
import { pickTitleForLang, titlesFromTreeLanguages, descriptionsFromTreeLanguages } from '../../../../shared/lib/catalog-titles.js';

export function SourcesBranchRow({
    branch,
    ui,
    isActive,
    pinned = false,
    compact = false,
    actionsOpen,
    onAction,
    onToggleRowActions,
    globalDirMetrics = null,
    isPublishedOwner = false,
    tourTarget,
}) {
    const store = useSourcesStore();
    const { lang } = useSources();
    const pinCls = pinned ? ' arborito-sources-row--pinned-active' : '';
    const borderCls =
        isActive && !pinned
            ? 'border-emerald-500/70 dark:border-sky-400/40 dark:ring-1 dark:ring-sky-400/15'
            : 'border-slate-200 dark:border-slate-800';
    const key = `branch:${String(branch?.id || '')}`;
    const open = actionsOpen?.has(key);
    const branchLangs = branch?.data?.languages ? Object.keys(branch.data.languages) : [];
    const { shareCode, shareOpts } = usePublishedShareCode({
        entry: branch,
        kind: 'branch',
    });
    const pubMetrics = branch?.publishedNetworkUrl
        ? metricsForPublishedUrl(branch.publishedNetworkUrl, globalDirMetrics)
        : {};
    const updatedTs = Number(branch?.updated);
    const updatedLabel =
        Number.isFinite(updatedTs) && updatedTs >= 946684800000
            ? new Date(updatedTs).toLocaleDateString()
            : '—';
    const branchIcon = resolveBranchCatalogIcon(branch);
    const isDemoBranch = isBundledArboritoDemoBranch(branch);
    const activeCls = isActive ? ' arborito-sources-row--active' : '';
    /* Demo must stay openable after the picker tour ends (CSS hides Load on --active). */
    const keepLoadCtaCls = isDemoBranch ? ' arborito-sources-row--keep-load-cta' : '';
    const accountSynced = !!(branch?.privateSyncedFromAccount);
    const signedIn = !!store?.isSignedIn?.();
    const networkOn = hasGdprNetworkConsent();
    const canToggleAccountSync = signedIn && networkOn;
    const displayName =
        pickTitleForLang(titlesFromTreeLanguages(branch?.data), lang, '') ||
        String(branch?.name || '').trim() ||
        '—';
    const displayDesc =
        pickTitleForLang(descriptionsFromTreeLanguages(branch?.data), lang, '') ||
        String(branch?.data?.description || '').trim();

    useEffect(() => {
        try {
            backfillBranchCatalogIcon(store?.userStore, branch);
        } catch {
            /* ignore */
        }
    }, [store, branch]);

    return (
        <div
            className={`p-4 arborito-surface-tile border ${borderCls}${pinCls}${activeCls}${keepLoadCtaCls} rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors${compact ? ' arborito-sources-row--compact' : ''}`}
            {...(tourTarget ? { 'data-arbor-tour': tourTarget } : {})}
        >
            <div className="arborito-sources-row-layout flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="arborito-sources-row-title flex items-center gap-2 min-w-0">
                        <CatalogRowEmoji emoji={branchIcon} size={22} />
                        <span className="truncate">{displayName}</span>
                    </p>
                    {!compact && displayDesc ? (
                        <p className="m-0 mt-1.5 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-1">
                            {displayDesc}
                        </p>
                    ) : null}
                    <div className="arborito-sources-row-meta">
                        {isDemoBranch ? (
                            <SourcesPill className="arborito-pill--by-arborito arborito-pill--bordered">
                                {ui.sourcesPillByArborito || 'Arborito'}
                            </SourcesPill>
                        ) : null}
                        <SourcesPill className="arborito-pill--emerald arborito-pill--bordered">
                            {ui.sourcesPillBranch || 'Branch'}
                        </SourcesPill>
                        {!compact && branch?.publishedNetworkUrl ? (
                            <SourcesPill className="arborito-pill--sky arborito-pill--bordered">
                                {ui.sourcesPillPublished || 'Published'}
                            </SourcesPill>
                        ) : null}
                        {!compact && accountSynced ? (
                            <SourcesPill className="arborito-pill--violet arborito-pill--bordered">
                                {ui.privateTreeSyncedBadge || 'Private · synced'}
                            </SourcesPill>
                        ) : null}
                        {!compact && isPublishedOwner ? (
                            <SourcesPill className="arborito-pill--amber arborito-pill--bordered">
                                {ui.sourcesPillOwner || 'Owner'}
                            </SourcesPill>
                        ) : null}
                        {isActive && !pinned && !shareCode ? (
                            <SourcesPill className="arborito-surface-tile text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                {ui.sourceActive || 'Active'}
                            </SourcesPill>
                        ) : null}
                        {!compact ? <LanguagePills langCodes={branchLangs} /> : null}
                    </div>
                    {!compact ? (
                        <p className="m-0 mt-1 text-[10px] text-slate-400 font-mono">
                            {ui.sourcesUpdated || 'Updated'}: {updatedLabel}
                        </p>
                    ) : null}
                </div>
                <aside className="arborito-sources-row-aside">
                    <div className="arborito-sources-primary-stack arborito-sources-primary-stack--load">
                        <div className="arborito-sources-cta-row">
                            {/* Keep Open during active-but-not-pinned hydrate (onboarding demo race). */}
                            <button
                                type="button"
                                className="arborito-sources-row-cta arborito-cta-emerald shadow-sm"
                                onClick={() =>
                                    onAction?.('load-branch', {
                                        id: branch?.id,
                                        name: branch?.name,
                                    })
                                }
                            >
                                {ui.sourceLoad || 'Open'}
                            </button>
                        </div>
                    </div>
                    <div
                        className="arborito-sources-primary-stack arborito-sources-primary-stack--placeholder"
                        aria-hidden="true"
                    />
                    <div className="arborito-sources-toolbar arborito-sources-toolbar--social">
                        {!compact ? (
                            <SourcesPublishedSocialToolbar
                                ui={ui}
                                shareOpts={shareOpts}
                                metrics={pubMetrics}
                                onVote={(payload) => onAction?.('global-vote', payload)}
                                onShare={(opts) =>
                                    onAction?.('share-tree-row', {
                                        shareName: opts.name,
                                        shareUrl: opts.url,
                                        shareCode: opts.shareCode,
                                        ownerPub: opts.ownerPub,
                                        universeId: opts.universeId,
                                    })
                                }
                            />
                        ) : null}
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
                <div className="mt-3 space-y-1">
                    {!isDemoBranch ? (
                        <SourcesMenuPrefs
                            title={ui.sourcesBranchPrefsHeading || 'This branch'}
                        >
                            <SwitchRow
                                id={`branch-account-sync-${branch?.id || 'x'}`}
                                label={ui.privateTreesSyncToggleLabel || 'Sync to my account'}
                                hint={
                                    !signedIn
                                        ? ui.privateTreesSyncSignInHint ||
                                          'Sign in from Profile to sync this branch across devices.'
                                        : !networkOn
                                          ? ui.privateTreesSyncNetworkHint ||
                                            'Turn on the network in Privacy & data to sync this branch.'
                                          : ui.privateTreesSyncToggleHint ||
                                            'Keeps an encrypted draft of this branch on your account for other devices. Still private.'
                                }
                                checked={accountSynced}
                                disabled={!canToggleAccountSync}
                                onChange={(next) => {
                                    if (next) {
                                        onAction?.('publish-private', {
                                            id: branch?.id,
                                            name: branch?.name,
                                        });
                                    } else {
                                        onAction?.('unpublish-private', { id: branch?.id });
                                    }
                                }}
                                onAria={ui.privateTreesPublishCtaShort || 'Account draft'}
                                offAria={ui.privateTreesStopSyncShort || 'Stop sync'}
                            />
                        </SourcesMenuPrefs>
                    ) : null}
                    <div className="pt-1 flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="arborito-sources-action-chip arborito-sources-action-chip--accent"
                            onClick={() => onAction?.('add-branch-to-tree', { id: branch?.id })}
                        >
                            {ui.sourcesAddToTree || 'Add to tree…'}
                        </button>
                        <button
                            type="button"
                            className="arborito-sources-action-chip"
                            onClick={() =>
                                onAction?.('tree-info', { id: branch?.id, name: branch?.name })
                            }
                        >
                            {ui.sourcesBranchInfoButton || 'Branch information'}
                        </button>
                        <button
                            type="button"
                            className="arborito-sources-action-chip arborito-sources-action-chip--export"
                            onClick={() =>
                                onAction?.('export-branch', {
                                    id: branch?.id,
                                    name: branch?.name,
                                })
                            }
                        >
                            {ui.sourceExport || 'Export'}
                        </button>
                        {!isDemoBranch ? (
                            <button
                                type="button"
                                className="arborito-sources-action-chip arborito-sources-action-chip--danger"
                                onClick={() => onAction?.('show-delete', { id: branch?.id })}
                            >
                                {ui.sourceRemove}
                            </button>
                        ) : null}
                        {!isDemoBranch ? (
                            <button
                                type="button"
                                className="arborito-sources-action-chip"
                                onClick={() =>
                                    onAction?.('reset-branch-progress', {
                                        id: branch?.id,
                                        name: branch?.name,
                                    })
                                }
                            >
                                {ui.sourcesResetBranchProgress || 'Reset progress'}
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
