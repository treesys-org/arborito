import { LoadingBrand } from '../../../../shared/ui/Loading.jsx';

/** Branded loading block for Biblioteca while a branch or tree mounts. */
export function SourcesLoadingPanel({ label, tone = 'sage', className = '' }) {
    const toneCls =
        tone === 'sky'
            ? ' arborito-loading-panel--sky'
            : tone === 'slate'
              ? ' arborito-loading-panel--slate'
              : ' arborito-loading-panel--sage';
    const extra = className ? ` ${className}` : '';
    return (
        <div
            className={`arborito-loading-panel${toneCls}${extra}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <LoadingBrand
                label={label}
                size="lg"
                tone={tone === 'slate' ? 'slate' : 'sage'}
                extraClass="arborito-loading-brand--panel"
            />
        </div>
    );
}
