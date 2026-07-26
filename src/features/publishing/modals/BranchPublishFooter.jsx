import { useEffect, useMemo, useState } from 'react';
import { resolveUnpublishDialogCopy } from '../api/resolve-publish-content-copy.js';
import { getActivePublishContext } from '../../editor/api/construction-scope-publish.js';
import { usePublishDiffState } from '../hooks/usePublishDiffState.js';
import { usePublishing } from '../hooks/usePublishing.js';
import { useShellUiSlice } from '../../../stores/shell-ui-store.js';
import { SwitchRow } from '../../../shared/ui/SwitchRow.jsx';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { resolvePublishHubFooterLabel } from '../api/publish-hub-chrome.js';
import { MODAL_CTA_CANCEL, modalCtaConfirm } from '../../../shared/ui/modal-action-chrome.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/** Outline danger — full-width under the primary row. */
const RETRACT_OUTLINE =
    'btn-cancel py-3 min-h-[44px] rounded-xl font-bold text-xs uppercase tracking-wider border border-rose-300/80 dark:border-rose-800/70 text-rose-800 dark:text-rose-200 bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-100/70 dark:hover:bg-rose-950/40 transition-colors';

/**
 * Publish hub footer:
 * - Needs publish/update: Cancelar | Publicar/Actualizar (+ Despublicar if owner)
 * - Already up to date: Listo (closes) (+ Despublicar) — no fake “Publicado” CTA
 */
