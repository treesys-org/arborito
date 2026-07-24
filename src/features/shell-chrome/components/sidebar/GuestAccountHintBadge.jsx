import { useShellChrome } from '../../hooks/useShellChrome.js';
import { isOnboardingWizardIncomplete } from '../../../../shared/lib/onboarding-boot-gate.js';
import { prefetchModal } from '../../../../app/modal-open.js';
import { shellUiActions } from '../../../../stores/shell-ui-store.js';

/** Compact yellow warning on profile when guest (no account backup). */
export function GuestAccountHintBadge({ className = '' }) {
    const { ui, setModal } = useShellChrome();
    let show = false;
    try {
        show = !shellUiActions.isSignedIn() && !isOnboardingWizardIncomplete();
    } catch {
        show = false;
    }

    if (!show) return null;

    const tip =
        ui.guestAccountHintTip ||
        ui.guestProgressAccountTitle ||
        'Progress is only on this device';

    return (
        <button
            type="button"
            className={`arborito-guest-account-hint ${className}`.trim()}
            title={tip}
            aria-label={tip}
            onPointerEnter={() => prefetchModal('profile')}
            onClick={(e) => {
                e.stopPropagation();
                prefetchModal('profile');
                setModal({ type: 'profile', focus: 'register' });
            }}
        >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                    d="M8 1.2 14.8 13.5H1.2L8 1.2Z"
                    fill="#facc15"
                    stroke="#a16207"
                    strokeWidth="1.1"
                    strokeLinejoin="round"
                />
                <path d="M8 5.4v3.4" stroke="#713f12" strokeWidth="1.35" strokeLinecap="round" />
                <circle cx="8" cy="11.1" r="0.75" fill="#713f12" />
            </svg>
        </button>
    );
}
