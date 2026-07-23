import { DEMO_BRANCH_ID } from '../../../../core/demo/arborito-demo-ids.js';
import { metricsForPublishedUrl } from '../../api/modals/logic/sources-directory-fetch.js';
import { SourcesPill } from './SourcesPill.jsx';
import { LanguagePills } from './LanguagePills.jsx';
import { SourcesMoreButton } from './SourcesRowChrome.jsx';
import { SourcesShareCodeField } from './SourcesShareCodeField.jsx';
import { SourcesSocialMetrics } from './SourcesSocialMetrics.jsx';
import { usePublishedShareCode } from '../../hooks/usePublishedShareCode.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { resolveBranchCatalogIcon } from '../../api/branch-catalog-icon.js';
import { SwitchRow } from '../../../../shared/ui/SwitchRow.jsx';
import { useSourcesStore, useSources } from '../../hooks/useSources.js';
import { hasGdprNetworkConsent } from '../../../../shared/lib/connected-services/index.js';
import { SourcesMenuPrefs } from './SourcesMenuPrefs.jsx';
import { pickTitleForLang, titlesFromTreeLanguages } from '../../../../shared/lib/catalog-titles.js';

export function SourcesBranchRow({
    branch,
    ui,
    isActive,
    pinned = false,
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
    const { shareCode, shareOpts, loading: shareCodeLoading } = usePublishedShareCode({
        entry: branch,
        kind: 'branch',
    });
    const publishedMetrics = branch?.publishedNetworkUrl ? (
        <SourcesSocialMetrics
            ui={ui}
            metrics={metricsForPublishedUrl(branch.publishedNetworkUrl, globalDirMetrics)}
        />
    ) : null;
    const updatedTs = Number(branch?.updated);
    const updatedLabel =
        Number.isFinite(updatedTs) && updatedTs >= 946684800000
            ? new Date(updatedTs).toLocaleDateString()
            : '—';
    const branchIcon = resolveBranchCatalogIcon(branch);
    const isDemoBranch = String(branch?.id || '') === DEMO_BRANCH_ID;
    const activeCls = isActive ? ' arborito-sources-row--active' : '';
    const accountSynced = !!(branch?.privateSyncedFromAccount);
    const signedIn = !!store?.isSignedIn?.();
    const networkOn = hasGdprNetworkConsent();
    const canToggleAccountSync = signedIn && networkOn;
    const displayName =
        pickTitleForLang(titlesFromTreeLanguages(branch?.data), lang, '') ||
        String(branch?.name || '').trim() ||
        '—';

    return (
        <div
            className={`p-4 bg-white dark:bg-slate-900 border ${borderCls}${pinCls}${activeCls} rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors`}
            {...(tourTarget ? { 'data-arbor-tour': tourTarget } : {})}
        >
            <div className="arborito-sources-row-layout flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2 items-center">
                        <p className="arborito-sources-row-title truncate flex items-center gap-1.5 min-w-0">
                            <ChromeEmoji
                                emoji={branchIcon}
                                size={18}
                                className="arborito-emoji-glyph shrink-0"
                            />
                            <span className="truncate">{displayName}</span>
                        </p>
                        <SourcesPill className="arborito-pill--emerald arborito-pill--bordered">
                            {ui.sourcesPillBranch || 'Branch'}
                        </SourcesPill>
                        {branch?.publishedNetworkUrl ? (
                            <SourcesPill className="arborito-pill--sky arborito-pill--bordered">
                                {ui.sourcesPillPublished || 'Published'}
                            </SourcesPill>
                        ) : null}
                        {accountSynced ? (
                            <SourcesPill className="arborito-pill--violet arborito-pill--bordered">
                                {ui.privateTreeSyncedBadge || 'Private · synced'}
                            </SourcesPill>
                        ) : null}
                        {isPublishedOwner ? (
                            <SourcesPill className="bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800/60">
                                {ui.sourcesPillOwner || 'Owner'}
                            </SourcesPill>
                        ) : null}
                        {isActive && !pinned && !shareCode ? (
                            <SourcesPill className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                {ui.sourceActive || 'Active'}
                            </SourcesPill>
                        ) : null}
                        <LanguagePills langCodes={branchLangs} />
                    </div>
                    <SourcesShareCodeField
                        ui={ui}
                        shareCode={shareCode}
                        shareOpts={shareOpts}
                        loading={shareCodeLoading}
                        published={!!branch?.publishedNetworkUrl}
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
                    <p className="m-0 mt-1 text-[10px] text-slate-400 font-mono">
                        {ui.sourcesUpdated || 'Updated'}: {updatedLabel}
                    </p>
                    {publishedMetrics}
                </div>
                <aside className="arborito-sources-row-aside">
                    <div className="arborito-sources-primary-stack arborito-sources-primary-stack--load">
                        <div className="arborito-sources-cta-row">
                            {isActive && !pinned ? (
                                <SourcesPill className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                    {ui.sourceActive || 'Active'}
                                </SourcesPill>
                            ) : (
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
                                    {ui.sourceLoad || 'Load'}
                                </button>
                            )}
                        </div>
                    </div>
                    <div
                        className="arborito-sources-primary-stack arborito-sources-primary-stack--placeholder"
                        aria-hidden="true"
                    />
                    <div className="arborito-sources-toolbar arborito-sources-toolbar--social">
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
                    </div>
                </div>
            ) : null}
        </div>
    );
}
