import { usePrivacyGdpr } from '../hooks/usePrivacyGdpr.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { LocaleRichText } from '../../../shared/ui/LocaleRichText.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';
import { ProfileNetworkRelays } from '../../identity-auth/modals/ProfileNetworkRelays.jsx';
import { PrivacyPolicyBody } from '../components/PrivacyPolicyBody.jsx';

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
    const fromOnboardingStep1 =
        !!(m && typeof m === 'object' && m.fromOnboarding && Number(m.fromOnboarding.step) === 1);
    const onboardingNetworkPreview = readonly && fromOnboardingStep1;
    const showNetworkControls = !readonly || onboardingNetworkPreview;
    const mobile = shouldShowMobileUI();

    const hasNetCons = hasGdprNetworkConsent();

    const close = () => dismissModal();
    const openImpressum = () => {
        const hint =
            m && typeof m === 'object'
                ? {
                      ...(m.fromOnboarding ? { fromOnboarding: m.fromOnboarding } : {}),
                      ...(m.fromProfile ? { fromProfile: true } : {}),
                      ...(m.fromMobileMore ? { fromMobileMore: true } : {}),
                      ...(m.fromSources ? { fromSources: true } : {}),
                      ...(m.readonly ? { readonly: true } : {}),
                  }
                : {};
        setModal({
            type: 'about',
            tab: 'legal',
            fromPrivacy: hint,
        });
    };

    const onGrantNetwork = () => {
        grantGdprNetworkConsent();
        notify(
            ui.privacyNetworkConsentGrantedToast || 'Privacy policy accepted.',
            false
        );
        close();
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={
                ui.profilePrivacyAndDataButton ||
                ui.tabPrivacy ||
                ui.privacyTitle ||
                'Privacy & data'
            }
            leadingIcon="🛡️"
            backTagClass="btn-privacy-mob-back"
            closeTagClass="btn-privacy-x"
            showClose={!mobile}
            showBack={mobile}
            trailingSpacer={false}
            onBack={close}
            onClose={close}
        />
    );

    const body = (
            <div
                className="px-4 sm:px-8 pt-6 pb-8 overflow-y-auto custom-scrollbar flex-1 min-h-0"
                onClick={(e) => {
                    const t = e.target;
                    if (!(t instanceof Element)) return;
                    if (t.closest('#btn-link-impressum')) {
                        e.preventDefault();
                        openImpressum();
                    }
                    if (t.closest('.btn-privacy-mob-back, .btn-privacy-x')) {
                        close();
                    }
                }}
            >
                <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                    <PrivacyPolicyBody ui={ui} onOpenImpressum={openImpressum} />

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
                                    <LocaleRichText
                                        html={
                                            hasNetCons
                                                ? ui.privacyNetworkConsentGrantedBody ||
                                                  'You accepted the privacy policy. Arborito can reach Nostr relays and the WebTorrent network on this device.'
                                                : ui.privacyNetworkConsentMissingBody ||
                                                  'You have not accepted (or you withdrew) the privacy policy. Arborito will NOT contact any Nostr relay or WebTorrent peer until you accept.'
                                        }
                                    />
                                </p>
                            </Callout>
                        </>
                    )}
                    {showNetworkControls && (
                        <>
                            {onboardingNetworkPreview ? (
                                <>
                                    <hr className="my-6 border-slate-200 dark:border-slate-700" />
                                    <Callout
                                        tone="blue"
                                        layout="stack"
                                        extraClass="not-prose mt-6"
                                        title={ui.privacyNetworkConsentHeading || 'Network consent'}
                                    >
                                        <p className="arborito-callout__body text-xs leading-relaxed m-0 mt-2">
                                            <LocaleRichText
                                                html={
                                                    ui.privacyOnboardingNetworkPreviewBody ||
                                                    'Online is not active yet. <strong>Accept and continue</strong> on the welcome screen will enable the recommended public network. Choose <strong>Continue offline (local only)</strong> to stay without network features.'
                                                }
                                            />
                                        </p>
                                    </Callout>
                                </>
                            ) : null}
                            <div className="not-prose mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 p-4">
                                <h3 className="arborito-eyebrow arborito-eyebrow--md arborito-eyebrow--strong m-0">
                                    {ui.profileNetworkRelaysHeading || ui.privacyNostrRelaysHeading || 'Public network'}
                                </h3>
                                <div className="mt-2 mb-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                                    <LocaleRichText
                                        html={
                                            onboardingNetworkPreview
                                                ? ui.onboardingNetworkAcceptNote ||
                                                  ui.privacyNetworkOnlineDisclaimer ||
                                                  'By continuing you accept the privacy policy and enable the recommended public network.'
                                                : ui.privacyNetworkOnlineDisclaimer ||
                                                  ui.profileNetworkModeOnHint ||
                                                  ui.privacyNostrRelaysBody ||
                                                  'Third-party servers; Arborito does not host your courses.'
                                        }
                                    />
                                </div>
                                <ProfileNetworkRelays previewPending={onboardingNetworkPreview} />
                            </div>
                            {!onboardingNetworkPreview ? (
                                <div className="not-prose mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-4">
                                    <h3 className="arborito-eyebrow arborito-eyebrow--md arborito-eyebrow--strong m-0">
                                        {ui.privacyDeviceDataHeading || 'This device'}
                                    </h3>
                                    <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                                        {ui.privacyDeviceDataLead || ''}
                                    </p>
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
    );

    const footer =
        readonly ? null : (
            <div className="arborito-modal-footer shrink-0 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="arborito-action-row w-full arborito-action-row--stack-mobile">
                    {!hasNetCons ? (
                        <button
                            type="button"
                            id="privacy-btn-grant-network"
                            className={modalCtaConfirmFull('emerald')}
                            onClick={onGrantNetwork}
                        >
                            {ui.privacyNetworkConsentGrantButton || 'Accept privacy policy'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        id="privacy-btn-reset-consents"
                        className={MODAL_CTA_CANCEL}
                        onClick={() => resetOptionalConsentsInteractive()}
                    >
                        {ui.privacyResetConsentButton}
                    </button>
                    <button
                        type="button"
                        id="privacy-btn-wipe-local"
                        className={modalCtaConfirmFull('red')}
                        onClick={() => wipeAllLocalDataOnThisDeviceInteractive()}
                    >
                        {ui.privacyWipeLocalButton}
                    </button>
                </div>
            </div>
        );

    if (mobile) {
        return (
            <div data-arborito-panel="modal-privacy">
                <DockModalShell
                    mobile
                    skipBodyWrap
                    hero={hero}
                    footer={footer}
                    shellOpts={{ rootFlags: 'arborito-modal--privacy' }}
                    onBackdropClick={close}
                >
                    {body}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-privacy">
        <ModalCenteredShell
            refKey="modal-privacy"
            mobile={mobile}
            layout="centered"
            sizeTier="XL"
            hero={hero}
            footer={footer}
            onBackdropClick={close}
        >
            {body}
        </ModalCenteredShell>
        </div>
    );
}
