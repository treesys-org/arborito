/** Legal notice when the library shows Discover / internet metadata from user relays. */
export function SourcesDiscoverDisclaimer({ ui, show }) {
    if (!show) return null;
    const text = ui.sourcesDiscoverDisclaimer;
    if (!text) return null;
    return (
        <p
            className="m-0 mb-2 text-[11px] leading-snug text-slate-600 dark:text-slate-400 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-950/30 px-3 py-2"
            role="note"
        >
            {text}
        </p>
    );
}
