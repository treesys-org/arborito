/** Bumps when author-facing legal text changes; users must accept again. */
const AUTHOR_LICENSE_VERSION = 'cc-by-sa-4.0-arborito-v1';
const AUTHOR_LICENSE_STORAGE_KEY = 'arborito-author-license-accepted';

/** Author license (CC) overlay + acceptance persistence. */
export const storeLicenseMethods = {
    /** CC legal text shown on top of the current modal (Trees, welcome, …). */
    openAuthorLicenseOverlay(extra = {}) {
        this.update({ modalOverlay: { type: 'author-license', ...extra } });
    },

    /** Closes the license overlay; the main modal (welcome, Trees, …) remains as it was underneath. */
    closeAuthorLicenseOverlay() {
        this.update({ modalOverlay: null });
    },

    hasAcceptedAuthorLicense() {
        try {
            return localStorage.getItem(AUTHOR_LICENSE_STORAGE_KEY) === AUTHOR_LICENSE_VERSION;
        } catch {
            return false;
        }
    },

    acceptAuthorLicense() {
        try {
            localStorage.setItem(AUTHOR_LICENSE_STORAGE_KEY, AUTHOR_LICENSE_VERSION);
        } catch {
            /* ignore */
        }
    },

    cancelAuthorLicenseModal() {
        if (this.state.modalOverlay?.type === 'author-license') {
            this.closeAuthorLicenseOverlay();
            return;
        }
        this.dismissModal();
    }
};
