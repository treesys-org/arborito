/**
 * App-wide read-aloud, uses Sage voice stack (Piper on desktop, speechSynthesis fallback).
 */
import { sageVoice, plainTextForSpeech, resolveSageVoiceLocale, formatSageVoiceError } from './sage-voice.js';
import { resolveReadAloudLessons } from './a11y-prefs.js';
import { isElectronDesktop } from './electron-bridge.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { ensureDesktopTtsBeforeEnable } from './sage-voice-consent-flow.js';

export async function speakText(text, locale = resolveSageVoiceLocale()) {
    const plain = plainTextForSpeech(text);
    if (!plain) return;
    if (!isElectronDesktop() && typeof window !== 'undefined' && !window.speechSynthesis) {
        return;
    }
    if (isElectronDesktop()) {
        const ok = await ensureDesktopTtsBeforeEnable(getArboritoStore()?.ui);
        if (!ok) return;
        try {
            await sageVoice.speak(plain, locale, { forcePiper: true });
        } catch (e) {
            throw new Error(formatSageVoiceError(e, 'tts', getArboritoStore()?.ui));
        }
        return;
    }
    await sageVoice.speak(plain, locale);
}

export function stopSpeaking() {
    sageVoice.stopSpeaking();
}

export function isReadAloudActive() {
    const s = sageVoice.state;
    return s === 'speaking' || (s === 'processing' && sageVoice.progressPhase === 'tts');
}

export async function readLessonSectionIfEnabled(sectionText) {
    if (!resolveReadAloudLessons()) return;
    await speakText(sectionText);
}

/** Extract visible text from a lesson section container. */
export function textFromLessonSectionEl(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, [aria-hidden="true"]').forEach((n) => n.remove());
    return clone.textContent || '';
}
