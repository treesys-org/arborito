/**
 * Shown once after onboarding when the user continues without an account.
 * On web, local storage is wiped by cookie/site-data clears, sync is the backup.
 */
export function GuestSyncWelcomeBanner({ ui, onOpenProfile, onDismiss }) {
    return (
        <div
            className="arborito-guest-sync-banner mb-3 rounded-2xl border border-amber-200/90 dark:border-amber-800/60 bg-amber-50/95 dark:bg-amber-950/35 px-4 py-3"
            role="status"
        >
            <p className="m-0 text-sm font-bold text-amber-950 dark:text-amber-100 leading-snug">
                {ui.sourcesGuestSyncBannerTitle || 'Sync your progress so you don\u2019t lose it'}
            </p>
            <p className="m-0 mt-1.5 text-xs text-amber-950/90 dark:text-amber-100/90 leading-relaxed">
                {ui.sourcesGuestSyncBannerBody ||
                    'On the web, your lessons and streaks live only in this browser. Clearing cookies or site data can erase months of study. A free account backs them up encrypted and restores them on any device.'}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
                <button
                    type="button"
                    className="min-h-9 px-3 py-1.5 rounded-lg text-[11px] font-extrabold bg-amber-700 dark:bg-amber-600 text-white"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenProfile?.();
                    }}
                >
                    {ui.sourcesGuestSyncBannerCta || 'Back up my progress'}
                </button>
                <button
                    type="button"
                    className="min-h-9 px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-900 dark:text-amber-100 border border-amber-300/80 dark:border-amber-700"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDismiss?.();
                    }}
                >
                    {ui.sourcesGuestSyncBannerDismiss || 'Got it'}
                </button>
            </div>
        </div>
    );
}
