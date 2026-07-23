import { isElectronDesktop } from './electron-bridge.js';
import { isDesktopLlamacppBridgePresent } from './ai-llamacpp-bridge.js';

/** User opted into optional / experimental Sage AI (Art. 6(1)(a), not required for the app). */
export const SAGE_EXPERIMENTAL_CONSENT_KEY = 'arborito-ai-consent';

/** User consented to download model weights from Hugging Face (one-time, device-local). */
export const SAGE_DOWNLOAD_CONSENT_KEY = 'arborito-ai-download-consent';

export function hasSageExperimentalConsent() {
    try {
        return localStorage.getItem(SAGE_EXPERIMENTAL_CONSENT_KEY) === 'true';
    } catch {
        return false;
    }
}

export function hasSageDownloadConsent() {
    try {
        return localStorage.getItem(SAGE_DOWNLOAD_CONSENT_KEY) === 'true';
    } catch {
        return false;
    }
}

/** Native GGUF download, browser Expert API does not pull weights from Hugging Face. */
export function needsSageModelDownloadConsent() {
    return isElectronDesktop() || isDesktopLlamacppBridgePresent();
}

export function hasSageAiConsentForInit() {
    if (!hasSageExperimentalConsent()) return false;
    if (needsSageModelDownloadConsent() && !hasSageDownloadConsent()) return false;
    return true;
}

export function grantSageExperimentalConsent() {
    try {
        localStorage.setItem(SAGE_EXPERIMENTAL_CONSENT_KEY, 'true');
    } catch {
        /* noop */
    }
}

export function grantSageDownloadConsent() {
    try {
        localStorage.setItem(SAGE_DOWNLOAD_CONSENT_KEY, 'true');
    } catch {
        /* noop */
    }
}

/** Revoke Hugging Face download consent so the GDPR download step is shown again. */
export function revokeSageDownloadConsent() {
    try {
        localStorage.removeItem(SAGE_DOWNLOAD_CONSENT_KEY);
    } catch {
        /* noop */
    }
}

export function revokeSageAiConsents() {
    try {
        localStorage.removeItem(SAGE_EXPERIMENTAL_CONSENT_KEY);
        localStorage.removeItem(SAGE_DOWNLOAD_CONSENT_KEY);
        localStorage.removeItem('arborito-sage-ai-mode');
    } catch {
        /* noop */
    }
}
