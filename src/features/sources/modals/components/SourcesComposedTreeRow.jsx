import { TreeBranchSummaryLine } from '../../../forest/components/TreeBranchLabels.jsx';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { metricsForPublishedUrl } from '../../api/modals/logic/sources-directory-fetch.js';
import { SourcesShareCodeField } from './SourcesShareCodeField.jsx';
import { usePublishedShareCode } from '../../hooks/usePublishedShareCode.js';
import { SourcesPill } from './SourcesPill.jsx';
import { SourcesMoreButton } from './SourcesRowChrome.jsx';
import { SourcesSocialMetrics } from './SourcesSocialMetrics.jsx';

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
    isPublishedOwner = false,
}) {
    const isActive = !!(
        activeSource?.type === 'composed-tree' &&
        String(activeSource.treeId || '') === String(tree.id || '')
    );
    const { shareCode, shareOpts, loading: shareCodeLoading } = usePublishedShareCode({
        entry: tree,
        kind: 'composed-tree',
        activeSource,
    });
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
                        <p className="arborito-sources-row-title truncate min-w-0 inline-flex items-center gap-1.5 min-w-0">
                            <ChromeEmoji emoji="🌳" size={16} className="arborito-emoji-glyph shrink-0" />
                            <span className="truncate">{tree.name}</span>
                        </p>
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
                    </div>
                    <SourcesShareCodeField
                        ui={ui}
                        shareCode={shareCode}
                        shareOpts={shareOpts}
                        loading={shareCodeLoading}
                        published={!!tree.publishedNetworkUrl}
                        tone="violet"
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
                        className="arborito-sources-action-chip"
                        onClick={() => onAction?.('composed-tree-info', { id: tree.id })}
                    >
                        {ui.sourcesComposedTreeInfoButton || 'Tree information'}
                    </button>
                    <button
                        type="button"
                        className="arborito-sources-action-chip"
                        onClick={() => onAction?.('edit-composed-tree', { id: tree.id })}
                    >
                        {ui.sourcesEditTree || 'Edit branches'}
                    </button>
                    <button
                        type="button"
                        className="arborito-sources-action-chip arborito-sources-action-chip--export"
                        onClick={() => onAction?.('export-composed-tree', { id: tree.id, name: tree.name })}
                    >
                        {ui.sourcesExportTree || ui.sourceExport || 'Export'}
                    </button>
                    <button
                        type="button"
                        className="arborito-sources-action-chip"
                        onClick={() => onAction?.('rename-composed-tree', { id: tree.id })}
                    >
                        {ui.sourcesRenameTree || 'Rename'}
                    </button>
                    <button
                        type="button"
                        className="arborito-sources-action-chip"
                        title={ui.sourcesRemixTreeHint || ''}
                        onClick={() => onAction?.('remix-composed-tree', { id: tree.id })}
                    >
                        {ui.sourcesRemixTree || 'Copy to edit'}
                    </button>
                    {!tree.publishedNetworkUrl ? (
                        <button
                            type="button"
                            className="arborito-sources-action-chip arborito-sources-action-chip--sky"
                            onClick={() => onAction?.('publish-composed-tree', { id: tree.id })}
                        >
                            {ui.sourcesPublishTree || 'Publish'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="arborito-sources-action-chip arborito-sources-action-chip--danger"
                        onClick={() => onAction?.('show-delete-composed-tree', { id: tree.id })}
                    >
                        {ui.sourceRemove || 'Remove'}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
