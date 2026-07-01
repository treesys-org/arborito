import { usePublishing } from '../hooks/usePublishing.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';

function LicenseSection({ title, body }) {
    return (
        <div className="mb-4">
            <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 m-0 mb-2">{title}</h4>
            <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
                <p className="m-0">{body}</p>
            </div>
        </div>
    );
}

export function ModalAuthorLicense() {
    const { ui, cancelAuthorLicenseModal } = usePublishing();
    const isMob = shouldShowMobileUI();
    const dismiss = () => cancelAuthorLicenseModal();

    const notLegalAdvice = String(ui.authorLicenseNotLegalAdvice || '').trim();

    return (
        <ModalShell
            mobile={isMob}
            layout="bottom-sheet"
            onBackdropClick={dismiss}
            panelSize="standard auto-h"
            shellOpts={{ z: 135, enter: 'fade', scrim: 'translucent-strong' }}
        >
            <ModalHero
                ui={ui}
                align="start"
                title={ui.authorLicenseTitle}
                titleClass="text-lg font-black text-slate-800 dark:text-white m-0"
                subtitle={ui.authorLicenseSubtitleReference || ui.authorLicenseSubtitle}
                subtitleClass="text-xs text-slate-500 mt-1 font-semibold"
                backTagClass="js-authlic-back"
                closeTagClass="js-authlic-x"
                extraWrapClass="pb-3 border-b border-slate-100 dark:border-slate-800"
                onBack={dismiss}
                onClose={dismiss}
            />
            <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar text-left pb-[max(1rem,env(safe-area-inset-bottom))]">
                {ui.authorLicenseReferenceNote ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug m-0 mb-4">{ui.authorLicenseReferenceNote}</p>
                ) : null}
                <LicenseSection title={ui.authorLicenseHeadingCC || 'Creative Commons'} body={ui.authorLicenseSectionCC} />
                <LicenseSection title={ui.authorLicenseHeadingYou || 'Your responsibility'} body={ui.authorLicenseSectionYou} />
                <LicenseSection title={ui.authorLicenseHeadingArborito || 'Arborito software'} body={ui.authorLicenseSectionArborito} />
                {notLegalAdvice ? (
                    <p className="arborito-callout arborito-callout--amber arborito-callout--sm m-0" role="note">
                        {notLegalAdvice}
                    </p>
                ) : null}
            </div>
        </ModalShell>
    );
}
