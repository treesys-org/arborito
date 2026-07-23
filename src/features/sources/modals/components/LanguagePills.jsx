import { useSources } from '../../hooks/useSources.js';
import { AVAILABLE_LANGUAGES } from '../../../../core/i18n.js';
import { getCurriculumLangPreset } from '../../api/curriculum-locale-presets.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';

const uiLangByCode = new Map(
    (Array.isArray(AVAILABLE_LANGUAGES) ? AVAILABLE_LANGUAGES : []).map((l) => [
        String(l.code || '').toUpperCase(),
        l,
    ])
);

function resolveLangPillMeta(code) {
    const key = String(code || '').trim().toUpperCase();
    const preset = getCurriculumLangPreset(key);
    if (preset) {
        return { flag: preset.flag || '🌐', label: preset.label || key };
    }
    const ui = uiLangByCode.get(key);
    if (ui) {
        return { flag: ui.flag || '🌐', label: ui.nativeName || ui.name || key };
    }
    return { flag: '🌐', label: key };
}

export function LanguagePills({ langCodes }) {
    const { lang } = useSources();
    const codes = Array.from(
        new Set(
            (Array.isArray(langCodes) ? langCodes : [])
                .map((c) => String(c || '').trim().toUpperCase())
                .filter(Boolean)
        )
    );
    if (!codes.length) return null;

    const active = String(lang || '').toUpperCase();

    return (
        <>
            {codes.map((code) => {
                const m = resolveLangPillMeta(code);
                const isActive = code === active;
                const cls = isActive
                    ? 'arborito-pill arborito-pill--xs arborito-pill--emerald arborito-pill--bordered inline-flex items-center gap-1'
                    : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
                return (
                    <span key={code} className={cls} title={m.label}>
                        <ChromeEmoji emoji={m.flag} size={12} className="shrink-0" />
                        <span>{code}</span>
                    </span>
                );
            })}
        </>
    );
}
