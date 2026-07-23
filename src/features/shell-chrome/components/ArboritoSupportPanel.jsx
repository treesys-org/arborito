import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { openExternalUrl } from '../../../shared/lib/open-external-url.js';
import {
    ARBORITO_SUPPORT_STRIPE_MONTHLY,
    ARBORITO_SUPPORT_STRIPE_ONCE,
} from '../../../shared/lib/community-links.js';

function SupportOption({ icon, title, hint, onClick }) {
    return (
        <button type="button" className="arborito-support-option" onClick={onClick}>
            <span className="arborito-support-option__ic" aria-hidden="true">
                <ChromeEmoji emoji={icon} size={20} />
            </span>
            <span className="arborito-support-option__body">
                <span className="arborito-support-option__label">{title}</span>
                {hint ? <span className="arborito-support-option__hint">{hint}</span> : null}
            </span>
            <span className="arborito-support-option__ext" aria-hidden="true">
                ↗
            </span>
        </button>
    );
}

/** Shared body for Support Arborito (modal + More menu drill pane). */
export function ArboritoSupportPanel({ ui, className = '' }) {
    const title = ui.arboritoSupportModalTitle || ui.arboritoSupportCta || 'Support Arborito';
    const intro = ui.arboritoSupportModalIntro || '';
    const legal = ui.arboritoSupportModalLegal || '';

    const openStripe = (url) => {
        if (!url) return;
        void openExternalUrl(url);
    };

    return (
        <div
            className={`arborito-support-modal px-4 pb-6 pt-2 flex flex-col min-h-0 flex-1 overflow-y-auto custom-scrollbar${className ? ` ${className}` : ''}`}
        >
            {intro ? <p className="arborito-support-modal__intro">{intro}</p> : null}
            <div className="arborito-support-modal__options" role="group" aria-label={title}>
                {ARBORITO_SUPPORT_STRIPE_ONCE ? (
                    <SupportOption
                        icon="☕"
                        title={ui.arboritoSupportOnceCta || 'One-time contribution'}
                        hint={ui.arboritoSupportOnceHint || ''}
                        onClick={() => openStripe(ARBORITO_SUPPORT_STRIPE_ONCE)}
                    />
                ) : null}
                {ARBORITO_SUPPORT_STRIPE_MONTHLY ? (
                    <SupportOption
                        icon="💝"
                        title={ui.arboritoSupportMonthlyCta || 'Monthly support (€2)'}
                        hint={ui.arboritoSupportMonthlyHint || ''}
                        onClick={() => openStripe(ARBORITO_SUPPORT_STRIPE_MONTHLY)}
                    />
                ) : null}
            </div>
            {legal ? <p className="arborito-support-modal__legal">{legal}</p> : null}
        </div>
    );
}