export function BranchPublishFooter({
    ui,
    modal,
    activeSource,
    rawGraphData,
    userStore,
    publishTreePublicInteractive,
    revokePublicTreeInteractive,
    flushMetadata,
    notify,
    onClose,
}) {
    const [publishingBusy, setPublishingBusy] = useState(false);
    const [retractingBusy, setRetractingBusy] = useState(false);
    const publishingTree = useShellUiSlice((s) => s.publishingTree);
    const { noChanges, noBaseline } = usePublishDiffState(
        modal,
        activeSource,
        rawGraphData,
        userStore
    );
    /* Recompute when graph/hashes change so Update vs Publish matches the dock. */
    const publishCtx = useMemo(
        () => getActivePublishContext(activeSource),
        [activeSource, rawGraphData, userStore?.state?.branches, noChanges]
    );
    const publishLocked = publishingBusy || retractingBusy || !!publishingTree;
    const {
        confirmCopy,
        defaultIncludeForum,
        defaultListInDiscover,
        liveIncludeForum,
        liveListInDiscover,
    } = usePublishing();

    const [includeForum, setIncludeForum] = useState(() => defaultIncludeForum);
    const [listInDiscover, setListInDiscover] = useState(() => defaultListInDiscover);

    useEffect(() => {
        setIncludeForum(defaultIncludeForum);
    }, [defaultIncludeForum]);

    useEffect(() => {
        setListInDiscover(defaultListInDiscover);
    }, [defaultListInDiscover]);

    const isFirstPublish = !publishCtx.hasPublishedBaseline;
    /*
     * Never OR bare `!noChanges`: without a branch snapshot, noChanges is false and
     * composed hubs would always show Publish/Update. Prefer shared dirty flags;
     * only use structural diff when a real published snapshot exists.
     */
    const contentCanPublish =
        isFirstPublish ||
        publishCtx.isDraftDirty ||
        (publishCtx.hasPublishedBaseline && !noBaseline && !noChanges);

    const optionsDirty =
        !!publishCtx.hasPublishedBaseline &&
        (includeForum !== liveIncludeForum || listInDiscover !== liveListInDiscover);
    /* Allow republish when only forum/Discover options changed (no content edits). */
    const canPublish = contentCanPublish || optionsDirty;
    const showUpdate = !isFirstPublish && canPublish;
    const showPublishOptions = canPublish || !!publishCtx.hasPublishedBaseline;
    const canRetract =
        !!publishCtx.hasPublishedBaseline &&
        !!publishCtx.isPublishedOwner &&
        !!publishCtx.publishedNetworkUrl &&
        typeof revokePublicTreeInteractive === 'function';

    const publishLabel = resolvePublishHubFooterLabel(ui, {
        isFirstPublish,
        noChanges: !canPublish,
    });
    const doneLabel = ui.publishHubDoneLabel || ui.dialogConfirmTitle || ui.done || 'Done';
    const cancelLabel = ui.cancel || 'Cancel';
    const retractLabel =
        ui.publishHubRetractLink || ui.revokePublicTreeDockLabel || ui.revokePublicTreeConfirmButton || 'Unpublish';
    const unpublishCopy = useMemo(
        () => resolveUnpublishDialogCopy(ui, publishCtx.kind),
        [ui, publishCtx.kind]
    );
    const mobile = shouldShowMobileUI();
    const publishEmoji = showUpdate ? '🔄' : '🌐';

    const handlePublish = async (e) => {
        e.stopPropagation();
        if (!canPublish || publishLocked) return;

        if (typeof flushMetadata === 'function') {
            const flushed = flushMetadata();
            /* undefined = About form not mounted yet; interactive path still validates. */
            if (flushed && !flushed.ok) {
                notify?.(
                    flushed.message || ui.publishMetaRequiredTitle || 'Course details required',
                    true
                );
                return;
            }
        }

        setPublishingBusy(true);
        try {
            if (typeof publishTreePublicInteractive === 'function') {
                await publishTreePublicInteractive({ includeForum, listInDiscover, hubConfirm: true });
            }
        } finally {
            setPublishingBusy(false);
        }
    };

    const handleRetract = async (e) => {
        e.stopPropagation();
        if (!canRetract || publishLocked) return;
        setRetractingBusy(true);
        try {
            const result = await revokePublicTreeInteractive({
                publicTreeUrl: publishCtx.publishedNetworkUrl,
                branchIdToUnlink: publishCtx.kind === 'branch' ? publishCtx.localId : null,
                treeIdToUnlink: publishCtx.kind === 'composed-tree' ? publishCtx.treeId : null,
                contentKind: publishCtx.kind,
            });
            if (result?.ok) onClose?.();
        } finally {
            setRetractingBusy(false);
        }
    };

    const handleClose = (e) => {
        e.stopPropagation();
        onClose?.();
    };

    return (
        <div className="arborito-modal-footer arborito-modal-footer--blend flex flex-col gap-3">
            {showPublishOptions ? (
                <div className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 px-3 py-3 space-y-3">
                    {canPublish ? (
                        <p className="m-0 text-xs leading-snug text-slate-600 dark:text-slate-300 whitespace-pre-line">
                            {confirmCopy.body}
                        </p>
                    ) : (
                        <p className="m-0 text-xs leading-snug text-slate-600 dark:text-slate-300">
                            {ui.publicTreeUpToDateTooltip ||
                                ui.sourcesPublishedUpToDate ||
                                'Public copy is up to date.'}
                        </p>
                    )}
                    <SwitchRow
                        id="publish-hub-list-in-discover"
                        label={ui.publicTreeListInDiscoverLabel || 'List in the forest'}
                        hint={
                            ui.publicTreeListInDiscoverHint ||
                            'When on, anyone can find this course in the forest (Discover). When off, only people with the link or share code can open it.'
                        }
                        checked={listInDiscover}
                        onChange={setListInDiscover}
                        onAria={ui.publicTreeListInDiscoverSwitchOn || 'List in the forest'}
                        offAria={ui.publicTreeListInDiscoverSwitchOff || 'Do not list in the forest'}
                        className="py-0"
                    />
                    <SwitchRow
                        id="publish-hub-include-forum"
                        label={
                            ui.publicTreeIncludeForumLabel ||
                            'Include public forum (discussion and live messages)'
                        }
                        hint={
                            ui.publicTreeIncludeForumHint ||
                            'Forum is public on the network. You can change this when you republish.'
                        }
                        checked={includeForum}
                        onChange={setIncludeForum}
                        onAria={ui.publicTreeIncludeForumSwitchOn || 'Include forum'}
                        offAria={ui.publicTreeIncludeForumSwitchOff || 'Exclude forum'}
                        className="py-0"
                    />
                </div>
            ) : null}
            {canPublish ? (
                <div className={`arborito-action-row${mobile ? ' arborito-action-row--stack-mobile' : ''}`}>
                    <button type="button" className={MODAL_CTA_CANCEL} onClick={handleClose}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        id="btn-construction-about-publish"
                        className={`${modalCtaConfirm('emerald')} inline-flex items-center justify-center gap-2${publishLocked ? ' opacity-60 pointer-events-none' : ''}`}
                        disabled={publishLocked}
                        onClick={handlePublish}
                    >
                        <ChromeEmoji emoji={publishEmoji} className="text-sm leading-none" />
                        <span>{publishLabel}</span>
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    id="btn-construction-about-publish-done"
                    className={`${modalCtaConfirm('emerald')} w-full inline-flex items-center justify-center gap-2`}
                    onClick={handleClose}
                >
                    <ChromeEmoji emoji="✓" className="text-sm leading-none" />
                    <span>{doneLabel}</span>
                </button>
            )}
            {canRetract ? (
                <button
                    type="button"
                    id="btn-construction-about-retract"
                    className={`${RETRACT_OUTLINE} w-full${publishLocked ? ' opacity-60 pointer-events-none' : ''}`}
                    disabled={publishLocked}
                    title={unpublishCopy.dockTooltip}
                    onClick={handleRetract}
                >
                    {retractLabel}
                </button>
            ) : null}
        </div>
    );
}

/** Loading-state footer, same chrome as BranchPublishFooter while chunk loads. */
export function BranchPublishFooterSkeleton({ ui }) {
    const mobile = shouldShowMobileUI();
    const publishLabel =
        ui.publicTreePublishOnlineLabel || ui.publicTreeDockLabel || 'Publish';

    return (
        <div
            className="arborito-modal-footer arborito-modal-footer--blend flex flex-col gap-3"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className={`arborito-action-row${mobile ? ' arborito-action-row--stack-mobile' : ''}`}>
                <button type="button" className={MODAL_CTA_CANCEL} disabled>
                    {ui.cancel || 'Cancel'}
                </button>
                <button
                    type="button"
                    className={`${modalCtaConfirm('slate')} inline-flex items-center justify-center gap-2 opacity-60 pointer-events-none`}
                    disabled
                >
                    <ChromeEmoji emoji="🌐" className="text-sm leading-none" />
                    <span>{publishLabel}</span>
                </button>
            </div>
        </div>
    );
}
