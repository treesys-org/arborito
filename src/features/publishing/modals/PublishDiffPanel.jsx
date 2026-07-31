import { usePublishDiffState } from '../hooks/usePublishDiffState.js';

function DiffBadge({ n, cls }) {
    return <span className={`px-2 py-1 rounded-lg text-[11px] font-black ${cls}`}>{n}</span>;
}

function humanType(ui, type) {
    const t = String(type || '').trim();
    if (t === 'leaf') return ui.publishDiffTypeLesson || 'Lesson';
    if (t === 'exam') return ui.publishDiffTypeExam || 'Exam';
    if (t === 'branch') return ui.publishDiffTypeFolder || 'Folder';
    if (t === 'root') return ui.publishDiffTypeCourse || 'Course';
    return ui.publishDiffTypeItem || 'Item';
}

function ItemRow({ it, ui }) {
    const title = String(it.name || '').trim() || humanType(ui, it.type);
    return (
        <li className="py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
            <p className="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{title}</p>
            <p className="m-0 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {humanType(ui, it.type)}
            </p>
        </li>
    );
}

function ChangedRow({ it, ui }) {
    const afterName = String(it.after?.name || '').trim();
    const beforeName = String(it.before?.name || '').trim();
    const title = afterName || beforeName || humanType(ui, it.after?.type || it.before?.type);
    const typeLabel = humanType(ui, it.after?.type || it.before?.type);
    const renamed = !!(beforeName && afterName && beforeName !== afterName);
    const detail = renamed
        ? `${typeLabel} · ${ui.publishDiffWas || 'was'}: ${beforeName}`
        : `${typeLabel} · ${ui.publishDiffContentUpdated || 'content updated'}`;

    return (
        <li className="py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
            <p className="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{title}</p>
            <p className="m-0 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">{detail}</p>
        </li>
    );
}

/** Diff vs last published snapshot, embedded section below branch metadata. */
export function PublishDiffPanel({ ui, modal, activeSource, rawGraphData, userStore }) {
    const { d, noBaseline, noChanges } = usePublishDiffState(modal, activeSource, rawGraphData, userStore);

    if (noBaseline) return null;

    const listCount =
        (d.added?.length || 0) + (d.removed?.length || 0) + (d.changed?.length || 0);
    /* Nested scroll only when the list is long — avoids double-scroll for a few lesson edits. */
    const listScrollClass =
        listCount > 6 ? 'max-h-[min(28vh,240px)] overflow-auto custom-scrollbar' : '';

    return (
        <section
            id="construction-about-changes"
            className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700"
            aria-label={ui.publishDiffTitle || 'Changes vs published'}
        >
            <p className="arborito-eyebrow arborito-eyebrow--strong m-0 mb-3">
                {ui.publishDiffTitle || 'Changes vs published'}
            </p>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden arborito-surface-tile">
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
                    </div>
                    {noChanges ? (
                        <p className="m-0 mt-3 text-sm text-slate-600 dark:text-slate-300">
                            {ui.publishDiffNoChanges || 'No changes since last publish.'}
                        </p>
                    ) : null}
                </div>
                {!noChanges ? (
                    <div className={listScrollClass}>
                        {d.added.length > 0 ? (
                            <div className="px-3 sm:px-4 pt-3">
                                <p className="arborito-eyebrow arborito-eyebrow--md m-0">
                                    {ui.publishDiffAdded || 'Added'}
                                </p>
                                <ul className="m-0 mt-2 p-0 list-none">
                                    {d.added.slice(0, 120).map((it) => (
                                        <ItemRow key={it.id} it={it} ui={ui} />
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {d.removed.length > 0 ? (
                            <div className="px-3 sm:px-4 pt-3">
                                <p className="arborito-eyebrow arborito-eyebrow--md m-0">
                                    {ui.publishDiffRemoved || 'Removed'}
                                </p>
                                <ul className="m-0 mt-2 p-0 list-none">
                                    {d.removed.slice(0, 120).map((it) => (
                                        <ItemRow key={it.id} it={it} ui={ui} />
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {d.changed.length > 0 ? (
                            <div className="px-3 sm:px-4 pt-3 pb-3">
                                <p className="arborito-eyebrow arborito-eyebrow--md m-0">
                                    {ui.publishDiffChanged || 'Changed'}
                                </p>
                                <ul className="m-0 mt-2 p-0 list-none">
                                    {d.changed.slice(0, 200).map((it) => (
                                        <ChangedRow key={it.id} it={it} ui={ui} />
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
