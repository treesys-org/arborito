import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { getCurriculumLangPreset } from '../api/curriculum-locale-presets.js';

/** Pill list for curriculum languages — Twemoji flags (native `<select>` cannot render them). */
export function CurriculumLangPicker({
    langKeys,
    value,
    onChange,
    canAdd,
    addLabel,
    onPickAdd,
    compact = false,
    className = '',
    ariaLabel,
}) {
    const keys = Array.isArray(langKeys) ? langKeys : [];

    return (
        <div
            className={`arborito-curriculum-lang-picker flex flex-col gap-2 ${className}`.trim()}
            role="listbox"
            aria-label={ariaLabel}
        >
            {keys.map((k) => {
                const preset = getCurriculumLangPreset(k);
                const active = value === k;
                return (
                    <button
                        key={k}
                        type="button"
                        role="option"
                        aria-selected={active ? 'true' : 'false'}
                        className={`arborito-lang-pill w-full text-left rounded-xl font-semibold transition-colors flex items-center gap-3 ${
                            compact ? 'px-3 py-2' : 'px-4 py-3'
                        } ${
                            active
                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/50'
                                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                        }`}
                        onClick={() => onChange?.(k)}
                    >
                        <ChromeEmoji emoji={preset?.flag || '🌐'} className="shrink-0" size={compact ? 18 : 22} />
                        <span className="font-mono text-sm shrink-0">{k}</span>
                        {preset?.label ? (
                            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 truncate min-w-0">
                                {preset.label}
                            </span>
                        ) : null}
                    </button>
                );
            })}
            {canAdd ? (
                <button
                    type="button"
                    className={`arborito-lang-pill w-full text-left rounded-xl font-semibold transition-colors flex items-center gap-3 border border-dashed border-emerald-400/60 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 ${
                        compact ? 'px-3 py-2' : 'px-4 py-3'
                    }`}
                    onClick={() => onPickAdd?.()}
                >
                    <span className="text-lg leading-none shrink-0" aria-hidden="true">
                        +
                    </span>
                    <span>{addLabel}</span>
                </button>
            ) : null}
        </div>
    );
}
