import { Callout } from '../../../../shared/ui/Callout.jsx';

/**
 * Shown once after onboarding when the user continues without an account.
 * On web, local storage is wiped by cookie/site-data clears, sync is the backup.
 */
export function GuestSyncWelcomeBanner({ ui, onOpenProfile, onDismiss }) {
    return (
        <Callout
            tone="amber"
            layout="stack"
            role="status"
            extraClass="arborito-guest-sync-banner mb-3 rounded-2xl"
            title={ui.sourcesGuestSyncBannerTitle || 'Keep your progress so you don\u2019t lose it'}
        >
            <p className="arborito-callout__body m-0">
                {ui.sourcesGuestSyncBannerBody ||
                    'On the web, your lessons and streaks live only in this browser. Clearing cookies or site data can erase months of study. A free account keeps them on all your devices.'}
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
                <button
                    type="button"
                    className="min-h-9 px-3 py-1.5 rounded-lg text-[11px] font-extrabold arborito-cta-amber"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenProfile?.();
                    }}
                >
                    {ui.sourcesGuestSyncBannerCta || 'Back up my progress'}
                </button>
                <button
                    type="button"
                    className="min-h-9 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-current/30 bg-transparent"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDismiss?.();
                    }}
                >
                    {ui.sourcesGuestSyncBannerDismiss || 'Got it'}
                </button>
            </div>
        </Callout>
    );
}
