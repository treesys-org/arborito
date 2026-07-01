import { usePublishDiffState } from '../hooks/usePublishDiffState.js';

function DiffBadge({ n, cls }) {
    return <span className={`px-2 py-1 rounded-lg text-[11px] font-black ${cls}`}>{n}</span>;
}

function ItemRow({ it }) {
    return (
        <li className="py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{it.name || it.id}</p>
            <p className="m-0 mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                {it.type || ''} · {it.id}
            </p>
        </li>
    );
}

function ChangedRow({ it }) {
    return (
        <li className="py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{(it.after && it.after.name) || it.id}</p>
            <p className="m-0 mt-0.5 text-[11px] text-slate-600 dark:text-slate-300 truncate">
                <span className="font-mono">{it.id}</span>
                <span className="mx-2 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-500 dark:text-slate-400">was:</span> {(it.before && it.before.name) || ''}
            </p>
        </li>
    );
}

/** Diff vs last published snapshot — embedded section below branch metadata. */
export function PublishDiffPanel({ ui, modal, activeSource, rawGraphData, userStore }) {
    const { d, noBaseline, noChanges } = usePublishDiffState(modal, activeSource, rawGraphData, userStore);

    if (noBaseline) return null;

    return (
        <section
            id="construction-about-changes"
            className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700"
            aria-label={ui.publishDiffTitle || 'Changes vs published'}
        >
            <p className="arborito-eyebrow arborito-eyebrow--strong m-0 mb-3">
                {ui.publishDiffTitle || 'Changes vs published'}
            </p>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50/50 dark:bg-slate-900/30">
                <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap gap-2 items-center">
                        <DiffBadge
                            n={`${d.counts.added} ${ui.publishDiffAdded || 'added'}`}
                            cls="arborito-pill arborito-pill--sm arborito-pill--solid-emerald"
                        />
                        <DiffBadge
                            n={`${d.counts.removed} ${ui.publishDiffRemoved || 'removed'}`}
                            cls="arborito-pill arborito-pill--sm arborito-pill--solid-rose"
                        />
                        <DiffBadge
                            n={`${d.counts.changed} ${ui.publishDiffChanged || 'changed'}`}
                            cls="bg-amber-500 text-amber-950"
                        />
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {ui.publishDiffNodes || 'nodes'}: {d.counts.published} → {d.counts.draft}
                        </span>
                    </div>
                    {noChanges ? (
                        <p className="m-0 mt-3 text-sm text-slate-600 dark:text-slate-300">
                            {ui.publishDiffNoChanges || 'No changes since last publish.'}
                        </p>
                    ) : null}
                </div>
                {!noChanges ? (
                    <div className="max-h-[min(40vh,320px)] overflow-auto custom-scrollbar">
                        {d.added.length > 0 ? (
                            <div className="px-3 sm:px-4 pt-3">
                                <p className="arborito-eyebrow arborito-eyebrow--md m-0">{ui.publishDiffAdded || 'Added'}</p>
                                <ul className="m-0 mt-2 p-0 list-none">
                                    {d.added.slice(0, 120).map((it) => (
                                        <ItemRow key={it.id} it={it} />
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {d.removed.length > 0 ? (
                            <div className="px-3 sm:px-4 pt-3">
                                <p className="arborito-eyebrow arborito-eyebrow--md m-0">{ui.publishDiffRemoved || 'Removed'}</p>
                                <ul className="m-0 mt-2 p-0 list-none">
                                    {d.removed.slice(0, 120).map((it) => (
                                        <ItemRow key={it.id} it={it} />
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {d.changed.length > 0 ? (
                            <div className="px-3 sm:px-4 pt-3 pb-3">
                                <p className="arborito-eyebrow arborito-eyebrow--md m-0">{ui.publishDiffChanged || 'Changed'}</p>
                                <ul className="m-0 mt-2 p-0 list-none">
                                    {d.changed.slice(0, 200).map((it) => (
                                        <ChangedRow key={it.id} it={it} />
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </section>
    );
}
