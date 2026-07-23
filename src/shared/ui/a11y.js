/**
 * App-wide accessibility helpers: live region announcer, skip link, route announcements.
 */

import { getArboritoStore } from '../../core/store-singleton.js';
import { resolveAnnounceUiChanges } from '../../features/learning/api/a11y-prefs.js';

function store() {
    return getArboritoStore();
}

let announcerEl = null;
let skipLinkEl = null;
let lastAnnounced = '';
let lastContextKey = '';

export function announce(message, { assertive = false } = {}) {
    const text = String(message || '').trim();
    if (!text || text === lastAnnounced) return;
    lastAnnounced = text;
    const el = announcerEl || document.getElementById('arborito-announcer');
    if (!el) return;
    el.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
    el.textContent = '';
    requestAnimationFrame(() => {
        el.textContent = text;
    });
}

function syncSkipLink() {
    const link = skipLinkEl || document.getElementById('arborito-skip-link');
    if (!link) return;
    const ui = store()?.ui || {};
    link.textContent = ui.skipToMain || 'Skip to main content';
}

function announceFromStore() {
    if (!resolveAnnounceUiChanges()) return;
    const ui = store()?.ui || {};
    const { modal, selectedNode, viewMode } = store()?.value || {};

    let key = 'home';
    let message = '';

    if (modal && (modal === 'sage' || modal.type === 'sage')) {
        key = 'modal:sage';
        message = ui.a11yOpenedSage || ui.navSage || 'Sage';
    } else if (modal) {
        const type = typeof modal === 'string' ? modal : modal.type;
        key = `modal:${type}`;
        if (type === 'search') message = ui.navSearch || 'Search';
        else if (type === 'profile') message = ui.navProfile || 'Profile';
        else if (type === 'accessibility-prefs') message = ui.a11yPrefsTitle || 'Accessibility';
    } else if (viewMode === 'certificates') {
        key = 'view:certificates';
        message = ui.certificatesTitle || 'Certificates';
    } else if (selectedNode && (selectedNode.type === 'leaf' || selectedNode.type === 'exam')) {
        key = `lesson:${selectedNode.id}`;
        const name = selectedNode.name || ui.defaultLessonName || 'Lesson';
        message = String(ui.a11yOpenedLesson || 'Lesson: {name}').replace('{name}', name);
    }

    if (!message || key === lastContextKey) return;
    lastContextKey = key;
    announce(message);
}

export function initA11y() {
    if (typeof document === 'undefined') return;
    try {
        _initA11yCore();
    } catch (e) {
        console.warn('[Arborito] accessibility init skipped', e);
    }
}

function _initA11yCore() {
    if (!document.getElementById('arborito-announcer')) {
        announcerEl = document.createElement('div');
        announcerEl.id = 'arborito-announcer';
        announcerEl.className = 'sr-only';
        announcerEl.setAttribute('aria-live', 'polite');
        announcerEl.setAttribute('aria-atomic', 'true');
        document.body.appendChild(announcerEl);
    } else {
        announcerEl = document.getElementById('arborito-announcer');
    }

    skipLinkEl = document.getElementById('arborito-skip-link');
    syncSkipLink();

    const s = store();
    if (!s) return;
    s.addEventListener('state-change', () => {
        try {
            syncSkipLink();
            announceFromStore();
        } catch (e) {
            console.warn('[Arborito] accessibility announce skipped', e);
        }
    });
    s.addEventListener('arborito-modal-change', () => {
        try {
            announceFromStore();
        } catch (e) {
            console.warn('[Arborito] accessibility announce skipped', e);
        }
    });

    const main = document.getElementById('main-content');
    if (main && skipLinkEl) {
        skipLinkEl.addEventListener('click', () => {
            requestAnimationFrame(() => {
                try { main.focus({ preventScroll: true }); } catch (_) {}
            });
        });
    }
}
