import { injectOperatorEmailToken } from '../../../shared/lib/default-operator-email.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { isElectronDesktop } from '../../learning/api/electron-bridge.js';
import { fillSageAiConsentTokens } from '../../learning/api/ai-models.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { LocaleRichText } from '../../../shared/ui/LocaleRichText.jsx';

function isWindowsElectronDesktop() {
    if (!isElectronDesktop()) return false;
    if (typeof navigator === 'undefined') return false;
    return /Windows/i.test(String(navigator.userAgent || ''));
}

/**
 * Canonical privacy policy prose (GDPR, Nostr, WebTorrent, legal basis, AI, tech stack).
 * Used by Privacy & data modal and About → Privacy & GDPR tab.
 *
 * @param {{
 *   ui: Record<string, string>,
 *   impressumVariant?: 'inline' | 'legal-tab-link',
 *   onOpenImpressum?: () => void,
 * }} props
 */
export function PrivacyPolicyBody({ ui, impressumVariant = 'inline', onOpenImpressum }) {
    const isDesktop = isElectronDesktop();
    const showWindowsUpdate = isWindowsElectronDesktop();
    const privacyTextParts = (ui.privacyText || '').split('{impressum}');
    const calloutBody = ui.privacyLocalFirstCallout || '';
    /* Local GGUF download is desktop-only; do not invent a browser Llama line. */
    const aiDisclosure = isDesktop
        ? fillSageAiConsentTokens(ui.privacyAiDesktopLine || '', true)
        : ui.privacyAiBrowserLine || '';
    const aiLicenseLine = isDesktop
        ? fillSageAiConsentTokens(ui.sageAiThirdPartyLicenses || '', true).trim()
        : '';
    const legalBasisBody = injectOperatorEmailToken(ui.privacyLegalBasisBody || '', ui);

    const impressumBlock =
        impressumVariant === 'legal-tab-link' ? (
            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <button
                    type="button"
                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-bold inline-flex items-center gap-2 transition-colors"
                    onClick={() => onOpenImpressum?.()}
                >
                    <ChromeEmoji emoji="⚖️" size={16} aria-hidden />
                    <span>{ui.privacyImpressumButton || ui.aboutPrivacySeeLegalTab || 'Legal notice'}</span>
                    <span className="arborito-sheet-hero__chev" aria-hidden="true">
                        ›
                    </span>
                </button>
            </div>
        ) : (
            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <LocaleRichText
                    as="p"
                    className="text-sm text-slate-600 dark:text-slate-300 mb-2 font-medium"
                    html={ui.impressumText || ''}
                />
                <button
                    type="button"
                    id="btn-link-impressum"
                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-bold inline-flex items-center gap-2 transition-colors"
                    onClick={() => onOpenImpressum?.()}
                >
                    <ChromeEmoji emoji="⚖️" size={16} aria-hidden />
                    <span>{ui.privacyImpressumButton || 'Legal notice'}</span>
                    <span className="arborito-sheet-hero__chev" aria-hidden="true">
                        ›
                    </span>
                </button>
            </div>
        );

    return (
        <>
            <Callout
                tone="blue"
                size="sm"
                extraClass="mb-6 not-prose text-xs font-bold leading-relaxed"
                richHtml={calloutBody}
            />

            {(ui.privacyNostrRelaysHeading || ui.privacyNostrRelaysBody) && (
                <>
                    <h3 className="mt-0">{ui.privacyNostrRelaysHeading}</h3>
                    <LocaleRichText
                        as="div"
                        className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6"
                        html={ui.privacyNostrRelaysBody}
                    />
                </>
            )}

            {(ui.privacyWebTorrentHeading || ui.privacyWebTorrentBody) && (
                <>
                    <h3>{ui.privacyWebTorrentHeading}</h3>
                    <LocaleRichText
                        as="div"
                        className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6"
                        html={ui.privacyWebTorrentBody}
                    />
                </>
            )}

            {showWindowsUpdate && (ui.privacyWindowsUpdateHeading || ui.privacyWindowsUpdateBody) && (
                <>
                    <h3>{ui.privacyWindowsUpdateHeading}</h3>
                    <LocaleRichText
                        as="div"
                        className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6"
                        html={ui.privacyWindowsUpdateBody}
                    />
                </>
            )}

            {(ui.privacySecretsHeading || ui.privacySecretsBody) && (
                <>
                    <h3>{ui.privacySecretsHeading}</h3>
                    <LocaleRichText
                        as="div"
                        className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6"
                        html={ui.privacySecretsBody}
                    />
                </>
            )}

            {privacyTextParts[0] ? <LocaleRichText html={privacyTextParts[0]} /> : null}
            {privacyTextParts.length > 1 ? impressumBlock : null}
            {privacyTextParts[1] ? <LocaleRichText html={privacyTextParts[1]} /> : null}

            {(ui.privacyLegalBasisHeading || legalBasisBody) && (
                <>
                    <h3>{ui.privacyLegalBasisHeading}</h3>
                    <LocaleRichText
                        as="div"
                        className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6"
                        html={legalBasisBody}
                    />
                </>
            )}

            <hr className="my-6 border-slate-200 dark:border-slate-700" />

            <h3>{ui.privacyAiThirdPartiesHeading}</h3>
            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl text-xs space-y-2">
                <LocaleRichText as="p" html={aiDisclosure} />
                {aiLicenseLine ? (
                    <p className="m-0 text-slate-600 dark:text-slate-400">{aiLicenseLine}</p>
                ) : null}
            </div>

            <hr className="my-6 border-slate-200 dark:border-slate-700" />

            <h3>{ui.privacyTechStackHeading}</h3>
            <ul className="text-xs font-mono bg-slate-100 dark:bg-slate-800 p-4 rounded-lg list-none space-y-2">
                <li>
                    <LocaleRichText html={ui.privacyTechHosting || ''} />
                </li>
                <li>
                    <LocaleRichText html={ui.privacyTechCurriculum || ''} />
                </li>
                <li>
                    <LocaleRichText html={ui.privacyTechFonts || ''} />
                </li>
                <li>
                    <LocaleRichText html={ui.privacyTechGraph || ''} />
                </li>
                <li>
                    <LocaleRichText html={ui.privacyTechAnalytics || ''} />
                </li>
            </ul>
        </>
    );
}
