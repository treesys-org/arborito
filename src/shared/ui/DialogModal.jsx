import { useEffect, useRef, useState } from 'react';
import { useShellModalActions } from '../../app/hooks/useShell.js';
import { useShellUiSlice } from '../../stores/shell-ui-store.js';
import { useStore } from 'zustand';
import { reactStateStore } from '../../stores/react-state.js';
import { isModalBackdropEmptyTap } from './mobile-tap.js';
import { shouldShowMobileUI } from './breakpoints.js';
import { sanitizeDialogHtml } from './dialog-sanitize.js';
import { copyTextToClipboard } from '../lib/copy-text.js';
import { getArboritoStore } from '../../core/store-singleton.js';
import { SwitchRow } from './SwitchRow.jsx';
import { DockModalShell, ModalCenteredShell } from '../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../app/components/ChromeEmoji.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirm, modalCtaConfirmFull } from './modal-action-chrome.js';
import {
    dialogChoiceButtonTone,
    dialogChoiceHasDismissOption,
    sortConsolidatedDialogChoices,
} from './dialog-choice-order.js';
import { bindMobileInputKeepVisible } from './mobile-form-viewport.js';

export function ModalDialog() {
    const modal = useShellUiSlice((s) => s.modal);
    const ui = useStore(reactStateStore, (s) => s.ui);
    const { closeDialog } = useShellModalActions();
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
        switchLabel,
        switchHint,
        switchDefault,
        dialogIcon,
        dialogSpotlight,
        hideCancel,
    } = modal;

    const isPrompt = dialogType === 'prompt';
    const isConfirm = dialogType === 'confirm';
    const isAlert = dialogType === 'alert';
    const isChoice = dialogType === 'choice';
    const isExportSnapshots = dialogType === 'exportSnapshots';
    const dialogStacked = isConfirm || isAlert || isChoice || isPrompt;
    const choiceList = Array.isArray(choices) ? choices : [];
    const choiceBinary = isChoice && choiceList.length === 2;
    const choicePickList = isChoice && choiceList.length > 2;
    const choiceConsolidated = choiceBinary;
    const consolidatedChoices = choiceConsolidated ? sortConsolidatedDialogChoices(choiceList) : choiceList;
    const hideCancelBtn =
        !!hideCancel ||
        isAlert ||
        (mobile && isConfirm && !danger && !isPrompt) ||
        (choiceBinary && dialogChoiceHasDismissOption(choiceList));

    const [promptValue, setPromptValue] = useState('');
    const [syncOn, setSyncOn] = useState(switchDefault !== false);
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

    const titleLooksLikeQuestion = /\?/.test(String(title || ''));
    let icon = dialogIcon || 'ℹ️';
    if (!dialogIcon) {
        if (danger) icon = '⚠️';
        else if (isPrompt) icon = '✍️';
        else if (isConfirm) icon = titleLooksLikeQuestion ? '❓' : '✅';
        else if (isChoice || isExportSnapshots) icon = '📦';
        else if (isAlert && titleLooksLikeQuestion) icon = '❓';
    }

    const confirmTone = danger ? 'red' : 'emerald';
    const cancel = () => closeDialog(null);
    const bodyInHero =
        !bodyHtml && body && !isExportSnapshots && !isConfirm && !isAlert && !isChoice;
    const heroSubtitle = bodyInHero ? body : undefined;
    const showBodyText =
        bodyHtml ||
        (body &&
            (isExportSnapshots ||
                isConfirm ||
                isAlert ||
                isChoice ||
                (!heroSubtitle && !(isPrompt && mobile))));
    const sheetBodyLayout = mobile && dialogStacked;
    const sheetSpotlightLayout = sheetBodyLayout && dialogSpotlight;
    const dialogFooterLayout = dialogStacked && !isExportSnapshots;

    const confirm = () => {
        if (isPrompt) {
            closeDialog(promptValue || '');
        } else         if (isConfirm) {
            if (switchLabel) {
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
        const root = rootRef.current;
        if (!root || !bodyHtml) return undefined;
        const onCopyClick = async (e) => {
            const btn = e.target.closest?.('[data-copy]');
            if (!btn || !root.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            const text = btn.getAttribute('data-copy') || '';
            if (!text) return;
            const ok = await copyTextToClipboard(text);
            const store = getArboritoStore();
            store?.notify?.(
                ok
                    ? ui.publicTreeLinkCopied || 'Link copied to clipboard.'
                    : ui.publicTreeLinkCopyFailed || 'Could not copy (browser blocked clipboard).',
                !ok
            );
        };
        root.addEventListener('click', onCopyClick);
        return () => root.removeEventListener('click', onCopyClick);
    }, [bodyHtml, body, ui]);

    useEffect(() => {
        if (isPrompt) {
            setPromptValue('');
        }
    }, [isPrompt, placeholder, title]);

    useEffect(() => {
        setSyncOn(switchDefault !== false);
    }, [switchDefault, title]);

    useEffect(() => {
        if (!mobile || (!isPrompt && !isConfirm)) return undefined;
        return bindMobileInputKeepVisible(rootRef.current);
    }, [mobile, isPrompt, isConfirm, title]);

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

    const sheetFooterPadding = mobile
        ? 'px-3 sm:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
        : '';

    const sheetFooter =
        dialogFooterLayout ? (
            <div
                className={`arborito-modal-footer shrink-0 ${mobile ? sheetFooterPadding : 'px-6 pb-6 pt-0'}`}
            >
                {choiceConsolidated ? (
                    <div className={`arborito-action-row w-full ${mobile ? 'arborito-action-row--stack-mobile' : ''}`}>
                        {consolidatedChoices.map((c) => (
                            <button
                                key={String(c.id)}
                                type="button"
                                className={modalCtaConfirm(dialogChoiceButtonTone(c.id, confirmTone))}
                                onClick={() => closeDialog(c.id)}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                ) : choicePickList && !hideCancelBtn ? (
                    <div className={`arborito-action-row w-full ${mobile ? 'arborito-action-row--stack-mobile' : ''}`}>
                        <button type="button" className={MODAL_CTA_CANCEL} onClick={cancel}>
                            {cancelText || ui.cancel || 'Cancel'}
                        </button>
                    </div>
                ) : (
                    <div
                        className={`arborito-action-row w-full ${hideCancelBtn ? (mobile ? 'flex-col' : '') : ''} ${isPrompt && mobile ? 'w-full' : ''}`}
                    >
                        {!isAlert && !hideCancelBtn && (
                            <button type="button" className={MODAL_CTA_CANCEL} onClick={cancel}>
                                {cancelText || ui.cancel || 'Cancel'}
                            </button>
                        )}
                        <button
                            type="button"
                            className={`${modalCtaConfirm(confirmTone)}${hideCancelBtn ? ' w-full' : ''}`}
                            onClick={confirm}
                        >
                            {confirmText || 'OK'}
                        </button>
                    </div>
                )}
            </div>
        ) : null;

    const bodyContent = (
        <div
            className={`flex flex-col min-h-0 flex-1 overflow-hidden ${sheetBodyLayout ? 'arborito-dialog-sheet-body' : ''} ${choiceConsolidated || choicePickList ? 'arborito-dialog-choice-sheet' : ''} ${mobile ? 'px-3 sm:px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'p-6 pt-2'}`}
        >
            {showBodyText ? (
                <div
                    className={`arborito-dialog-body-block flex flex-col ${sheetBodyLayout ? (sheetSpotlightLayout || choiceConsolidated ? 'shrink-0' : 'arborito-dialog-scroll flex-1 min-h-0') : 'shrink-0'} ${mobile ? 'items-start text-left' : 'items-center text-center'} ${isPrompt && mobile ? 'mt-2' : ''} ${showBodyText && !isExportSnapshots && !sheetBodyLayout ? 'mb-4' : 'mb-3'} ${choicePickList ? 'mb-2' : ''}`}
                >
                    {bodyHtml ? (
                        <div
                            className={`text-sm leading-relaxed w-full ${isChoice || isExportSnapshots ? 'whitespace-pre-line' : ''}`}
                            dangerouslySetInnerHTML={{ __html: sanitizeDialogHtml(body) }}
                        />
                    ) : (
                        <p
                            className={`text-sm text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-line w-full`}
                        >
                            {body}
                        </p>
                    )}
                </div>
            ) : null}

            {sheetSpotlightLayout ? (
                <div className="arborito-dialog-spotlight" aria-hidden="true">
                    <ChromeEmoji
                        emoji={dialogSpotlight.emoji || '❓'}
                        size={52}
                        className="arborito-dialog-spotlight__emoji"
                    />
                    {dialogSpotlight.label ? (
                        <p className="arborito-dialog-spotlight__label">{dialogSpotlight.label}</p>
                    ) : null}
                </div>
            ) : null}

            {isPrompt && (
                <div className={`mb-6 shrink-0 ${mobile ? 'mt-2' : ''} arborito-dialog-prompt-field`}>
                    {mobile && showBodyText && body ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-line w-full mb-3 m-0">
                            {body}
                        </p>
                    ) : null}
                    <input
                        type="text"
                        className="arborito-input border-none font-bold w-full"
                        placeholder={placeholder || ''}
                        value={promptValue}
                        onChange={(e) => setPromptValue(e.target.value)}
                    />
                </div>
            )}

            {choicePickList ? (
                <div className="arborito-dialog-choice-pick-list flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar w-full">
                    {choiceList.map((c) => (
                        <button
                            key={String(c.id)}
                            type="button"
                            className={`${modalCtaConfirmFull('slate')} w-full text-left`}
                            onClick={() => closeDialog(c.id)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {isConfirm && switchLabel ? (
                <div className="w-full max-w-md mx-auto mb-4 px-1 shrink-0">
                    <SwitchRow
                        id="dialog-confirm-switch"
                        label={switchLabel}
                        hint={switchHint}
                        checked={syncOn}
                        onChange={setSyncOn}
                        onAria={
                            ui.publicTreeIncludeForumSwitchOn ||
                            ui.privateTreesPublishCta ||
                            'Turn on'
                        }
                        offAria={
                            ui.publicTreeIncludeForumSwitchOff ||
                            ui.privateTreesStopSync ||
                            'Turn off'
                        }
                    />
                </div>
            ) : null}

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
                        className={`${modalCtaConfirmFull(confirmTone)} shrink-0`}
                        onClick={confirm}
                    >
                        {confirmText || 'OK'}
                    </button>
                </div>
            )}

            {!sheetFooter && !isExportSnapshots && !choiceConsolidated && !choicePickList && (
                <div
                    className={`arborito-action-row shrink-0 ${sheetBodyLayout ? 'mt-auto' : ''} ${hideCancelBtn ? (mobile ? 'flex-col' : '') : ''} ${isPrompt && mobile ? 'mt-auto w-full' : ''}`}
                >
                    {!isAlert && !hideCancelBtn && (
                        <button
                            type="button"
                            className={MODAL_CTA_CANCEL}
                            onClick={cancel}
                        >
                            {cancelText || ui.cancel || 'Cancel'}
                        </button>
                    )}
                    <button
                        type="button"
                        className={`${modalCtaConfirm(confirmTone)}${hideCancelBtn ? ' w-full' : ''}`}
                        onClick={confirm}
                    >
                        {confirmText || 'OK'}
                    </button>
                </div>
            )}
        </div>
    );

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            subtitle={heroSubtitle}
            leadingIcon={icon}
            backTagClass="btn-dialog-mob-back"
            closeTagClass="btn-dialog-dismiss"
            onBack={choiceConsolidated ? undefined : cancel}
            showBack={!choiceConsolidated}
            onClose={cancel}
        />
    );

    const backdropClick =
        danger
            ? undefined
            : (e) => {
                  const bd = e.currentTarget;
                  if (isModalBackdropEmptyTap(bd, e)) cancel();
              };

    if (mobile) {
        return (
            <div ref={rootRef} data-arborito-panel="modal-dialog">
                <DockModalShell
                    mobile={mobile}
                    sizeTier="COMPACT"
                    skipBodyWrap
                    hero={hero}
                    footer={sheetFooter}
                    shellOpts={{
                        rootFlags: 'arborito-modal--dialog',
                        z: 200,
                        enter: 'dock',
                        scrim: 'translucent',
                    }}
                    onBackdropClick={backdropClick}
                >
                    {bodyContent}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div ref={rootRef} data-arborito-panel="modal-dialog">
            <ModalCenteredShell
                mobile={mobile}
                layout="centered"
                sizeTier="COMPACT"
                hero={hero}
                footer={sheetFooter}
                panelRadius="2xl"
                shellOpts={{
                    z: 200,
                    enter: 'fade-fast',
                    panelClass: 'animate-in zoom-in-95 duration-200 max-h-[min(90vh,640px)]',
                }}
                onBackdropClick={backdropClick}
            >
                {bodyContent}
            </ModalCenteredShell>
        </div>
    );
}
