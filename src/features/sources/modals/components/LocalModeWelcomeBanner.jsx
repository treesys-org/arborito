import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';

/** Dismissible Biblioteca banner when public network is off. */
export function LocalModeWelcomeBanner({ ui, onOpenPrivacy, onDismiss }) {
    const title = ui.sourcesLocalModeBannerTitle || 'Local-only mode';
    const body =
        ui.sourcesLocalModeBannerBody ||
        'No share codes, online catalog, forums, or sync. Turn Online on in Privacy & data when you are ready.';
    const cta = ui.sourcesLocalModeBannerEnable || 'Enable online';
    const dismiss = ui.sourcesLocalModeBannerDismiss || ui.gotIt || 'Got it';

    return (
        <div
            className="arborito-local-mode-banner mb-3 rounded-2xl border border-amber-300/90 dark:border-amber-700/70 bg-amber-50/95 dark:bg-amber-950/40 px-4 py-3.5"
            role="status"
        >
            <div className="flex items-start gap-3">
                <span className="arborito-local-mode-banner__icon shrink-0 mt-0.5" aria-hidden="true">
                    <ChromeEmoji emoji="⚠️" size={32} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-extrabold text-amber-950 dark:text-amber-50 leading-snug">{title}</p>
                    <p className="m-0 mt-1.5 text-xs text-amber-950/90 dark:text-amber-100/90 leading-relaxed">{body}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <button
                            type="button"
                            className="arborito-local-mode-banner__cta min-h-11 px-4 py-2 rounded-xl text-sm font-extrabold bg-amber-700 dark:bg-amber-600 text-white shadow-sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenPrivacy?.();
                            }}
                        >
                            {cta}
                        </button>
                        <button
                            type="button"
                            className="min-h-11 px-3 py-2 rounded-xl text-xs font-bold text-amber-900 dark:text-amber-100 border border-amber-300/80 dark:border-amber-700"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismiss?.();
                            }}
                        >
                            {dismiss}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
