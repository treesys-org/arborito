/**
 * Shared Piper TTS download consent for accessibility and other non-Sage entry points.
 */
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { isElectronDesktop } from './electron-bridge.js';
import {
    fetchSageVoiceAssetStatus,
    sageVoiceNeedsDownloadConsent,
    prefetchSageTtsAssets,
    resolveSageVoiceLocale,
    formatSageVoiceError,
} from './sage-voice.js';
import { grantSagePiperDownloadConsent } from './sage-voice-prefs.js';

/**
 * When enabling read-aloud on desktop, ensure Piper is allowed and prefetched.
 * @returns {Promise<boolean>} true if the feature can be enabled
 */
export async function ensureDesktopTtsBeforeEnable(ui = store.ui) {
    if (!isElectronDesktop()) return true;
    const status = await fetchSageVoiceAssetStatus(resolveSageVoiceLocale());
    if (!status?.needsTtsDownload) return true;

    if (sageVoiceNeedsDownloadConsent(status, { forTts: true })) {
        const estMb = status?.piperVoiceEstMb || 20;
        const body =
            ui.sageVoiceDownloadConsentBody ||
            `Downloads a local voice for your locale (~${estMb} MB). Only when you use read-aloud. Continue?`;
        const ok = await store.confirm(
            body,
            ui.sageVoiceDownloadConsentTitle || 'Enable local voice?',
            false
        );
        if (!ok) return false;
        grantSagePiperDownloadConsent();
    }

    try {
        store.notify(ui.sageVoiceDownloadProgress || 'Downloading local voice…', false);
        await prefetchSageTtsAssets(resolveSageVoiceLocale());
        return true;
    } catch (e) {
        store.alert(formatSageVoiceError(e, 'tts', ui));
        return false;
    }
}
