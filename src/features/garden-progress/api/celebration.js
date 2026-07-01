/**
 * Central feedback bus: optional CSS burst + synthesized sound.
 * Call sites stay thin; prefs + prefers-reduced-motion respected.
 */

import { getGamificationPrefs } from './gamification-prefs.js';
import { playSound } from './sound.js';

const EFFECT_CLASS = {
    'leaf-done': 'arborito-celebrate--leaf',
    water: 'arborito-celebrate--water',
    'daily-goal': 'arborito-celebrate--goal',
    purchase: 'arborito-celebrate--coin',
    streak: 'arborito-celebrate--streak',
    'seed-collected': 'arborito-celebrate--seed',
    'streak-shield': 'arborito-celebrate--shield'
};

/** @returns {HTMLElement|null} */
function ensureOverlay() {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('arborito-celebrate-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'arborito-celebrate-overlay';
        el.className = 'arborito-celebrate-overlay';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
    }
    return el;
}

/** @param {string} type */
function showEffect(type) {
    const overlay = ensureOverlay();
    if (!overlay) return;
    const cls = EFFECT_CLASS[type] || 'arborito-celebrate--leaf';
    overlay.className = `arborito-celebrate-overlay ${cls} arborito-celebrate-overlay--active`;
    window.clearTimeout(showEffect._t);
    showEffect._t = window.setTimeout(() => {
        overlay.classList.remove('arborito-celebrate-overlay--active');
    }, 1400);
}

/**
 * @param {string} type
 * @param {{ silent?: boolean }} [opts]
 */
export function celebrate(type, opts = {}) {
    const prefs = getGamificationPrefs();
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!opts.silent && prefs.effects !== false && !reduced) {
        showEffect(type);
    }
    if (!opts.silent && prefs.sound !== false) {
        playSound(type);
    }
}
