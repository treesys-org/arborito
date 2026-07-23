/**
 * Label + hint + `.arborito-switch`, canonical boolean row (prefs, publish dialogs).
 * Fully controlled: parent `checked` is the source of truth (supports async onChange).
 * `variant="freeze"` — same offline cyan as Arcade game offline / tree freeze.
 */
export function SwitchRow({
    id,
    label,
    hint,
    checked,
    onChange,
    onAria,
    offAria,
    disabled = false,
    className = '',
    variant = 'default',
}) {
    const on = !!checked;
    const freeze = variant === 'freeze';

    const toggle = () => {
        if (disabled) return;
        onChange?.(!on);
    };

    return (
        <div className={`flex items-start justify-between gap-4 py-3${className ? ` ${className}` : ''}`}>
            <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">{label}</p>
                {hint ? (
                    <p className="m-0 mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
                ) : null}
            </div>
            <button
                type="button"
                id={id}
                className={`arborito-switch shrink-0 mt-0.5${freeze ? ' arborito-switch--freeze' : ''}${on ? ' is-on' : ''}${disabled ? ' opacity-50 pointer-events-none' : ''}`}
                role="switch"
                aria-checked={on ? 'true' : 'false'}
                aria-disabled={disabled ? 'true' : undefined}
                aria-busy={disabled ? 'true' : undefined}
                aria-label={on ? offAria : onAria}
                title={on ? offAria : onAria}
                onClick={toggle}
            />
        </div>
    );
}
