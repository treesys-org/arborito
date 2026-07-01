import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { getGamificationPrefs, setGamificationPref } from '../api/gamification-prefs.js';

function PrefSwitch({ id, label, hint, value, onAria, offAria, onToggle }) {
    return (
        <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">{label}</p>
                {hint ? <p className="m-0 mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{hint}</p> : null}
            </div>
            <button
                type="button"
                id={id}
                className="arborito-switch shrink-0 mt-0.5"
                role="switch"
                aria-checked={value ? 'true' : 'false'}
                aria-label={value ? offAria : onAria}
                onClick={onToggle}
            />
        </div>
    );
}

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

    const togglePref = (key) => {
        const next = !prefs[key];
        setGamificationPref(key, next);
        setPrefs((p) => ({ ...p, [key]: next }));
    };

    const body = (
        <div
            className={`divide-y divide-slate-100 dark:divide-slate-800${embed ? ' px-4 pt-2' : ''}`}
            role="group"
            aria-label={title}
        >
            <PrefSwitch
                id="celebration-pref-sound"
                label={soundLbl}
                hint={soundHint}
                value={prefs.sound}
                onAria={soundOnAria}
                offAria={soundOffAria}
                onToggle={() => togglePref('sound')}
            />
            <PrefSwitch
                id="celebration-pref-effects"
                label={effectsLbl}
                hint={effectsHint}
                value={prefs.effects}
                onAria={effectsOnAria}
                offAria={effectsOffAria}
                onToggle={() => togglePref('effects')}
            />
        </div>
    );

    if (embed) {
        return (
            <div
                data-arborito-panel="modal-celebration-prefs"
                data-embed="1"
                className="arborito-celebration-embed-root flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-y-auto custom-scrollbar"
            >
                {body}
            </div>
        );
    }

    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="COMPACT"
            onBackdropClick={close}
            hero={
                <ModalHubHero
                    ui={ui}
                    mobile={mobile}
                    title={title}
                    titleTruncate
                    leadingIcon={<ChromeEmoji emoji="🔊" size={24} />}
                    tagClass="btn-close"
                    onClose={close}
                />
            }
        >
            {body}
        </DockModalShell>
    );
}
