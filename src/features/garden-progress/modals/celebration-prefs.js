import { store } from '../../../core/store.js';
import { bindMobileTap, bindCloseTaps } from '../../../shared/ui/mobile-tap.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { escHtml, escAttr } from '../../../shared/lib/html-escape.js';
import { getGamificationPrefs, setGamificationPref } from '../gamification-prefs.js';

/**
 * "Sonidos y animaciones" preferences modal.
 *
 * Extracted from the Profile modal so the identity-centric Profile sheet stays focused.
 * Lives under the "Más" sheet (mobile) and the desktop profile popover, and persists to
 * the same `arborito-gamification-prefs` localStorage key the Profile sheet used to.
 *
 * Layout matches the canonical small-modal pattern: fullbleed on mobile (dock layout so
 * the hero hugs the viewport edges + the back chevron is reachable), narrow auto-height
 * card on desktop. The rows render with self-contained Tailwind utilities — the previous
 * version relied on `profile-modal.css`'s `.profile-sheet--mobile .profile-pref` overrides
 * which only kick in inside the Profile sheet (so switches looked cramped here).
 */
class ArboritoModalCelebrationPrefs extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.dismissModal();
    }

    render() {
        const ui = store.ui;
        const prefs = getGamificationPrefs();
        const mobile = shouldShowMobileUI();

        const title = ui.profileGardenPrefsGroup || 'Sonidos y animaciones';
        const soundLbl = ui.profileGardenSound || 'Sonidos';
        const soundHint = ui.profileGardenSoundHint || '';
        const soundOnAria = ui.profileGardenSoundOn || 'Activar sonidos';
        const soundOffAria = ui.profileGardenSoundOff || 'Silenciar sonidos';
        const effectsLbl = ui.profileGardenEffects || 'Animaciones';
        const effectsHint = ui.profileGardenEffectsHint || '';
        const effectsOnAria = ui.profileGardenEffectsOn || 'Activar animaciones';
        const effectsOffAria = ui.profileGardenEffectsOff || 'Desactivar animaciones';

        /* Row uses justify-between so the toggle hugs the right edge and the label keeps
         * its own column — works the same on a 360px phone and on the narrow desktop card. */
        const prefRow = (id, label, hint, value, onAria, offAria) => `
            <div class="flex items-start justify-between gap-4 py-3">
                <div class="min-w-0 flex-1">
                    <p class="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">${escHtml(label)}</p>
                    ${hint ? `<p class="m-0 mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">${escHtml(hint)}</p>` : ''}
                </div>
                <button type="button" id="${id}" class="arborito-switch shrink-0 mt-0.5" role="switch" aria-checked="${value ? 'true' : 'false'}" aria-label="${escAttr(value ? offAria : onAria)}"></button>
            </div>`;

        /* `mobile: true` forces the canonical "More sub-pane" hero wrap
         * (`arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero`) on desktop too — same
         * pattern as tree-info / sources / about / language / certificates. That wrap paints
         * the header background edge-to-edge inside the panel; without it desktop falls back
         * to `arborito-float-modal-head` which only sets inner padding and leaves the panel
         * radius visible above the header (looked like the hero didn't "fill" the borders). */
        const body = `
                ${modalHeroHtml(ui, {
                    mobile: true,
                    title,
                    titleTruncate: true,
                    leadingIcon: '<span class="text-2xl shrink-0" aria-hidden="true">🔊</span>',
                    tagClass: 'btn-close',
                    trailingSpacer: true,
                    showClose: !mobile,
                })}

                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6 pt-4 pb-6">
                    <div class="divide-y divide-slate-100 dark:divide-slate-800" role="group" aria-label="${escAttr(title)}">
                        ${prefRow('celebration-pref-sound', soundLbl, soundHint, prefs.sound, soundOnAria, soundOffAria)}
                        ${prefRow('celebration-pref-effects', effectsLbl, effectsHint, prefs.effects, effectsOnAria, effectsOffAria)}
                    </div>
                </div>`;

        this.innerHTML = modalShellHtml({
            bodyHtml: body,
            mobile,
            layout: 'dock',
            panelRadius: mobile ? 'none' : '2xl',
            panelSize: mobile ? undefined : 'narrow auto-h',
        });

        bindCloseTaps(this, () => this.close());

        const wirePrefSwitch = (btn, key, labelOn, labelOff) => {
            if (!btn) return;
            const update = (next) => {
                btn.setAttribute('aria-checked', next ? 'true' : 'false');
                btn.setAttribute('aria-label', next ? labelOff : labelOn);
            };
            bindMobileTap(btn, () => {
                const current = btn.getAttribute('aria-checked') === 'true';
                const next = !current;
                setGamificationPref(key, next);
                update(next);
            });
        };
        wirePrefSwitch(
            this.querySelector('#celebration-pref-sound'),
            'sound',
            soundOnAria,
            soundOffAria
        );
        wirePrefSwitch(
            this.querySelector('#celebration-pref-effects'),
            'effects',
            effectsOnAria,
            effectsOffAria
        );
    }
}
customElements.define('arborito-modal-celebration-prefs', ArboritoModalCelebrationPrefs);
