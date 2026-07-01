import { Callout } from '../../../../shared/ui/Callout.jsx';
import { LocaleRichText } from '../../../../shared/ui/LocaleRichText.jsx';

export function PrivacySection({ ui }) {
    const privacyText = (ui.privacyText || '').replace(
        '{impressum}',
        `<span class="text-slate-400 italic">${ui.aboutPrivacySeeLegalTab || 'See Legal tab'}</span>`
    );
    const nostrRelaysHeading = ui.privacyNostrRelaysHeading || '';
    const nostrRelaysBody = ui.privacyNostrRelaysBody || '';

    return (
        <div>
            <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">🛡️</span>
                <h2 className="text-xl font-black text-slate-800 dark:text-white">{ui.privacyTitle || 'Privacy'}</h2>
            </div>
            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-left select-text">
                <Callout
                    tone="blue"
                    size="sm"
                    extraClass="mb-6 not-prose text-xs font-bold leading-relaxed"
                    richHtml={ui.aboutPrivacyTabBlurb || ''}
                />
                {(nostrRelaysHeading || nostrRelaysBody) ? (
                    <>
                        <h3 className="mt-0">{nostrRelaysHeading}</h3>
                        <LocaleRichText
                            as="div"
                            className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6 not-prose"
                            html={nostrRelaysBody}
                        />
                    </>
                ) : null}
                <LocaleRichText html={privacyText} />
            </div>
        </div>
    );
}
