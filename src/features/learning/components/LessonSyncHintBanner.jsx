/** Slim reminder after the learner makes progress, not a full-screen promo. */
export function LessonSyncHintBanner({ ui, guestMode, onCta, onDismiss }) {
    const ctaLabel = guestMode
        ? ui.lessonSyncHintCtaGuest || ui.sourcesGuestSyncBannerCta || 'Back up'
        : ui.lessonSyncHintCtaSync || ui.welcomeCloudSyncOnLabel || 'Enable sync';

    return (
        <div
            className="arborito-lesson-sync-hint relative z-20 shrink-0"
            role="status"
            data-arbor-tour="cloud-sync"
        >
            <p className="arborito-lesson-sync-hint__text m-0 min-w-0 flex-1">
                {ui.lessonSyncHintText || 'Progress not backed up.'}
            </p>
            <button type="button" className="arborito-lesson-sync-hint__cta shrink-0" onClick={onCta}>
                {ctaLabel}
            </button>
            <button
                type="button"
                className="arborito-lesson-sync-hint__dismiss shrink-0"
                aria-label={ui.lessonSyncHintDismissAria || ui.sourcesGuestSyncBannerDismiss || 'Dismiss'}
                onClick={onDismiss}
            >
                ×
            </button>
        </div>
    );
}
