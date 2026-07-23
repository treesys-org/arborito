import { PrivacyPolicyBody } from '../../../privacy-gdpr/components/PrivacyPolicyBody.jsx';

export function PrivacySection({ ui, onOpenLegalTab }) {
    return (
        <div>
            <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl" aria-hidden="true">
                    🛡️
                </span>
                <h2 className="text-xl font-black text-slate-800 dark:text-white m-0">
                    {ui.tabPrivacy || ui.profilePrivacyAndDataButton || ui.privacyTitle || 'Privacy & GDPR'}
                </h2>
            </div>
            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-left select-text">
                <PrivacyPolicyBody
                    ui={ui}
                    impressumVariant="legal-tab-link"
                    onOpenImpressum={onOpenLegalTab}
                />
            </div>
        </div>
    );
}
