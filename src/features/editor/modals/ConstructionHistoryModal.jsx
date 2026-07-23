import { useConstructionHistory } from '../hooks/useConstructionHistory.js';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { CONSTRUCTION_HISTORY_HUB_SHELL } from '../api/construction-hub-chrome.js';
import { ConstructionModalShell } from './ConstructionModalShell.jsx';
import { modalCtaConfirm } from '../../../shared/ui/modal-action-chrome.js';

export function ModalConstructionHistory({ dockHost = false, instantReveal = false }) {
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

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            subtitle={ui.conHistorySheetTagline || ui.conHistorySelectStep || undefined}
            titleId="construction-history-title"
            leadingIcon="🕒"
            tagClass="btn-construction-history-close"
            onClose={close}
        />
    );

    const body = (
        <>
            <div className="construction-history-toolbar">
                <div className="arborito-action-row">
                    <button
                        type="button"
                        className={modalCtaConfirm('slate')}
                        disabled={!canBack}
                        onClick={goBack}
                    >
                        {backLabel}
                    </button>
                    <button
                        type="button"
                        className={modalCtaConfirm('slate')}
                        disabled={!canFwd}
                        onClick={goForward}
                    >
                        {forwardLabel}
                    </button>
                </div>
            </div>
            <div className="construction-history-body">
                <div id="con-history-list" className="construction-history-list custom-scrollbar">
                    {!states.length ? (
                        <p className="construction-history-empty">{emptyLabel}</p>
                    ) : (
                        states.map((st, i) => {
                            const active = i === currentIndex;
                            const selected = i === activeIndex;
                            const lbl = stepLabel(i);
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    className={`construction-history-row${selected ? ' construction-history-row--selected' : ''}`}
                                    onClick={() => selectStep(i)}
                                >
                                    <span className="arborito-eyebrow">
                                        {lbl}
                                        {active ? ' ●' : ''}
                                    </span>
                                    <span className="construction-history-row__title">
                                        {st.summary || stepSummaryFallback}
                                    </span>
                                    <span className="construction-history-row__meta">
                                        {formatHistoryTime(st.at)} · {st.by || ''}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
                <div id="con-history-diff" className="construction-history-diff">
                    {!diff ? (
                        <p className="construction-history-diff__hint">{selectStepHint}</p>
                    ) : (
                        <div className="construction-history-diff__body">
                            <p className="arborito-eyebrow arborito-eyebrow--sm m-0">{diffHeading}</p>
                            <div className="construction-history-diff__counts">
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
                            {diff.added.length > 0 ? (
                                <ul className="construction-history-diff__list">
                                    {diff.added.slice(0, 8).map((it) => (
                                        <li key={`a-${it.id}`} className="construction-history-diff__item">
                                            {it.name || it.id}{' '}
                                            <span className="text-slate-400 font-mono">{it.type || ''}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {diff.removed.length > 0 ? (
                                <ul className="construction-history-diff__list">
                                    {diff.removed.slice(0, 8).map((it) => (
                                        <li key={`r-${it.id}`} className="construction-history-diff__item">
                                            {it.name || it.id}{' '}
                                            <span className="text-slate-400 font-mono">{it.type || ''}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {diff.changed.length > 0 ? (
                                <ul className="construction-history-diff__list">
                                    {diff.changed.slice(0, 8).map((it) => (
                                        <li key={`c-${it.id}`} className="construction-history-diff__item">
                                            {(it.after && it.after.name) || it.id}{' '}
                                            <span className="text-slate-400">
                                                ← {(it.before && it.before.name) || ''}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </>
    );

    return (
        <ConstructionModalShell
            dockHost={dockHost}
            mobile={mobile}
            sizeTier={CONSTRUCTION_HISTORY_HUB_SHELL.sizeTier}
            hero={hero}
            onClose={close}
            ariaLabel={title}
            instantReveal={instantReveal}
            panelDataAttr="modal-construction-history"
            shellOpts={CONSTRUCTION_HISTORY_HUB_SHELL.shellOpts}
            panelClass={CONSTRUCTION_HISTORY_HUB_SHELL.panelClass}
            skipBodyWrap
        >
            {body}
        </ConstructionModalShell>
    );
}
