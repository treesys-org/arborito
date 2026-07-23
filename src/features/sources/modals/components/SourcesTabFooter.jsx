/** Sources modal tab footer CTAs. */
export function SourcesTabFooter({ ui, mainTab, onAction }) {
    if (mainTab === 'trees') {
        return (
            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50" data-arbor-tour="sources-trees-footer">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="m-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {ui.sourcesCtaCompactTrees || ui.sourcesCtaCompact || 'Create or import'}
                    </p>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <button
                            type="button"
                            className="arborito-sources-action-chip arborito-sources-action-chip--import flex-1 sm:flex-initial"
                            onClick={() => onAction('import-tree')}
                        >
                            {ui.sourcesImportTreeShort || ui.sourcesImportShort || 'Import'}
                        </button>
                        <button
                            type="button"
                            className="arborito-cta-emerald flex-1 sm:flex-initial min-h-11 px-3 py-2 rounded-xl text-xs font-extrabold tracking-wide shadow-sm"
                            onClick={() => onAction('create-composed-tree')}
                        >
                            {ui.sourcesCreateTreeShort || ui.sourcesCreateTree || 'Create tree'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div
            className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50"
            data-arbor-tour="sources-trees-footer"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {ui.sourcesCtaCompactBranches || ui.sourcesCtaCompact || 'Create or import'}
                </p>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="arborito-sources-action-chip arborito-sources-action-chip--import"
                        onClick={() => onAction('import-tree')}
                    >
                        {ui.sourcesImportBranchShort || ui.sourcesImportShort || 'Import'}
                    </button>
                    <button
                        type="button"
                        className="arborito-cta-emerald min-h-11 px-3 py-2 rounded-xl text-xs font-extrabold tracking-wide shadow-sm"
                        onClick={() => onAction('show-plant')}
                    >
                        {ui.plantBranchShort || ui.plantBranch || 'New branch'}
                    </button>
                </div>
            </div>
        </div>
    );
}
