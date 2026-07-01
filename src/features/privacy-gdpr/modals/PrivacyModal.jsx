import { usePrivacyGdpr } from '../hooks/usePrivacyGdpr.js';
import { injectOperatorEmailToken } from '../../../shared/lib/default-operator-email.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { isElectronDesktop } from '../../learning/api/electron-bridge.js';
import { fillSageAiConsentTokens } from '../../learning/api/ai-models.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { LocaleRichText } from '../../../shared/ui/LocaleRichText.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';

export function ModalPrivacy() {
    const {
        ui,
        modal,
        dismissModal,
        setModal,
        notify,
        hasGdprNetworkConsent,
        grantGdprNetworkConsent,
        resetOptionalConsentsInteractive,
        wipeAllLocalDataOnThisDeviceInteractive,
    } = usePrivacyGdpr();
    const m = modal;
    const readonly = !!(m && typeof m === 'object' && m.readonly);
    const mobile = shouldShowMobileUI();

    const hasNetCons = hasGdprNetworkConsent();
    const isDesktop = isElectronDesktop();

    const privacyTextParts = (ui.privacyText || '').split('{impressum}');
    const calloutBody = ui.privacyLocalFirstCallout || '';
    const aiDisclosure = isDesktop
        ? fillSageAiConsentTokens(ui.privacyAiDesktopLine || '', true)
        : ui.privacyAiBrowserLine || '';
    const aiLicenseLine = fillSageAiConsentTokens(ui.sageAiThirdPartyLicenses || '', isDesktop).trim();
    const legalBasisBody = injectOperatorEmailToken(ui.privacyLegalBasisBody || '', ui);

    const impressumBlock = (
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 font-medium">
                {ui.impressumText || ''}
            </p>
            <button
                type="button"
                id="btn-link-impressum"
                className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-bold flex items-center gap-2 transition-colors"
            >
                <span aria-hidden="true">⚖️</span>
                <span>{ui.privacyImpressumButton || 'Legal notice'}</span>
                <span aria-hidden="true">➜</span>
            </button>
        </div>
    );

    const close = () => dismissModal();
    const openImpressum = () =>
        setModal({
            type: 'about',
            tab: 'legal',
            ...(m && typeof m === 'object' && m.fromOnboarding ? { fromOnboarding: m.fromOnboarding } : {}),
        });

    const onGrantNetwork = () => {
        grantGdprNetworkConsent();
        notify(
            ui.privacyNetworkConsentGrantedToast || 'Privacy policy accepted.',
            false
        );
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.privacyTitle || 'Privacy'}
            leadingIcon="🛡️"
            backTagClass="btn-privacy-mob-back"
            closeTagClass="btn-privacy-x"
            onBack={close}
            onClose={close}
        />
    );

    return (
        <div data-arborito-panel="modal-privacy">
        <ModalCenteredShell
            refKey="modal-privacy"
            mobile={mobile}
            layout="centered"
            sizeTier="XL"
            hero={hero}
        >
            <div
                className="px-4 sm:px-8 pt-6 pb-8 overflow-y-auto custom-scrollbar flex-1 min-h-0"
                onClick={(e) => {
                    const t = e.target;
                    if (!(t instanceof Element)) return;
                    if (t.closest('#btn-link-impressum')) {
                        e.preventDefault();
                        openImpressum();
                    }
                    if (t.closest('#privacy-btn-reset-consents')) {
                        resetOptionalConsentsInteractive();
                    }
                    if (t.closest('#privacy-btn-wipe-local')) {
                        wipeAllLocalDataOnThisDeviceInteractive();
                    }
                    if (t.closest('#privacy-btn-grant-network')) {
                        onGrantNetwork();
                    }
                    if (t.closest('.btn-privacy-mob-back, .btn-privacy-x')) {
                        close();
                    }
                }}
            >
                <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                    <Callout
                        tone="blue"
                        size="sm"
                        extraClass="mb-6 not-prose text-xs font-bold leading-relaxed"
                        body={calloutBody}
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
                        <li><LocaleRichText html={ui.privacyTechHosting || ''} /></li>
                        <li><LocaleRichText html={ui.privacyTechCurriculum || ''} /></li>
                        <li><LocaleRichText html={ui.privacyTechFonts || ''} /></li>
                        <li><LocaleRichText html={ui.privacyTechGraph || ''} /></li>
                        <li><LocaleRichText html={ui.privacyTechAnalytics || ''} /></li>
                    </ul>

                    {!readonly && (
                        <>
                            <hr className="my-6 border-slate-200 dark:border-slate-700" />
                            <Callout
                                tone={hasNetCons ? 'emerald' : 'amber'}
                                layout="stack"
                                extraClass="not-prose mt-6"
                                title={ui.privacyNetworkConsentHeading || 'Network consent'}
                            >
                                <p className="arborito-callout__body text-xs leading-relaxed m-0 mt-2">
                                    {hasNetCons
                                        ? ui.privacyNetworkConsentGrantedBody ||
                                          'You accepted the privacy policy. Arborito can reach Nostr relays and the WebTorrent network on this device.'
                                        : ui.privacyNetworkConsentMissingBody ||
                                          'You have not accepted (or you withdrew) the privacy policy. Arborito will NOT contact any Nostr relay or WebTorrent peer until you accept.'}
                                </p>
                                {!hasNetCons ? (
                                    <div className="mt-4 flex flex-col gap-3">
                                        <button
                                            type="button"
                                            id="privacy-btn-grant-network"
                                            className="min-h-[44px] w-full rounded-xl px-4 py-3 text-sm font-black arborito-cta-emerald transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                                        >
                                            {ui.privacyNetworkConsentGrantButton || 'Accept privacy policy'}
                                        </button>
                                    </div>
                                ) : null}
                            </Callout>
                            <div className="not-prose mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-4">
                                <h3 className="arborito-eyebrow arborito-eyebrow--md arborito-eyebrow--strong m-0">
                                    {ui.privacyDeviceDataHeading || 'This device'}
                                </h3>
                                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                                    {ui.privacyDeviceDataLead || ''}
                                </p>
                                <div className="mt-4 flex flex-col gap-3">
                                    <button
                                        type="button"
                                        id="privacy-btn-reset-consents"
                                        className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition-colors hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                                    >
                                        {ui.privacyResetConsentButton}
                                    </button>
                                    <button
                                        type="button"
                                        id="privacy-btn-wipe-local"
                                        className="min-h-[44px] w-full rounded-xl border-2 border-red-300 bg-white px-4 py-3 text-sm font-bold text-red-800 transition-colors hover:border-red-400 dark:border-red-800 dark:bg-slate-900 dark:text-red-200 dark:hover:border-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                                    >
                                        {ui.privacyWipeLocalButton}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </ModalCenteredShell>
        </div>
    );
}
