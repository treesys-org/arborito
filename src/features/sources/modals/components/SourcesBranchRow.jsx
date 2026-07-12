import { DEMO_BRANCH_ID } from '../../../../core/demo/arborito-demo-ids.js';
import { metricsForPublishedUrl } from '../../api/modals/logic/sources-directory-fetch.js';
import { SourcesPill } from './SourcesPill.jsx';
import { LanguagePills } from './LanguagePills.jsx';
import { SourcesFreezeToggle } from './SourcesFreezeToggle.jsx';
import { SourcesMoreButton } from './SourcesRowChrome.jsx';
import { SourcesShareCodeField } from './SourcesShareCodeButton.jsx';
import { SourcesSocialMetrics } from './SourcesSocialMetrics.jsx';
import { usePublishedShareCode } from '../../hooks/usePublishedShareCode.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { resolveBranchCatalogIcon } from '../../api/branch-catalog-icon.js';

export function SourcesBranchRow({
    branch,
    ui,
    isActive,
    pinned = false,
    actionsOpen,
    freezeBusy,
    onAction,
    onToggleRowActions,
    onToggleFreeze,
    globalDirMetrics = null,
    isPublishedOwner = false,
    tourTarget,
}) {
    const pinCls = pinned ? ' arborito-sources-row--pinned-active' : '';
    const borderCls =
        isActive && !pinned
            ? 'border-emerald-500/70 dark:border-sky-400/40 dark:ring-1 dark:ring-sky-400/15'
            : 'border-slate-200 dark:border-slate-800';
    const key = `branch:${String(branch?.id || '')}`;
    const open = actionsOpen?.has(key);
    const branchLangs = branch?.data?.languages ? Object.keys(branch.data.languages) : [];
    const { shareCode, shareOpts, loading: shareCodeLoading } = usePublishedShareCode({ entry: branch, kind: 'branch' });
    const publishedMetrics = branch?.publishedNetworkUrl ? (
        <SourcesSocialMetrics
            ui={ui}
            metrics={metricsForPublishedUrl(branch.publishedNetworkUrl, globalDirMetrics)}
        />
    ) : null;
    const updatedLabel =
        branch?.updated && Number.isFinite(Number(branch.updated))
            ? new Date(Number(branch.updated)).toLocaleDateString()
            : '—';
    const branchIcon = resolveBranchCatalogIcon(branch);
    const isDemoBranch = String(branch?.id || '') === DEMO_BRANCH_ID;
    const activeCls = isActive ? ' arborito-sources-row--active' : '';

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
                            <span className="truncate">{branch?.name}</span>
                        </p>
                        <SourcesPill className="arborito-pill--emerald arborito-pill--bordered">
                            {ui.sourcesPillBranch || 'Branch'}
                        </SourcesPill>
                        {branch?.publishedNetworkUrl ? (
                            <SourcesPill className="arborito-pill--sky arborito-pill--bordered">
                                {ui.sourcesPillPublished || 'Published'}
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
                            <SourcesFreezeToggle
                                sourceId={branch?.id}
                                busy={!!freezeBusy?.[branch?.id]}
                                ui={ui}
                                onToggle={onToggleFreeze}
                            />
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
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 border border-slate-200 dark:border-slate-700 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                        onClick={() => onAction?.('add-branch-to-tree', { id: branch?.id })}
                    >
                        {ui.sourcesAddToTree || 'Add to tree…'}
                    </button>
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        onClick={() =>
                            onAction?.('tree-info', { id: branch?.id, name: branch?.name })
                        }
                    >
                        {ui.sourcesBranchInfoButton || 'Branch information'}
                    </button>
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                        onClick={() =>
                            onAction?.('export-branch', { id: branch?.id, name: branch?.name })
                        }
                    >
                        {ui.sourceExport || 'Export'}
                    </button>
                    {!isDemoBranch ? (
                        <button
                            type="button"
                            className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            onClick={() => onAction?.('show-delete', { id: branch?.id })}
                        >
                            {ui.sourceRemove}
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
