/** Explicit consent before downloading Whisper or Piper (GDPR / ePrivacy). */

const WHISPER_CONSENT_KEY = 'arborito_sage_whisper_download_consent';
const PIPER_CONSENT_KEY = 'arborito_sage_piper_download_consent';

export function hasSageWhisperDownloadConsent() {
    try {
        return localStorage.getItem(WHISPER_CONSENT_KEY) === 'true';
    } catch (_) {
        return false;
    }
}

export function hasSagePiperDownloadConsent() {
    try {
        return localStorage.getItem(PIPER_CONSENT_KEY) === 'true';
    } catch (_) {
        return false;
    }
}

export function grantSageWhisperDownloadConsent() {
    try { localStorage.setItem(WHISPER_CONSENT_KEY, 'true'); } catch (_) {}
}

export function grantSagePiperDownloadConsent() {
    try { localStorage.setItem(PIPER_CONSENT_KEY, 'true'); } catch (_) {}
}

export function revokeSageVoiceDownloadConsent() {
    try {
        localStorage.removeItem(WHISPER_CONSENT_KEY);
        localStorage.removeItem(PIPER_CONSENT_KEY);
    } catch (_) {}
}
