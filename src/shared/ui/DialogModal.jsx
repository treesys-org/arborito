import { useEffect, useRef, useState } from 'react';
import { useShell } from '../../app/hooks/useShell.js';
import { isModalBackdropEmptyTap } from './mobile-tap.js';
import { shouldShowMobileUI } from './breakpoints.js';
import { sanitizeDialogHtml } from './dialog-sanitize.js';
import { ModalCenteredShell } from '../../app/components/ModalShell.jsx';
import { ModalHero } from '../../app/components/ModalHero.jsx';

export function ModalDialog() {
    const { modal, ui, closeDialog } = useShell();
    const mobile = shouldShowMobileUI();
    const rootRef = useRef(null);

    const {
        title,
        body,
        dialogType,
        placeholder,
        confirmText,
        cancelText,
        danger,
        choices,
        exportSnapshots,
        selectAllText,
        selectNoneText,
        bodyHtml,
        checkboxLabel,
        checkboxDefault,
        dialogIcon,
        hideCancel,
    } = modal;

    const isPrompt = dialogType === 'prompt';
    const isConfirm = dialogType === 'confirm';
    const isAlert = dialogType === 'alert';
    const isChoice = dialogType === 'choice';
    const isExportSnapshots = dialogType === 'exportSnapshots';
    const hideCancelBtn = !!hideCancel || isPrompt || isAlert || (mobile && isConfirm);

    const [promptValue, setPromptValue] = useState('');
    const [syncOn, setSyncOn] = useState(checkboxDefault !== false);
    const [snapPicks, setSnapPicks] = useState(() =>
        Array.isArray(exportSnapshots)
            ? Object.fromEntries(
                  exportSnapshots.map((row) => [
                      String(row.id != null ? row.id : ''),
                      row.checked !== false,
                  ])
              )
            : {}
    );
    const [pickSearch, setPickSearch] = useState('');

    let icon = dialogIcon || 'ℹ️';
    if (!dialogIcon) {
        if (danger) icon = '⚠️';
        else if (isPrompt) icon = '✍️';
        else if (isConfirm) icon = '✅';
        else if (isChoice || isExportSnapshots) icon = '📦';
    }

    const confirmBtnClass = danger ? 'arborito-cta-red' : 'arborito-btn-neutral';
    const cancel = () => closeDialog(null);

    const confirm = () => {
        if (isPrompt) {
            closeDialog(promptValue || '');
        } else if (isConfirm) {
            if (checkboxLabel) {
                closeDialog({ confirmed: true, checked: syncOn });
            } else {
                closeDialog(true);
            }
        } else if (isExportSnapshots) {
            const checked = Object.entries(snapPicks)
                .filter(([, on]) => on)
                .map(([id]) => id)
                .filter(Boolean);
            closeDialog(checked);
        } else {
            closeDialog(true);
        }
    };

    useEffect(() => {
        const t = setTimeout(() => {
            const inp = rootRef.current?.querySelector('input[type="text"]');
            if (inp) inp.focus();
            else {
                const pick = rootRef.current?.querySelector('.arborito-pick-row, .btn-choice, .btn-confirm');
                pick?.focus();
            }
        }, 50);
        return () => clearTimeout(t);
    }, [dialogType, title]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Enter') {
                if (dialogType === 'choice') {
                    e.preventDefault();
                    return;
                }
                e.preventDefault();
                confirm();
            }
            if (e.key === 'Escape') cancel();
        };
        const el = rootRef.current;
        el?.addEventListener('keydown', onKey);
        return () => el?.removeEventListener('keydown', onKey);
    });

    const showPickSearch =
        isExportSnapshots && Array.isArray(exportSnapshots) && exportSnapshots.length > 12;
    const pickQ = pickSearch.trim().toLowerCase();

    const bodyContent = (
        <div
            className={`flex flex-col min-h-0 flex-1 overflow-hidden ${mobile ? 'px-4 sm:px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'p-6 pt-2'}`}
        >
            <div
                className={`flex flex-col ${mobile ? 'items-start text-left' : 'items-center text-center'} mb-4 shrink-0 ${isPrompt && mobile ? 'mt-2' : ''}`}
            >
                <div className="text-4xl mb-3" aria-hidden="true">
                    {icon}
                </div>
                {bodyHtml ? (
                    <div
                        className={`text-sm text-slate-500 dark:text-slate-400 leading-relaxed ${isChoice || isExportSnapshots ? 'whitespace-pre-line w-full' : 'w-full'}`}
                        dangerouslySetInnerHTML={{ __html: sanitizeDialogHtml(body) }}
                    />
                ) : (
                    <p
                        className={`text-sm text-slate-500 dark:text-slate-400 leading-relaxed ${isChoice || isExportSnapshots ? 'whitespace-pre-line w-full' : 'w-full'}`}
                    >
                        {body}
                    </p>
                )}
            </div>

            {isPrompt && (
                <div className={`mb-6 shrink-0 ${mobile ? 'mt-auto' : ''}`}>
                    <input
                        type="text"
                        className="arborito-input border-none font-bold w-full"
                        placeholder={placeholder || ''}
                        value={promptValue}
                        onChange={(e) => setPromptValue(e.target.value)}
                    />
                </div>
            )}

            {isConfirm && checkboxLabel && (
                <div className="w-full max-w-md mx-auto mb-4 px-1 shrink-0 text-left">
                    <div className="flex items-start justify-between gap-4 py-3">
                        <div className="min-w-0 flex-1">
                            <p className="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">
                                {checkboxLabel}
                            </p>
                        </div>
                        <button
                            type="button"
                            id="dialog-confirm-sync"
                            className={`arborito-switch shrink-0 mt-0.5${syncOn ? ' is-on' : ''}`}
                            role="switch"
                            aria-checked={syncOn ? 'true' : 'false'}
                            aria-label={
                                syncOn
                                    ? ui.privateTreesStopSync || 'Disable account sync'
                                    : ui.privateTreesPublishCta || 'Enable account sync'
                            }
                            onClick={() => setSyncOn((v) => !v)}
                        />
                    </div>
                </div>
            )}

            {isExportSnapshots && Array.isArray(exportSnapshots) && exportSnapshots.length > 0 && (
                <div className="flex flex-col min-h-0 flex-1 mb-4">
                    {showPickSearch && (
                        <input
                            type="search"
                            className="arborito-pick-search arborito-input min-h-11 w-full mb-2 shrink-0"
                            placeholder={
                                ui.sourcesTreeEditorSearchPh || ui.treeSwitcherSearchPh || 'Search…'
                            }
                            autoComplete="off"
                            value={pickSearch}
                            onChange={(e) => setPickSearch(e.target.value)}
                        />
                    )}
                    <div className="arborito-pick-list max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain border border-slate-200 dark:border-slate-700 rounded-xl px-1 py-1 mb-3 space-y-0.5">
                        {exportSnapshots.map((row) => {
                            const id = String(row.id != null ? row.id : '');
                            const label = row.label != null ? row.label : id;
                            const on = snapPicks[id] !== false;
                            if (pickQ && !String(label).toLowerCase().includes(pickQ)) return null;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    className={`arborito-pick-row w-full min-h-11 flex items-center gap-3 py-2 px-3 rounded-xl border text-left transition-colors ${on ? 'is-selected border-violet-500/70 bg-violet-50 dark:bg-violet-950/35 dark:border-violet-600/50' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/80'}`}
                                    aria-pressed={on ? 'true' : 'false'}
                                    onClick={() =>
                                        setSnapPicks((prev) => ({ ...prev, [id]: !on }))
                                    }
                                >
                                    <span
                                        className={`arborito-pick-row__mark shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 dark:border-slate-600 text-transparent'}`}
                                        aria-hidden="true"
                                    >
                                        ✓
                                    </span>
                                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words min-w-0 flex-1">
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap justify-center gap-4 shrink-0 mb-2">
                        <button
                            type="button"
                            className="btn-export-snap-all text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                            onClick={() => {
                                const next = { ...snapPicks };
                                exportSnapshots.forEach((row) => {
                                    const id = String(row.id != null ? row.id : '');
                                    if (!pickQ || String(row.label || id).toLowerCase().includes(pickQ)) {
                                        next[id] = true;
                                    }
                                });
                                setSnapPicks(next);
                            }}
                        >
                            {selectAllText || 'All'}
                        </button>
                        <button
                            type="button"
                            className="btn-export-snap-none text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                            onClick={() => {
                                const next = { ...snapPicks };
                                exportSnapshots.forEach((row) => {
                                    const id = String(row.id != null ? row.id : '');
                                    if (!pickQ || String(row.label || id).toLowerCase().includes(pickQ)) {
                                        next[id] = false;
                                    }
                                });
                                setSnapPicks(next);
                            }}
                        >
                            {selectNoneText || 'None'}
                        </button>
                    </div>
                    <button
                        type="button"
                        className={`btn-confirm w-full py-3 ${confirmBtnClass} font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-wider shrink-0`}
                        onClick={confirm}
                    >
                        {confirmText || 'OK'}
                    </button>
                </div>
            )}

            {isChoice && Array.isArray(choices) && choices.length > 0 && (
                <div className="flex flex-col gap-3 w-full mb-4">
                    {choices.map((c) => (
                        <button
                            key={String(c.id)}
                            type="button"
                            className={`btn-choice w-full py-3 ${confirmBtnClass} font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-wider text-center`}
                            onClick={() => closeDialog(c.id)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            )}

            {!isExportSnapshots && !(isChoice && Array.isArray(choices) && choices.length) && (
                <div
                    className={`arborito-action-row shrink-0 ${hideCancelBtn ? (mobile ? 'flex-col' : '') : ''} ${isPrompt && mobile ? 'mt-auto w-full' : ''}`}
                >
                    {!isAlert && !hideCancelBtn && (
                        <button
                            type="button"
                            className="btn-cancel arborito-cta-slate py-3 rounded-xl font-bold text-xs uppercase tracking-wider"
                            onClick={cancel}
                        >
                            {cancelText || 'Cancel'}
                        </button>
                    )}
                    <button
                        type="button"
                        className={`btn-confirm py-3 ${confirmBtnClass} font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-wider${hideCancelBtn ? ' w-full' : ''}`}
                        onClick={confirm}
                    >
                        {confirmText || 'OK'}
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div ref={rootRef} data-arborito-panel="modal-dialog">
            <ModalCenteredShell
                mobile={mobile}
                layout={mobile ? 'dock' : 'top-anchored'}
                sizeTier="COMPACT"
                hero={
                    <ModalHero
                        ui={ui}
                        mobile={mobile}
                        title={title}
                        backTagClass="btn-dialog-mob-back"
                        closeTagClass="btn-dialog-dismiss"
                        onBack={cancel}
                        onClose={cancel}
                    />
                }
                panelRadius={mobile ? 'none' : '2xl'}
                shellOpts={{
                    z: 200,
                    enter: mobile ? 'dock' : 'fade-fast',
                    panelClass: mobile
                        ? 'flex flex-col min-h-0 h-full max-h-none'
                        : 'animate-in zoom-in-95 duration-200 max-h-[min(90vh,640px)]',
                }}
                onBackdropClick={
                    danger
                        ? undefined
                        : (e) => {
                              const bd = e.currentTarget;
                              if (isModalBackdropEmptyTap(bd, e)) cancel();
                          }
                }
            >
                {bodyContent}
            </ModalCenteredShell>
        </div>
    );
}
