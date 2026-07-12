import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { SwitchRow } from '../../../shared/ui/SwitchRow.jsx';
import { getGamificationPrefs, setGamificationPref } from '../api/gamification-prefs.js';

export function ModalCelebrationPrefs({ embed = false }) {
    const { ui, dismissModal } = useGardenProgress();
    const mobile = embed ? true : shouldShowMobileUI();
    const [prefs, setPrefs] = useState(() => getGamificationPrefs());

    const close = () => {
        if (embed) return;
        dismissModal();
    };

    const title = ui.profileGardenPrefsGroup || 'Sonidos y animaciones';
    const soundLbl = ui.profileGardenSound || 'Sonidos';
    const soundHint = ui.profileGardenSoundHint || '';
    const soundOnAria = ui.profileGardenSoundOn || 'Activar sonidos';
    const soundOffAria = ui.profileGardenSoundOff || 'Silenciar sonidos';
    const effectsLbl = ui.profileGardenEffects || 'Animaciones';
    const effectsHint = ui.profileGardenEffectsHint || '';
    const effectsOnAria = ui.profileGardenEffectsOn || 'Activar animaciones';
    const effectsOffAria = ui.profileGardenEffectsOff || 'Desactivar animaciones';

    const togglePref = (key, next) => {
        setGamificationPref(key, next);
        setPrefs((p) => ({ ...p, [key]: next }));
    };

    const toggles = (
        <div className="divide-y divide-slate-100 dark:divide-slate-800" role="group" aria-label={title}>
            <SwitchRow
                id="celebration-pref-sound"
                label={soundLbl}
                hint={soundHint}
                checked={prefs.sound}
                onAria={soundOnAria}
                offAria={soundOffAria}
                onChange={(next) => togglePref('sound', next)}
            />
            <SwitchRow
                id="celebration-pref-effects"
                label={effectsLbl}
                hint={effectsHint}
                checked={prefs.effects}
                onAria={effectsOnAria}
                offAria={effectsOffAria}
                onChange={(next) => togglePref('effects', next)}
            />
        </div>
    );

    if (embed) {
        return (
            <div
                data-arborito-panel="modal-celebration-prefs"
                data-embed="1"
                className="arborito-celebration-embed-root flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-y-auto custom-scrollbar px-4 pt-2"
            >
                {toggles}
            </div>
        );
    }

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            titleTruncate
            titleId="celebration-prefs-title"
            leadingIcon="🔊"
            tagClass="btn-close"
            onClose={close}
        />
    );

    const body = (
        <div className="px-4 pb-6 pt-2 flex flex-col min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            {toggles}
        </div>
    );

    if (mobile) {
        return (
            <div data-arborito-panel="modal-celebration-prefs">
                <DockModalShell
                    mobile
                    sizeTier="COMPACT"
                    layout="dock-bottom"
                    shellOpts={{ rootFlags: 'arborito-modal--celebration-prefs', scrim: 'translucent' }}
                    panelClass="arborito-modal-dock-panel w-full max-h-[85vh]"
                    onBackdropClick={close}
                    hero={hero}
                >
                    {body}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-celebration-prefs">
            <ModalCenteredShell
                mobile={false}
                layout="centered"
                sizeTier="COMPACT"
                hero={hero}
                panelRadius="2xl"
                shellOpts={{
                    rootFlags: 'arborito-modal--celebration-prefs',
                    enter: 'fade-fast',
                    scrim: 'translucent',
                }}
                onBackdropClick={close}
            >
                {body}
            </ModalCenteredShell>
        </div>
    );
}
