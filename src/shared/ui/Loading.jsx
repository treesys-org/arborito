import { ARBORITO_LOGO_MARK_PATH } from './arborito-logo-path.js';
import { LOADING_RING_SIZE } from './loading.js';

function ArboritoMark({ size, className = 'arborito-boot-logo-svg' }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 105.83334 96.572914"
            width={size}
            height={size}
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            <g transform="translate(-73.554161,-64.690628)">
                <path fill="currentColor" d={ARBORITO_LOGO_MARK_PATH} />
            </g>
        </svg>
    );
}

function resolveRingSize(size = 'md', ringSize) {
    if (Number.isFinite(ringSize)) return ringSize;
    return LOADING_RING_SIZE[size] || LOADING_RING_SIZE.md;
}

/** Arborito mark + ring (inline building block). */
export function LoadingBrandRing({ size = 'md', ringSize, extraClass = '' }) {
    const rs = resolveRingSize(size, ringSize);
    const logoSize = Math.max(10, Math.round(rs * 0.54));
    const extra = extraClass ? ` ${extraClass}` : '';
    return (
        <span
            className={`arborito-loading-brand-ring arborito-loading-brand-ring--${size}${extra}`}
            aria-hidden="true"
        >
            <span
                className={`arborito-boot-brand-wrap arborito-boot-brand-wrap--loading arborito-boot-brand-wrap--custom-size arborito-boot-brand-wrap--${size}`}
                style={{ width: rs, height: rs, minWidth: rs, minHeight: rs }}
            >
                <span className="arborito-boot-spinner-ring" />
                <span className="arborito-boot-logo-slot">
                    <ArboritoMark size={logoSize} />
                </span>
            </span>
        </span>
    );
}

/** Branded loading block (graph overlay, tree-growing block). */
export function LoadingBrand({ label = '', size = 'boot', tone = 'sage', extraClass = '' }) {
    const rs = resolveRingSize(size);
    const logoSize = Math.max(18, Math.round(rs * 0.54));
    const textCls =
        tone === 'slate'
            ? 'text-slate-700 dark:text-slate-200'
            : 'text-emerald-800 dark:text-emerald-200';
    const compact =
        extraClass.includes('arborito-loading-brand--compact') ||
        extraClass.includes('arborito-loading-brand--panel');
    return (
        <div
            className={`arborito-loading-brand${extraClass ? ` ${extraClass}` : ''}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div
                className={`arborito-boot-brand-wrap arborito-boot-brand-wrap--loading arborito-boot-brand-wrap--custom-size arborito-boot-brand-wrap--${size}${compact ? ' arborito-boot-brand-wrap--inline' : ''}`}
                style={{ width: rs, height: rs, minWidth: rs, minHeight: rs }}
            >
                <span className="arborito-boot-spinner-ring" aria-hidden="true" />
                <div className="arborito-boot-logo-slot">
                    <ArboritoMark size={logoSize} />
                </div>
            </div>
            {label ? <p className={`arborito-loading-brand__label ${textCls}`}>{label}</p> : null}
        </div>
    );
}

/** Inline loading row (toasts, chip hints). */
export function LoadingRow({ label = '', size = 'sm', tone = 'sage', extraClass = '' }) {
    const toneCls =
        tone === 'violet'
            ? ' text-violet-800 dark:text-violet-200'
            : tone === 'sky'
              ? ' text-sky-700 dark:text-sky-300'
              : tone === 'slate'
                ? ' text-slate-600 dark:text-slate-400'
                : ' text-emerald-800 dark:text-emerald-200';
    const textSize = size === 'sm' ? ' text-[11px]' : ' text-xs';
    return (
        <div
            className={`arborito-loading-inline-row${toneCls}${textSize} font-bold${extraClass ? ` ${extraClass}` : ''}`}
            role="status"
            aria-live="polite"
        >
            <LoadingBrandRing size={size} />
            <span>{label}</span>
        </div>
    );
}

/** Button-sized loading label (Saving…). */
export function LoadingButtonContent({ label = '' }) {
    return (
        <span className="inline-flex items-center justify-center gap-2">
            <LoadingBrandRing size="xs" />
            <span>{label}</span>
        </span>
    );
}
