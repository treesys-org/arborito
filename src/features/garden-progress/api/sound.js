/**
 * Lightweight synthesized SFX (no external assets). Respects mute pref + autoplay policy.
 */

/** @type {AudioContext|null} */
let ctx = null;

function getCtx() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null;
    if (!ctx) {
        const Ctx = AudioContext || webkitAudioContext;
        ctx = new Ctx();
    }
    return ctx;
}

/** @param {number} freq @param {number} dur @param {'sine'|'triangle'} [type] @param {number} [vol] */
function tone(freq, dur, type = 'sine', vol = 0.08) {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + dur + 0.02);
}

const SFX = {
    'leaf-done': () => {
        tone(523, 0.12, 'sine', 0.06);
        setTimeout(() => tone(659, 0.14, 'sine', 0.05), 80);
    },
    water: () => {
        tone(440, 0.08, 'triangle', 0.04);
        setTimeout(() => tone(330, 0.1, 'triangle', 0.035), 60);
    },
    'daily-goal': () => {
        [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'sine', 0.055), i * 90));
    },
    purchase: () => {
        tone(880, 0.07, 'triangle', 0.045);
        setTimeout(() => tone(1047, 0.1, 'triangle', 0.04), 70);
    },
    streak: () => {
        tone(392, 0.1, 'sine', 0.05);
        setTimeout(() => tone(494, 0.12, 'sine', 0.05), 100);
    },
    'seed-collected': () => {
        tone(587, 0.11, 'sine', 0.05);
        setTimeout(() => tone(740, 0.13, 'sine', 0.045), 90);
    },
    'streak-shield': () => {
        tone(349, 0.14, 'triangle', 0.04);
    }
};

/** @param {keyof typeof SFX|string} type */
export function playSound(type) {
    try {
        const fn = SFX[type];
        if (fn) fn();
    } catch {
        /* autoplay blocked or no audio */
    }
}
