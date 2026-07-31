import { LoadingBrand } from './Loading.jsx';

/**
 * Floating centered brand loader over a darkened scrim.
 * Use until the first content paints (graph tree/branch, chunk pending, …).
 *
 * @param {{
 *   label?: string,
 *   title?: string,
 *   size?: string,
 *   dim?: boolean,
 *   className?: string,
 *   panelClassName?: string,
 * }} props
 */
export function FloatingLoadScrim({
    label = '',
    title = '',
    size = 'lg',
    dim = true,
    className = '',
    panelClassName = '',
}) {
    const rootCls = [
        'arborito-float-load-scrim',
        dim ? 'arborito-float-load-scrim--dim' : '',
        className,
    ]
        .filter(Boolean)
        .join(' ');
    const panelCls = ['arborito-float-load-scrim__panel', panelClassName].filter(Boolean).join(' ');

    return (
        <div className={rootCls} role="status" aria-live="polite" aria-busy="true">
            <div className={panelCls}>
                <LoadingBrand label="" size={size} />
                {title ? <p className="arborito-float-load-scrim__title">{title}</p> : null}
                {label ? <p className="arborito-float-load-scrim__label">{label}</p> : null}
            </div>
        </div>
    );
}
