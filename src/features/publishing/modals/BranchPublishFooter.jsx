import { useEffect, useMemo, useState } from 'react';
import { getActivePublishContext } from '../../editor/api/construction-scope-publish.js';
import { usePublishDiffState } from '../hooks/usePublishDiffState.js';
import { useShellUiSlice } from '../../../stores/shell-ui-store.js';
import { SwitchRow } from '../../../shared/ui/SwitchRow.jsx';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import {
    buildPublishHubConfirmBody,
    defaultIncludeForumForPublish,
    defaultListInDiscoverForPublish,
    isRepublishForActiveSource,
} from '../api/publish-hub-confirm.js';
import { resolvePublishHubFooterLabel } from '../api/publish-hub-chrome.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { MODAL_CTA_CANCEL, modalCtaConfirm } from '../../../shared/ui/modal-action-chrome.js';

/**
 * Unified publish footer: metadata form flush, inline confirm + forum switch, then network publish.
 */
export function BranchPublishFooter({
    ui,
    modal,
    activeSource,
    rawGraphData,
    userStore,
    publishTreePublicInteractive,
    flushMetadata,
    notify,
    onClose,
}) {
    const [publishingBusy, setPublishingBusy] = useState(false);
    const publishingTree = useShellUiSlice((s) => s.publishingTree);
    const publishCtx = useMemo(() => getActivePublishContext(activeSource), [activeSource]);
    const publishLocked = publishingBusy || !!publishingTree;
    const { noBaseline, noChanges } = usePublishDiffState(modal, activeSource, rawGraphData, userStore);

    const store = getArboritoStore();
    const republish = useMemo(() => isRepublishForActiveSource(store), [store, rawGraphData, activeSource]);
    const confirmCopy = useMemo(
        () => (store ? buildPublishHubConfirmBody(store, { republish }) : { body: '', ccRem: '' }),
        [store, republish, ui]
    );

    const [includeForum, setIncludeForum] = useState(() =>
        store ? defaultIncludeForumForPublish(store, republish) : false
    );
    const [listInDiscover, setListInDiscover] = useState(() =>
        store ? defaultListInDiscoverForPublish(store, republish) : true
    );

    useEffect(() => {
        if (!store) return;
        setIncludeForum(defaultIncludeForumForPublish(store, republish));
    }, [store, republish, rawGraphData?.meta?.forumEnabled]);

    useEffect(() => {
        setListInDiscover(true);
    }, [store, republish]);

    const isFirstPublish = !publishCtx.hasPublishedBaseline;
    const canPublish = isFirstPublish || !noChanges;

    const publishLabel = resolvePublishHubFooterLabel(ui, { isFirstPublish, noChanges });
    const mobile = shouldShowMobileUI();

    const handlePublish = async (e) => {
        e.stopPropagation();
        if (!canPublish || publishLocked) return;

        const flushed = flushMetadata?.();
        if (flushed && !flushed.ok) {
            notify?.(flushed.message || ui.publishMetaRequiredTitle || 'Course details required', true);
            return;
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

    return (
        <div className="arborito-modal-footer arborito-modal-footer--blend flex flex-col gap-3">
            {canPublish ? (
                <div className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 px-3 py-3 space-y-3">
                    <p className="m-0 text-xs leading-snug text-slate-600 dark:text-slate-300 whitespace-pre-line">
                        {confirmCopy.body}
                    </p>
                    <p className="m-0 text-xs leading-snug text-amber-900/90 dark:text-amber-100/90 rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/25 px-3 py-2">
                        {ui.publishHubInactivityNote ||
                            'Public copies auto-retract after about 12 months without use (GDPR). Active learners pause the timer.'}
                    </p>
                    <SwitchRow
                        id="publish-hub-list-in-discover"
                        label={
                            ui.publicTreeListInDiscoverLabel ||
                            'List in Discover'
                        }
                        hint={
                            ui.publicTreeListInDiscoverHint ||
                            'Your share code works the same without this. Discover only lists basic info on the servers you connected.'
                        }
                        checked={listInDiscover}
                        onChange={setListInDiscover}
                        onAria={ui.publicTreeListInDiscoverSwitchOn || 'List in Discover'}
                        offAria={ui.publicTreeListInDiscoverSwitchOff || 'Do not list in Discover'}
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
            <div className={`arborito-action-row${mobile ? ' arborito-action-row--stack-mobile' : ''}`}>
                <button
                    type="button"
                    className={MODAL_CTA_CANCEL}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose?.();
                    }}
                >
                    {ui.close || 'Close'}
                </button>
                <button
                    type="button"
                    id="btn-construction-about-publish"
                    className={`${modalCtaConfirm(canPublish ? 'emerald' : 'slate')} inline-flex items-center justify-center gap-2${!canPublish || publishLocked ? ' opacity-60 pointer-events-none' : ''}`}
                    disabled={!canPublish || publishLocked}
                    onClick={handlePublish}
                >
                    <span aria-hidden="true">
                        {canPublish && !isFirstPublish && !noChanges ? '🔄' : canPublish ? '🌐' : '✓'}
                    </span>
                    <span>{publishLabel}</span>
                </button>
            </div>
        </div>
    );
}

/** Loading-state footer, same chrome as BranchPublishFooter while chunk loads. */
export function BranchPublishFooterSkeleton({ ui }) {
    const mobile = shouldShowMobileUI();
    const publishLabel =
        ui.publicTreeDockLabel || ui.constructionBranchPublishTitle || 'Publish branch';

    return (
        <div
            className="arborito-modal-footer arborito-modal-footer--blend flex flex-col gap-3"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className={`arborito-action-row${mobile ? ' arborito-action-row--stack-mobile' : ''}`}>
                <button type="button" className={MODAL_CTA_CANCEL} disabled>
                    {ui.close || 'Close'}
                </button>
                <button
                    type="button"
                    className={`${modalCtaConfirm('slate')} inline-flex items-center justify-center gap-2 opacity-60 pointer-events-none`}
                    disabled
                >
                    <span aria-hidden="true">🌐</span>
                    <span>{publishLabel}</span>
                </button>
            </div>
        </div>
    );
}
