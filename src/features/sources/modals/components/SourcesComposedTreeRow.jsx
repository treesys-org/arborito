import { parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import { TreeBranchSummaryLine } from '../../../trees/components/TreeBranchLabels.jsx';
import { metricsForPublishedUrl } from '../../api/modals/logic/sources-directory-fetch.js';
import { SourcesPill } from './SourcesPill.jsx';
import { SourcesMoreButton, SourcesShareButton } from './SourcesRowChrome.jsx';
import { SourcesSocialMetrics } from './SourcesSocialMetrics.jsx';

function shareOptsForComposedTree(entry) {
    if (!entry?.publishedNetworkUrl) return null;
    const ref = parseNostrTreeUrl(String(entry.publishedNetworkUrl));
    return {
        name: entry.name || '',
        url: entry.publishedNetworkUrl,
        shareCode: entry.publishedShareCode || '',
        ownerPub: ref?.pub || '',
        universeId: ref?.universeId || '',
    };
}

export function composedTreeRowKey(treeId) {
    return `tree:${String(treeId || '')}`;
}

export function SourcesComposedTreeRow({
    tree,
    ui,
    activeSource,
    pinned = false,
    actionsOpen,
    globalDirMetrics,
    onAction,
    onToggleRowActions,
}) {
    const isActive = !!(
        activeSource?.type === 'composed-tree' &&
        String(activeSource.treeId || '') === String(tree.id || '')
    );
    const shareOpts = shareOptsForComposedTree(tree);
    const key = composedTreeRowKey(tree.id);
    const open = actionsOpen?.has(key);
    const pinCls = pinned ? ' arborito-sources-row--pinned-active' : '';
    const borderCls =
        isActive && !pinned
            ? 'border-violet-500/70 dark:border-violet-400/40 dark:ring-1 dark:ring-violet-400/15'
            : 'border-violet-200/60 dark:border-violet-900/50';
    const publishedMetrics = tree.publishedNetworkUrl ? (
        <SourcesSocialMetrics
            ui={ui}
            metrics={metricsForPublishedUrl(tree.publishedNetworkUrl, globalDirMetrics)}
        />
    ) : null;

    return (
        <div
            className={`p-4 bg-white dark:bg-slate-900 border ${borderCls}${pinCls} rounded-2xl shadow-sm hover:border-violet-300 dark:hover:border-violet-700 transition-colors mb-2`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5 items-center min-w-0">
                        <p className="arborito-sources-row-title truncate min-w-0">🌳 {tree.name}</p>
                        <SourcesPill className="bg-violet-50 dark:bg-violet-950/25 text-violet-900 dark:text-violet-200 border-violet-200/70 dark:border-violet-800/60">
                            {ui.sourcesPillComposedTree || 'Tree'}
                        </SourcesPill>
                        {tree.publishedNetworkUrl ? (
                            <SourcesPill className="arborito-pill--sky arborito-pill--bordered">
                                {ui.sourcesPillPublished || 'Published'}
                            </SourcesPill>
                        ) : (
                            <SourcesPill className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                                {ui.sourcesPillLocal || 'On device'}
                            </SourcesPill>
                        )}
                        {isActive && !pinned ? (
                            <SourcesPill className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                {ui.sourceActive || 'Active'}
                            </SourcesPill>
                        ) : null}
                    </div>
                    <TreeBranchSummaryLine branchRefs={tree.branchRefs} ui={ui} max={4} />
                    {publishedMetrics}
                </div>
                <aside className="arborito-sources-row-aside">
                    {isActive || pinned ? (
                        <div
                            className="arborito-sources-primary-stack arborito-sources-primary-stack--placeholder"
                            aria-hidden="true"
                        />
                    ) : (
                        <div className="arborito-sources-primary-stack">
                            <div className="arborito-sources-cta-row">
                                <button
                                    type="button"
                                    className="arborito-sources-row-cta bg-violet-800 dark:bg-violet-500 text-white shadow-sm hover:opacity-90 transition-opacity"
                                    onClick={() => onAction?.('open-composed-tree', { id: tree.id })}
                                >
                                    {ui.sourceLoad || 'Open'}
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="arborito-sources-toolbar arborito-sources-toolbar--social">
                        <SourcesShareButton
                            ui={ui}
                            shareOpts={shareOpts}
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
                <div className="mt-3 flex flex-wrap gap-2" data-composed-tree-actions={key}>
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        onClick={() => onAction?.('composed-tree-info', { id: tree.id })}
                    >
                        {ui.sourcesComposedTreeInfoButton || 'Tree information'}
                    </button>
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        onClick={() => onAction?.('edit-composed-tree', { id: tree.id })}
                    >
                        {ui.sourcesEditTree || 'Edit branches'}
                    </button>
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                        onClick={() => onAction?.('export-composed-tree', { id: tree.id, name: tree.name })}
                    >
                        {ui.sourcesExportTree || ui.sourceExport || 'Export'}
                    </button>
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        onClick={() => onAction?.('rename-composed-tree', { id: tree.id })}
                    >
                        {ui.sourcesRenameTree || 'Rename'}
                    </button>
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 border border-slate-200 dark:border-slate-700 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                        onClick={() => onAction?.('remix-composed-tree', { id: tree.id })}
                    >
                        {ui.sourcesRemixTree || 'Remix'}
                    </button>
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-900/30"
                        onClick={() => onAction?.('publish-composed-tree', { id: tree.id })}
                    >
                        {tree.publishedNetworkUrl
                            ? ui.sourcesRepublishTree || ui.sourcesPublishTree || 'Publish'
                            : ui.sourcesPublishTree || 'Publish'}
                    </button>
                    {shareOpts ? (
                        <button
                            type="button"
                            className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            onClick={() => onAction?.('share-composed-tree', { id: tree.id })}
                        >
                            {ui.sourcesShareButton || 'Share'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        onClick={() => onAction?.('delete-composed-tree', { id: tree.id })}
                    >
                        {ui.sourceRemove || 'Remove'}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
