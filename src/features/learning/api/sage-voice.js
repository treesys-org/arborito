/**
 * Sage voice: Piper/Whisper on desktop; system speechSynthesis on web.
 */
import { isElectronDesktop } from './electron-bridge.js';
import { hasSageWhisperDownloadConsent, hasSagePiperDownloadConsent } from './sage-voice-prefs.js';
import { resolvePreferPiperVoice } from './a11y-prefs.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { normalizeAppLangCode } from '../../../core/i18n.js';

const VOICE_LOCALE_KEY = 'arborito_sage_voice_locale';
const VOICE_AUTO_SPEAK_KEY = 'arborito_sage_voice_auto_speak';

/** @typedef {'de' | 'en' | 'es'} SageVoiceLocale */

/** Map app UI lang → Piper/Whisper locale (default follows the app, not Spanish). */
function voiceLocaleFromAppLang() {
    try {
        const code = normalizeAppLangCode(getArboritoStore()?.state?.lang || 'EN');
        if (code === 'ES') return 'es';
        if (code === 'DE') return 'de';
        return 'en';
    } catch {
        return 'en';
    }
}

/** @returns {SageVoiceLocale} */
export function resolveSageVoiceLocale() {
    try {
        const v = localStorage.getItem(VOICE_LOCALE_KEY);
        if (v === 'de' || v === 'en' || v === 'es') return v;
    } catch (_) {}
    return voiceLocaleFromAppLang();
}

/** @param {SageVoiceLocale} locale */
export function writeSageVoiceLocale(locale) {
    try {
        localStorage.setItem(
            VOICE_LOCALE_KEY,
            locale === 'de' || locale === 'en' || locale === 'es' ? locale : voiceLocaleFromAppLang()
        );
    } catch (_) {}
}

export function resolveSageVoiceAutoSpeak() {
    try {
        const v = localStorage.getItem(VOICE_AUTO_SPEAK_KEY);
        if (v === '1' || v === 'true') return true;
    } catch (_) {}
    return false;
}

export function writeSageVoiceAutoSpeak(enabled) {
    try {
        localStorage.setItem(VOICE_AUTO_SPEAK_KEY, enabled ? '1' : '0');
    } catch (_) {}
}

function sageVoiceBridge() {
    if (typeof window === 'undefined') return null;
    const e = window.arboritoElectron;
    return e && e.sageVoice ? e.sageVoice : null;
}

export function isSageVoiceAvailable() {
    return isElectronDesktop()
        && !!sageVoiceBridge()
        && typeof navigator !== 'undefined'
        && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function fetchSageVoiceAssetStatus(locale = resolveSageVoiceLocale()) {
    const bridge = sageVoiceBridge();
    if (!bridge || typeof bridge.assetStatus !== 'function') {
        return { ok: false, sttReady: false, ttsReady: false, needsDownload: true, needsTtsDownload: true };
    }
    try {
        return await bridge.assetStatus({ locale });
    } catch (_) {
        return { ok: false, sttReady: false, ttsReady: false, needsDownload: true, needsTtsDownload: true };
    }
}

export function sageVoiceNeedsDownloadConsent(assetStatus, { forTts = false, forMic = false } = {}) {
    if (forMic) {
        if (!assetStatus?.needsSttDownload) return false;
        return !hasSageWhisperDownloadConsent();
    }
    if (forTts) {
        if (!assetStatus?.needsTtsDownload) return false;
        return !hasSagePiperDownloadConsent();
    }
    return false;
}

/** Strip HTML / markdown / emoji noise before TTS. */
const EMOJI_FOR_SPEECH_RE = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*/gu;

function waitForWebSpeechVoices(timeoutMs = 2400) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        return Promise.resolve();
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) return Promise.resolve();
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            window.speechSynthesis.removeEventListener('voiceschanged', finish);
            resolve();
        };
        window.speechSynthesis.addEventListener('voiceschanged', finish);
        setTimeout(finish, timeoutMs);
    });
}

/** Unlock browser speechSynthesis during a user gesture (required by Chrome/Safari). */
export async function primeWebSpeechForBrowser() {
    if (isElectronDesktop()) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    await waitForWebSpeechVoices();
    try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(' ');
        utter.volume = 0;
        utter.rate = 10;
        window.speechSynthesis.speak(utter);
        window.speechSynthesis.cancel();
    } catch (_) {}
}

