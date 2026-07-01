import { useMemo, useState } from 'react';
import { getActivePublishContext } from '../../editor/api/construction-scope-publish.js';
import { usePublishDiffState } from '../hooks/usePublishDiffState.js';

/**
 * Unified publish footer: saves branch metadata from the form, then runs the
 * interactive publish flow (first publish for local trees, or republish).
 */
export function BranchPublishFooter({
    ui,
    modal,
    activeSource,
    rawGraphData,
    userStore,
    publishTreePublicInteractive,
    validatePublicationMetadata,
    flushMetadata,
    notify,
    onClose,
}) {
    const [publishingBusy, setPublishingBusy] = useState(false);
    const publishCtx = useMemo(() => getActivePublishContext(activeSource), [activeSource]);
    const { noBaseline, noChanges } = usePublishDiffState(modal, activeSource, rawGraphData, userStore);

    const isFirstPublish = !publishCtx.hasPublishedBaseline;
    const canPublish = isFirstPublish || !noChanges;

    const publishLabel = isFirstPublish
        ? ui.publicTreePublishOnlineLabel ||
          ui.publicTreePublishBranchDockLabel ||
          ui.publicTreeConfirmButton ||
          'Publish online'
        : noChanges
          ? ui.publicTreeUpToDateLabel || 'Up to date'
          : ui.publishDiffPublishCta || ui.publicTreeRepublishButton || 'Publish these changes';

    const handlePublish = async (e) => {
        e.stopPropagation();
        if (!canPublish || publishingBusy) return;

        const flushed = flushMetadata?.();
        if (flushed && !flushed.ok) {
            notify?.(flushed.message || ui.publishMetaRequiredTitle || 'Course details required', true);
            return;
        }

        const metaCheck = validatePublicationMetadata?.();
        if (metaCheck && !metaCheck.ok) {
            notify?.(metaCheck.message, true);
            return;
        }

        setPublishingBusy(true);
        try {
            if (typeof publishTreePublicInteractive === 'function') {
                await publishTreePublicInteractive();
            }
        } finally {
            setPublishingBusy(false);
        }
    };

    return (
        <div className="arborito-modal-footer flex flex-wrap gap-2 justify-end items-center">
            <button
                type="button"
                className="btn-publish-diff-back arborito-cta-slate px-4 py-2 rounded-xl text-sm font-black"
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
                className={`px-4 py-2 rounded-xl text-sm font-black inline-flex items-center gap-2 ${canPublish ? 'arborito-cta-emerald shadow-lg active:scale-95' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 shadow-inner'} ${publishingBusy ? 'opacity-60 pointer-events-none' : ''}`}
                disabled={!canPublish || publishingBusy}
                onClick={handlePublish}
            >
                <span aria-hidden="true">{canPublish && !isFirstPublish && !noChanges ? '🔄' : canPublish ? '🌐' : '✓'}</span>
                <span>{publishLabel}</span>
            </button>
        </div>
    );
}
