import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { Callout } from '../../../../shared/ui/Callout.jsx';

/** Dismissible Biblioteca banner when public network is off. */
export function LocalModeWelcomeBanner({ ui, onOpenPrivacy, onDismiss }) {
    const title = ui.sourcesLocalModeBannerTitle || 'Local-only mode';
    const body =
        ui.sourcesLocalModeBannerBody ||
        'No share codes, online catalog, forums, or sync. Turn Online on in Privacy & data when you are ready.';
    const cta = ui.sourcesLocalModeBannerEnable || 'Enable online';
    const dismiss = ui.sourcesLocalModeBannerDismiss || ui.gotIt || 'Got it';

    return (
        <Callout
            tone="amber"
            role="status"
            extraClass="arborito-local-mode-banner mb-3 rounded-2xl"
            icon={<ChromeEmoji emoji="⚠️" size={32} />}
            title={title}
        >
            <p className="arborito-callout__body m-0">{body}</p>
            <div className="flex flex-wrap gap-2 mt-3">
                <button
                    type="button"
                    className="arborito-local-mode-banner__cta min-h-11 px-4 py-2 rounded-xl text-sm font-extrabold arborito-cta-amber shadow-sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenPrivacy?.();
                    }}
                >
                    {cta}
                </button>
                <button
                    type="button"
                    className="min-h-11 px-3 py-2 rounded-xl text-xs font-bold border border-current/30 bg-transparent"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDismiss?.();
                    }}
                >
                    {dismiss}
                </button>
            </div>
        </Callout>
    );
}
