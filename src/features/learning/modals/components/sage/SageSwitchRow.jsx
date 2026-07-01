import { useEffect, useState } from 'react';

/** Toggle row matching `arboritoSwitchRow` markup — state syncs with DOM for settings save. */
export function SageSwitchRow({ id, label, hint, checked, onAria, offAria, onChange }) {
    const [on, setOn] = useState(!!checked);

    useEffect(() => {
        setOn(!!checked);
    }, [checked]);

    const toggle = () => {
        const next = !on;
        setOn(next);
        onChange?.(next);
    };

    return (
        <div className="flex items-start justify-between gap-4 py-2">
            <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold text-slate-700 dark:text-slate-200 leading-snug">{label}</p>
                {hint ? (
                    <p className="m-0 mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
                ) : null}
            </div>
            <button
                type="button"
                id={id}
                className={`arborito-switch shrink-0 mt-0.5${on ? ' is-on' : ''}`}
                role="switch"
                aria-checked={on ? 'true' : 'false'}
                aria-label={on ? offAria : onAria}
                onClick={toggle}
            />
        </div>
    );
}
