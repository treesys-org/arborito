import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { getCurriculumLangPreset } from '../api/curriculum-locale-presets.js';

function langPillClass(active, compact) {
    return `arborito-lang-pill w-full rounded-xl font-semibold transition-colors flex items-center gap-2 ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
    } ${
        active
            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/50'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
    }`;
}

/** Pill list for curriculum languages, Twemoji flags (native `<select>` cannot render them). */
export function CurriculumLangPicker({
    langKeys,
    value,
    onChange,
    canAdd,
    addLabel,
    onPickAdd,
    canRemove = false,
    removeLabel,
    onRemove,
    /** Optional first row e.g. `{ value: '*', label: 'All languages', flag: '🌐' }`. */
    allOption = null,
    compact = false,
    className = '',
    ariaLabel,
}) {
    const keys = Array.isArray(langKeys) ? langKeys : [];
    const allowRemove = !!canRemove && keys.length > 1 && typeof onRemove === 'function';
    const allValue = allOption?.value != null ? String(allOption.value) : '';
    const showAll = !!allOption && allValue !== '';

    return (
        <div
            className={`arborito-curriculum-lang-picker flex flex-col gap-2 ${className}`.trim()}
            role="listbox"
            aria-label={ariaLabel}
        >
            {showAll ? (
                <div className={langPillClass(value === allValue, compact)}>
                    <button
                        type="button"
                        role="option"
                        aria-selected={value === allValue ? 'true' : 'false'}
                        className={`min-w-0 flex-1 text-left flex items-center gap-3 rounded-lg ${
                            value === allValue ? '' : 'hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
                        }`}
                        onClick={() => onChange?.(allValue)}
                    >
                        <ChromeEmoji
                            emoji={allOption.flag || '🌐'}
                            className="shrink-0"
                            size={compact ? 18 : 22}
                        />
                        <span className="text-sm font-semibold truncate min-w-0">
                            {allOption.label || 'All languages'}
                        </span>
                    </button>
                </div>
            ) : null}
            {keys.map((k) => {
                const preset = getCurriculumLangPreset(k);
                const active = value === k;
                return (
                    <div key={k} className={langPillClass(active, compact)}>
                        <button
                            type="button"
                            role="option"
                            aria-selected={active ? 'true' : 'false'}
                            className={`min-w-0 flex-1 text-left flex items-center gap-3 rounded-lg ${
                                active ? '' : 'hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
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
                        {allowRemove ? (
                            <button
                                type="button"
                                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                                aria-label={(removeLabel || 'Remove {code}').replace('{code}', k)}
                                title={(removeLabel || 'Remove {code}').replace('{code}', k)}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onRemove?.(k);
                                }}
                            >
                                <span aria-hidden="true" className="text-lg leading-none">
                                    ×
                                </span>
                            </button>
                        ) : null}
                    </div>
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
