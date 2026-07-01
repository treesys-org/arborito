import { useShellChrome } from '../hooks/useShellChrome.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

export function ModalLanguage() {
    const { ui, dismissModal, setLanguage, availableLanguages, lang } = useShellChrome();
    const mobile = shouldShowMobileUI();

    const close = () => dismissModal();

    const pickLang = async (code) => {
        if (!code) return;
        try {
            await setLanguage(code);
        } catch (e) {
            console.error('[Arborito] language modal setLanguage', e);
        }
        close();
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.languageTitle || 'Language'}
            tagClass="btn-close-language"
            onClose={close}
        />
    );

    return (
        <div data-arborito-panel="modal-language">
            <DockModalShell
                mobile={mobile}
                layout="dock-bottom"
                shellOpts={{ rootFlags: 'arborito-modal--language', panelRadius: '2xl' }}
                panelClass="arborito-modal-dock-panel w-full max-h-[85vh]"
                onBackdropClick={close}
                hero={hero}
            >
                <div className="px-4 pb-6 pt-2 flex flex-col gap-2 overflow-y-auto custom-scrollbar min-h-0 flex-1">
                    {(availableLanguages || []).map((l) => (
                        <button
                            key={l.code}
                            type="button"
                            className={`arborito-lang-pill w-full text-left px-4 py-3 rounded-xl font-semibold transition-colors flex items-center gap-3 ${
                                lang === l.code
                                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/50'
                                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                            }`}
                            onClick={() => pickLang(l.code)}
                        >
                            <ChromeEmoji emoji={l.flag || '🌐'} className="text-xl shrink-0" />
                            <span>{l.name}</span>
                        </button>
                    ))}
                </div>
            </DockModalShell>
        </div>
    );
}