export function plainTextForSpeech(htmlOrText) {
    let t = String(htmlOrText || '');
    t = t.replace(/<img[^>]*>/gi, ' ');
    t = t.replace(/<br\s*\/?>/gi, '\n');
    t = t.replace(/<[^>]+>/g, '');
    t = t.replace(/```[\s\S]*?```/g, ' ');
    t = t.replace(/`([^`\n]+)`/g, '$1');
    t = t.replace(/\*\*(.*?)\*\*/g, '$1');
    t = t.replace(/__(.*?)__/g, '$1');
    t = t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
    t = t.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
    t = t.replace(/^\s*[-*•]\s+/gm, '');
    t = t.replace(/^\s*#+\s+/gm, '');
    t = t.replace(/\*{1,3}/g, '');
    t = t.replace(/_{1,3}/g, '');
    t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    t = t.replace(EMOJI_FOR_SPEECH_RE, ' ');
    t = t.replace(/[\u200B-\u200D\uFEFF]/g, '');
    t = t.replace(/\s{2,}/g, ' ');
    t = t.replace(/⚡[\s\S]*$/m, '').trim();
    return t.trim();
}

/** True when assistant text is safe to send to TTS (not an error bubble). */
export function isSpeakableAssistantText(text, rawText) {
    if (rawText === 'Error') return false;
    const src = String(text || '');
    if (/arborito-sage-error/i.test(src)) return false;
    if (/^\s*<(?:span|pre|div)/i.test(src.trim())) return false;
    return plainTextForSpeech(src).length > 0;
}

export function formatSageVoiceError(message, kind = 'mic', ui = null) {
    const raw = message && message.message ? message.message : String(message || '');
    const strings = ui || {};
    const lower = raw.toLowerCase();

    if (kind === 'mic') {
        if (!raw || /empty transcription|no speech|whisper produced no text|no text/i.test(lower)) {
            return strings.sageVoiceNoSound
                || strings.sageVoiceEmpty
                || 'No voice detected. Speak closer to the microphone and try again.';
        }
        if (/notallowed|permission denied|not allowed|denied/i.test(lower)) {
            return strings.sageVoiceMicDenied
                || 'Microphone permission denied. Enable it in system settings.';
        }
        if (/aborted/i.test(lower)) return '';
        if (/microphone error|error de micrófono/i.test(raw)) return raw;
        return strings.sageVoiceMicFail
            ? strings.sageVoiceMicFail.replace('{error}', raw)
            : raw;
    }

    if (!raw || /synthesis.?failed|not available|not-allowed|audio playback not supported/i.test(lower)) {
        return (
            strings.sageVoiceReadUnavailable ||
            strings.sageVoiceTtsWebHint ||
            'Could not read aloud. Check device volume or try the desktop app for enhanced voice.'
        );
    }
    const tpl = strings.sageVoiceTtsError || 'Voice error: {error}';
    return tpl.replace('{error}', raw);
}

export async function prefetchSageSttAssets() {
    const bridge = sageVoiceBridge();
    if (!bridge || typeof bridge.prefetchStt !== 'function') return { ok: false };
    sageVoice._beginVoiceOperation('processing', 'stt');
    try {
        const r = await bridge.prefetchStt({});
        if (!r || r.ok === false) {
            throw new Error((r && r.error) || 'STT download failed');
        }
        return r;
    } finally {
        sageVoice._endVoiceOperation();
    }
}

export async function prefetchSageTtsAssets(locale = resolveSageVoiceLocale()) {
    const bridge = sageVoiceBridge();
    if (!bridge || typeof bridge.prefetchTts !== 'function') return { ok: false };
    sageVoice._beginVoiceOperation('processing', 'tts');
    try {
        const r = await bridge.prefetchTts({ locale });
        if (!r || r.ok === false) {
            throw new Error((r && r.error) || 'TTS download failed');
        }
        return r;
    } finally {
        sageVoice._endVoiceOperation();
    }
}

export class SageVoiceController {
    constructor() {
        /** @type {'idle' | 'recording' | 'processing' | 'speaking'} */
        this.state = 'idle';
        this._mediaStream = null;
        this._recorder = null;
        this._chunks = [];
        this.onStateChange = null;
        this.onProgress = null;
        this._currentAudio = null;
        this._currentUtterance = null;
        this._progressBound = false;
        this.progressMessage = '';
        this.progressPct = 0;
        /** @type {'stt' | 'tts' | ''} */
        this.progressPhase = '';
        this._transcribeSession = 0;
        this._speakSession = 0;
        this._playbackCtx = null;
        this._playbackSource = null;
    }

    _beginVoiceOperation(state, phase = '') {
        this.progressPhase = phase || '';
        this.progressMessage = '';
        this.progressPct = 0;
        this._setState(state);
    }

    _endVoiceOperation() {
        this.progressMessage = '';
        this.progressPct = 0;
        this.progressPhase = '';
        if (this.state !== 'recording') this._setState('idle');
    }

    _setState(state) {
        this.state = state;
        if (typeof this.onStateChange === 'function') {
            try { this.onStateChange(state); } catch (_) {}
        }
    }

    _bindProgressOnce() {
        if (this._progressBound) return;
        const bridge = sageVoiceBridge();
        if (!bridge || typeof bridge.onProgress !== 'function') return;
        bridge.onProgress((data) => {
            if (data) {
                if (data.phase === 'stt' || data.phase === 'tts') {
                    this.progressPhase = data.phase;
                }
                const raw = String(data.message || '').trim();
                this.progressMessage = raw || '';
                if (typeof data.progress === 'number' && Number.isFinite(data.progress)) {
                    this.progressPct = Math.max(0, Math.min(100, Math.round(data.progress * 100)));
                }
            }
            if (typeof this.onProgress === 'function') {
                try { this.onProgress(data); } catch (_) {}
            }
        });
        this._progressBound = true;
    }

    async startRecording() {
        if (!isSageVoiceAvailable() || this.state !== 'idle') return false;
        this._chunks = [];
        this._bindProgressOnce();
        try {
            this._mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: true,
                },
                video: false,
            });
        } catch (e) {
            throw new Error(e && e.message ? e.message : 'Microphone permission denied');
        }
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
        this._recorder = mime ? new MediaRecorder(this._mediaStream, { mimeType: mime }) : new MediaRecorder(this._mediaStream);
        this._recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) this._chunks.push(ev.data);
        };
        this._recorder.start();
        this._setState('recording');
        return true;
    }

    _stopTracks() {
        if (this._mediaStream) {
            this._mediaStream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
        }
        this._mediaStream = null;
    }

    async stopRecordingOnly({ keepProcessing = false } = {}) {
        if (this.state !== 'recording') return null;
        if (keepProcessing) this._setState('processing');
        const recorder = this._recorder;
        const blob = await new Promise((resolve) => {
            if (!recorder) {
                resolve(null);
                return;
            }
            const finish = () => {
                const type = recorder.mimeType || 'audio/webm';
                resolve(this._chunks.length ? new Blob(this._chunks, { type }) : null);
            };
            recorder.onstop = finish;
            try {
                if (recorder.state === 'recording') {
                    if (typeof recorder.requestData === 'function') recorder.requestData();
                    recorder.stop();
                } else finish();
            } catch (_) {
                resolve(null);
            }
        });
        this._recorder = null;
        this._chunks = [];
        this._stopTracks();
        if (!keepProcessing) this._setState('idle');
        return blob;
    }

    async transcribeAudioBlob(blob) {
        const bridge = sageVoiceBridge();
        if (!blob || !bridge || typeof bridge.transcribeAudio !== 'function') {
            return { text: '', audioBlob: blob };
        }
        const session = ++this._transcribeSession;
        if (this.state !== 'processing') {
            this._setState('processing');
        }
        this.progressMessage = '';
        this.progressPct = 0;
        this._bindProgressOnce();
        try {
            const wavBlob = await blobToWav(blob);
            const buf = await wavBlob.arrayBuffer();
            if (buf.byteLength < 9600) {
                return { text: '', audioBlob: blob, tooShort: true };
            }
            if (session !== this._transcribeSession) {
                return { text: '', audioBlob: blob, aborted: true };
            }
            const base64 = arrayBufferToBase64(buf);
            const r = await bridge.transcribeAudio({
                mimeType: 'audio/wav',
                base64,
                locale: resolveSageVoiceLocale(),
            });
            if (session !== this._transcribeSession) {
                return { text: '', audioBlob: blob, aborted: true };
            }
            if (!r || !r.ok) {
                if (r && r.error === 'Aborted') {
                    return { text: '', audioBlob: blob, aborted: true };
                }
                throw new Error((r && r.error) || 'Whisper transcription failed');
            }
            const text = String(r.text || '').trim();
            return { text, audioBlob: blob };
        } finally {
            if (session === this._transcribeSession) {
                this.progressMessage = '';
                this.progressPct = 0;
                this._setState('idle');
            }
        }
    }

    async stopRecordingAndTranscribe() {
        if (this.state !== 'recording') return { text: '', audioBlob: null };
        const blob = await this.stopRecordingOnly({ keepProcessing: true });
        if (!blob) {
            this._setState('idle');
            return { text: '', audioBlob: null };
        }
        return this.transcribeAudioBlob(blob);
    }

    cancelRecording() {
        if (this._recorder && this._recorder.state !== 'inactive') {
            try { this._recorder.stop(); } catch (_) {}
        }
        this._recorder = null;
        this._chunks = [];
        this._stopTracks();
        this.stopSpeaking();
        this._setState('idle');
    }

    async abortProcessing() {
        this._transcribeSession = (this._transcribeSession || 0) + 1;
        this._speakSession = (this._speakSession || 0) + 1;
        const bridge = sageVoiceBridge();
        if (bridge && typeof bridge.abort === 'function') {
            try { await bridge.abort(); } catch (_) {}
        }
        this._stopPlaybackImmediate();
        this.progressMessage = '';
        this.progressPct = 0;
        this._setState('idle');
    }

    _stopPlaybackImmediate() {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            try { window.speechSynthesis.cancel(); } catch (_) {}
        }
        this._currentUtterance = null;
        if (this._playbackSource) {
            try { this._playbackSource.stop(); } catch (_) {}
            this._playbackSource = null;
        }
        if (this._playbackCtx) {
            try { this._playbackCtx.close(); } catch (_) {}
            this._playbackCtx = null;
        }
        if (this._currentAudio) {
            try {
                this._currentAudio.pause();
                this._currentAudio.src = '';
            } catch (_) {}
            this._currentAudio = null;
        }
    }

    stopSpeaking() {
        this._speakSession = (this._speakSession || 0) + 1;
        const bridge = sageVoiceBridge();
        if (bridge && typeof bridge.abortTts === 'function') {
            try { bridge.abortTts(); } catch (_) {}
        }
        this._stopPlaybackImmediate();
        if (this.state === 'speaking' || (this.state === 'processing' && this.progressPhase === 'tts')) {
            this.progressMessage = '';
            this.progressPct = 0;
            this.progressPhase = '';
            this._setState('idle');
        }
    }

    async _speakWithWebSpeech(text, locale = resolveSageVoiceLocale()) {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            return;
        }
        const lang = locale === 'de' ? 'de-DE' : locale === 'en' ? 'en-US' : 'es-ES';
        await waitForWebSpeechVoices();
        try {
            window.speechSynthesis.cancel();
        } catch (_) {}
        const chunks = String(text || '')
            .split(/(?<=[.!?…])\s+|\n+/u)
            .map((s) => s.trim())
            .filter(Boolean);
        const parts = chunks.length ? chunks : [String(text || '').trim()].filter(Boolean);
        for (const chunk of parts) {
            await this._speakWebSpeechChunk(chunk, lang);
        }
    }

    _speakWebSpeechChunk(text, lang) {
        return new Promise((resolve, reject) => {
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = lang;
            utter.rate = 1;
            const voices = window.speechSynthesis.getVoices();
            const voice =
                voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) ||
                voices.find((v) => v.default) ||
                voices[0];
            if (voice) utter.voice = voice;
            let settled = false;
            const finish = (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (err) reject(err);
                else resolve();
            };
            utter.onend = () => finish();
            utter.onerror = (e) => {
                const code = String(e?.error || '').toLowerCase();
                if (code === 'canceled' || code === 'interrupted') {
                    finish();
                    return;
                }
                finish(e.error || new Error('Speech synthesis failed'));
            };
            this._currentUtterance = utter;
            const start = () => {
                try {
                    window.speechSynthesis.speak(utter);
                    if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                    }
                } catch (e) {
                    finish(e);
                }
            };
            start();
            const timer = setTimeout(() => {
                if (settled) return;
                try {
                    window.speechSynthesis.resume();
                } catch (_) {}
                if (!settled && !window.speechSynthesis.speaking) {
                    start();
                }
            }, 120);
        });
    }

    async speak(text, locale = resolveSageVoiceLocale(), opts = {}) {
        const plain = plainTextForSpeech(text);
        if (!plain) return;
        const bridge = sageVoiceBridge();
        const forcePiper = !!opts.forcePiper;
        const session = ++this._speakSession;
        this._stopPlaybackImmediate();
        this._bindProgressOnce();
        this._beginVoiceOperation('processing', 'tts');

        try {
            const usePiper =
                bridge &&
                typeof bridge.synthesizeSpeech === 'function' &&
                (forcePiper || isElectronDesktop() || resolvePreferPiperVoice());
            if (!usePiper) {
                if (session !== this._speakSession) return;
                if (typeof window === 'undefined' || !window.speechSynthesis) return;
                this._setState('speaking');
                try {
                    await this._speakWithWebSpeech(plain, locale);
                } catch (e) {
                    if (!bridge) {
                        const lang = locale === 'de' ? 'de-DE' : locale === 'en' ? 'en-US' : 'es-ES';
                        try {
                            try {
                                window.speechSynthesis.cancel();
                            } catch (_) {}
                            await this._speakWebSpeechChunk(plain, lang);
                        } catch (_) {
                            /* Web-only: avoid error toast when browser TTS is blocked or flaky */
                        }
                        return;
                    }
                    throw e;
                }
                return;
            }
            const r = await bridge.synthesizeSpeech({ text: plain, locale });
            if (session !== this._speakSession) return;
            if (!r || !r.ok || !r.base64) {
                throw new Error((r && r.error) || 'Speech synthesis failed');
            }
            const bytes = base64ToUint8Array(r.base64);
            if (!bytes.length || bytes.length < 1000) {
                throw new Error('Invalid audio from Piper');
            }
            this._setState('speaking');
            this.progressMessage = '';
            this.progressPct = 0;
            await playWavBytes(bytes, this);
            if (session !== this._speakSession) return;
        } catch (e) {
            if (session !== this._speakSession) return;
            if (bridge && typeof bridge.synthesizeSpeech === 'function') {
                try {
                    this._setState('speaking');
                    await this._speakWithWebSpeech(plain, locale);
                    return;
                } catch (_) {}
            }
            throw e;
        } finally {
            if (session === this._speakSession) {
                this._currentAudio = null;
                this._currentUtterance = null;
                this._endVoiceOperation();
            }
        }
    }
}

async function playWavBytes(bytes, controller = null) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('Audio playback not supported');
    const ctx = new AudioCtx();
    if (controller) {
        controller._playbackCtx = ctx;
        controller._playbackSource = null;
    }
    try {
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        await new Promise((resolve, reject) => {
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.connect(ctx.destination);
            source.onended = () => resolve();
            if (controller) controller._playbackSource = source;
            try {
                source.start(0);
            } catch (e) {
                reject(e);
                return;
            }
            if (ctx.state === 'suspended') {
                ctx.resume().catch(reject);
            }
        });
    } catch (decodeErr) {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        const audio = new Audio(url);
        if (controller) controller._currentAudio = audio;
        try {
            await new Promise((resolve, reject) => {
                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    resolve();
                };
                audio.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(decodeErr || new Error('Audio playback failed'));
                };
                audio.play().catch(reject);
            });
        } catch (fallbackErr) {
            throw fallbackErr;
        }
    } finally {
        if (controller) {
            controller._playbackSource = null;
            controller._playbackCtx = null;
        }
        try { await ctx.close(); } catch (_) {}
    }
}

async function blobToWav(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        const mono = decoded.numberOfChannels > 1 ? mixToMono(decoded) : decoded.getChannelData(0);
        const resampled = resampleTo16k(mono, decoded.sampleRate);
        const padded = appendSilenceTail(resampled, 16000, 450);
        return encodeWav(padded, 16000);
    } finally {
        try { await audioCtx.close(); } catch (_) {}
    }
}

function appendSilenceTail(samples, sampleRate, ms = 450) {
    if (!samples || !samples.length) return samples;
    const extra = Math.max(0, Math.round((sampleRate * ms) / 1000));
    if (!extra) return samples;
    const out = new Float32Array(samples.length + extra);
    out.set(samples, 0);
    return out;
}

function resampleTo16k(samples, sampleRate) {
    const targetRate = 16000;
    if (!samples || !samples.length) return new Float32Array(0);
    if (sampleRate === targetRate) return samples;
    const ratio = sampleRate / targetRate;
    const outLen = Math.max(1, Math.round(samples.length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
        const srcIdx = i * ratio;
        const idx = Math.floor(srcIdx);
        const frac = srcIdx - idx;
        const a = samples[idx] || 0;
        const b = samples[Math.min(idx + 1, samples.length - 1)] || 0;
        out[i] = a + (b - a) * frac;
    }
    return out;
}

function mixToMono(audioBuffer) {
    const len = audioBuffer.length;
    const out = new Float32Array(len);
    const ch = audioBuffer.numberOfChannels;
    for (let c = 0; c < ch; c++) {
        const data = audioBuffer.getChannelData(c);
        for (let i = 0; i < len; i++) out[i] += data[i] / ch;
    }
    return out;
}

function encodeWav(samples, sampleRate) {
    const numSamples = samples.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true);
    let offset = 44;
    for (let i = 0; i < numSamples; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
}

function writeAscii(view, offset, text) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

export const sageVoice = new SageVoiceController();
