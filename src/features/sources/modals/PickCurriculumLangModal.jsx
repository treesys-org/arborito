import { useSources } from '../hooks/useSources.js';
import { useEffect } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';
import { CURRICULUM_LOCALE_PRESETS } from '../api/curriculum-locale-presets.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

export function ModalPickCurriculumLang() {
    const sources = useSources();
    const { ui, dismissModal, rawGraphData, applyCurriculumPresetLanguage } = sources;
    const mobile = shouldShowMobileUI();
    const close = () => dismissModal();

    const existing = rawGraphData?.languages && typeof rawGraphData.languages === 'object'
        ? new Set(Object.keys(rawGraphData.languages))
        : new Set();
    const available = CURRICULUM_LOCALE_PRESETS.filter((p) => !existing.has(p.code));

    const title = ui.pickCurriculumLangTitle || ui.addCurriculumLangTitle || 'Add curriculum language';
    const subtitle =
        ui.pickCurriculumLangSubtitle ||
        ui.addCurriculumLangBody ||
        'Choose a language. The folder structure is copied from the one you are editing now.';

    useEffect(() => {
        document.documentElement.classList.add('arborito-language-modal-open');
        return () => document.documentElement.classList.remove('arborito-language-modal-open');
    }, []);

    const pick = (code) => {
        if (applyCurriculumPresetLanguage(code)) {
            dismissModal();
        }
    };

    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="STANDARD"
            shellOpts={{ scrim: 'translucent' }}
            hero={
                <ModalHero
                    ui={ui}
                    mobile={mobile}
                    title={title}
                    subtitle={mobile ? subtitle : undefined}
                    backTagClass="btn-pick-lang-back"
                    closeTagClass="btn-pick-lang-x"
                    extraWrapClassDesktop="border-b border-slate-100 dark:border-slate-800"
                    onBack={close}
                    onClose={close}
                />
            }
        >
            {!mobile ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 px-4 pt-3 leading-relaxed">{subtitle}</p>
            ) : null}
            <div className="arborito-mob-scroll-pane custom-scrollbar">
                {available.length === 0 ? (
                    <p className="arborito-empty py-8 px-4">
                        {ui.pickCurriculumLangAllPresent || 'Every preset language is already in this tree.'}
                    </p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4 pt-2">
                        {available.map((p) => (
                            <button
                                key={p.code}
                                type="button"
                                className="pick-lang-btn flex flex-col items-center gap-1 p-3 rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors text-center min-h-[5.5rem] justify-center"
                                onClick={(ev) => {
                                    ev.stopPropagation();
                                    pick(p.code);
                                }}
                            >
                                <ChromeEmoji emoji={p.flag || '🌐'} className="text-2xl shrink-0" size={28} />
                                <span className="arborito-eyebrow">{p.code}</span>
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight line-clamp-2">{p.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </DockModalShell>
    );
}
