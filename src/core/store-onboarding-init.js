import { bootStubForLang } from '../stores/shell-store.js';
import { loadPersistedAuthSession } from '../features/identity-auth/api/auth-session-persist.js';

function hasCertificateShareInUrl() {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location.search);
        return params.has('cert') || params.has('certModule');
    } catch {
        return false;
    }
}

/** Onboarding + returning-user wizard routing at cold start. */
export const storeOnboardingInitMethods = {
    async initialize() {
        let seen = true;
        try {
            seen = localStorage.getItem('arborito-onboarding-seen-v1') === 'true';
        } catch {
            /* ignore */
        }

        /*
         * Shared diploma links: skip auto-opening onboarding so the certificate
         * can show first. Closing the diploma restores onboarding when needed.
         */
        const deferOnboardingForCertShare = !seen && hasCertificateShareInUrl();

        if (!this.state.modal && !seen && !deferOnboardingForCertShare) {
            if (typeof document !== 'undefined') {
                document.documentElement.classList.add('arborito-onboarding-boot');
            }
            if (!this.state.i18nData) {
                this.update({ i18nData: bootStubForLang(this.state.lang) });
            }
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => {
                    this.setModal({ type: 'onboarding' });
                });
            } else {
                this.setModal({ type: 'onboarding' });
            }
            return;
        }

        await this.loadLanguage(this.state.lang);

        if (!this.state.modal) {
            if (!seen) {
                return;
            }
            const signedIn =
                !!(this.isSignedIn && this.isSignedIn()) ||
                !!String(loadPersistedAuthSession()?.username || '').trim();
            const branches = this.userStore?.state?.branches || [];
            let hasActiveSourcePointer = false;
            try {
                hasActiveSourcePointer = !!localStorage.getItem('arborito-active-source-id');
            } catch {
                /* ignore */
            }
            const needsSessionStep =
                !signedIn && branches.length === 0 && !hasActiveSourcePointer;
            if (needsSessionStep) {
                setTimeout(() => this.setModal({ type: 'onboarding', step: 2 }), 60);
                return;
            }
        }
    },
};
