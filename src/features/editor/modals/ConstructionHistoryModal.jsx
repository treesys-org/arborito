import { useConstructionHistory } from '../hooks/useConstructionHistory.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';

export function ModalConstructionHistory() {
    const {
        ui,
        mobile,
        states,
        currentIndex,
        activeIndex,
        diff,
        canBack,
        canFwd,
        close,
        goBack,
        goForward,
        selectStep,
        stepLabel,
        formatHistoryTime,
        title,
        emptyLabel,
        selectStepHint,
        diffHeading,
        backLabel,
        forwardLabel,
        stepSummaryFallback,
    } = useConstructionHistory();

    return (
        <div data-arborito-panel="modal-construction-history">
            <DockModalShell
                mobile={mobile}
                layout={mobile ? 'dock' : 'centered'}
                sizeTier="STANDARD"
                shellOpts={{
                    z: 80,
                    layout: mobile ? 'dock' : 'centered',
                    scrim: mobile ? 'opaque' : 'translucent',
                }}
                hero={
                    <ModalHero
                        ui={ui}
                        mobile={mobile}
                        title={title}
                        tagClass="btn-close"
                        onClose={close}
                    />
                }
            >
                <div className="arborito-action-row px-4 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <button
                        type="button"
                        className="arborito-cta-slate flex-1 py-2 rounded-xl text-xs font-black uppercase"
                        disabled={!canBack}
                        onClick={goBack}
                    >
                        {backLabel}
                    </button>
                    <button
                        type="button"
                        className="arborito-cta-slate flex-1 py-2 rounded-xl text-xs font-black uppercase"
                        disabled={!canFwd}
                        onClick={goForward}
                    >
                        {forwardLabel}
                    </button>
                </div>
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div
                        id="con-history-list"
                        className="flex-1 min-h-0 overflow-auto custom-scrollbar p-3 space-y-1"
                    >
                        {!states.length ? (
                            <p className="text-sm text-slate-500 m-0">{emptyLabel}</p>
                        ) : (
                            states.map((st, i) => {
                                const active = i === currentIndex;
                                const selected = i === activeIndex;
                                const lbl = stepLabel(i);
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        className={`con-history-row w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${selected ? 'border-teal-400 bg-teal-50/80 dark:bg-teal-950/30' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                                        onClick={() => selectStep(i)}
                                    >
                                        <span className="arborito-eyebrow">
                                            {lbl}
                                            {active ? ' ●' : ''}
                                        </span>
                                        <span className="block text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                                            {st.summary || stepSummaryFallback}
                                        </span>
                                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                            {formatHistoryTime(st.at)} · {st.by || ''}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                    <div
                        id="con-history-diff"
                        className="shrink-0 border-t border-slate-100 dark:border-slate-800"
                    >
                        {!diff ? (
                            <p className="m-0 p-3 text-xs text-slate-500 dark:text-slate-400">
                                {selectStepHint}
                            </p>
                        ) : (
                            <div className="p-3 space-y-2">
                                <p className="arborito-eyebrow arborito-eyebrow--sm m-0">{diffHeading}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black arborito-pill arborito-pill--sm arborito-pill--solid-emerald">
                                        +{diff.counts.added}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black arborito-pill arborito-pill--sm arborito-pill--solid-rose">
                                        -{diff.counts.removed}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-amber-950">
                                        ~{diff.counts.changed}
                                    </span>
                                </div>
                                {diff.added.length > 0 && (
                                    <ul className="m-0 p-0 list-none max-h-28 overflow-auto">
                                        {diff.added.slice(0, 8).map((it) => (
                                            <li
                                                key={`a-${it.id}`}
                                                className="py-1.5 text-xs text-slate-700 dark:text-slate-200 truncate"
                                            >
                                                {it.name || it.id}{' '}
                                                <span className="text-slate-400 font-mono">{it.type || ''}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {diff.removed.length > 0 && (
                                    <ul className="m-0 p-0 list-none max-h-28 overflow-auto">
                                        {diff.removed.slice(0, 8).map((it) => (
                                            <li
                                                key={`r-${it.id}`}
                                                className="py-1.5 text-xs text-slate-700 dark:text-slate-200 truncate"
                                            >
                                                {it.name || it.id}{' '}
                                                <span className="text-slate-400 font-mono">{it.type || ''}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {diff.changed.length > 0 && (
                                    <ul className="m-0 p-0 list-none max-h-28 overflow-auto">
                                        {diff.changed.slice(0, 8).map((it) => (
                                            <li
                                                key={`c-${it.id}`}
                                                className="py-1.5 text-xs text-slate-700 dark:text-slate-200 truncate"
                                            >
                                                {(it.after && it.after.name) || it.id}{' '}
                                                <span className="text-slate-400">
                                                    ← {(it.before && it.before.name) || ''}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </DockModalShell>
        </div>
    );
}
