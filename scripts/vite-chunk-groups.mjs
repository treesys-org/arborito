/** Rollup manualChunks helpers — keep `vite.config.mjs` readable. */

/** Eager modal panels (see `src/app/components/eager-modals.js` + ModalHost onboarding/license). */
export const MODAL_EAGER_FILENAMES = [
    'DialogModal.jsx',
    'ProfileModal.jsx',
    'AboutModal.jsx',
    'LanguageModal.jsx',
    'PreviewModal.jsx',
    'CertificateViewModal.jsx',
    'EmptyModuleModal.jsx',
    'PrivacyModal.jsx',
    'CelebrationPrefsModal.jsx',
    'DownloadAppModal.jsx',
    'AccessibilityPrefsModal.jsx',
    'SecurityWarningModal.jsx',
    'LoadWarningModal.jsx',
    'TreeInfoModal.jsx',
    'MoveNodeModal.jsx',
    'PickCurriculumLangModal.jsx',
    'SyncLoginQrScannerModal.jsx',
    'RecoverAccountModal.jsx',
    'ConstructionAboutModal.jsx',
    'CreatorModerationAlertsModal.jsx',
    'OnboardingModal.jsx',
    'AuthorLicenseModal.jsx',
];

export function isModalEagerModule(id) {
    const norm = id.replace(/\\/g, '/');
    return MODAL_EAGER_FILENAMES.some(
        (name) => norm.includes(`/modals/${name}`) || norm.endsWith(`/${name}`)
    );
}

export function isFeatureSageModule(id) {
    const norm = id.replace(/\\/g, '/');
    return (
        norm.includes('/features/learning/modals/Sage') ||
        norm.includes('/features/learning/modals/hooks/useSage') ||
        norm.includes('/features/learning/modals/components/Sage') ||
        norm.includes('/features/learning/api/modals/logic/sage-')
    );
}

export function isFeatureTourModule(id) {
    return id.replace(/\\/g, '/').includes('/features/tour/');
}

export function resolveAppStoreChunk(id) {
    const norm = id.replace(/\\/g, '/');
    if (!norm.includes('/src/stores/')) return null;

    // Single chunk: store modules cross-import (react-state ↔ slices ↔ *-store-actions ↔
    // shell-ui). Splitting by domain creates circular chunk graphs Rollup cannot emit.
    return 'app-stores';
}

/**
 * @param {string} id
 * @returns {string | undefined}
 */
export function resolveManualChunk(id) {
    if (id.includes('/vendor/deps/') || id.includes('/vendor/nostr-tools/')) {
        return 'vendor-crypto';
    }

    const storeChunk = resolveAppStoreChunk(id);
    if (storeChunk) return storeChunk;

    if (isModalEagerModule(id)) return 'modal-eager';
    if (isFeatureSageModule(id)) return 'feature-sage';
    if (isFeatureTourModule(id)) return 'feature-tour';

    if (!id.includes('node_modules')) return undefined;

    if (
        /node_modules[/\\](react-dom|react|scheduler|use-sync-external-store)([/\\]|$)/.test(id)
    ) {
        return 'vendor-react';
    }
    return 'vendor';
}
