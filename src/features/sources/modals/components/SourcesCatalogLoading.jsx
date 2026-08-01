import { ListRowSkeleton } from '../../../../shared/ui/ListRowEnter.jsx';

/**
 * Visible catalog-fetch status (label + optional skeletons).
 * Skeletons alone read as a broken list; the copy says what is loading.
 */
export function SourcesCatalogLoading({
    ui,
    count = 3,
    compact = false,
}) {
    const title =
        ui.sourcesCatalogLoading ||
        ui.sourcesBranchHydratingHint ||
        'Loading courses from the network…';
    const hint = compact
        ? null
        : ui.sourcesCatalogLoadingHint ||
          'Fetching recommended and shared courses.';
    const label = hint ? `${title} ${hint}` : title;

    return (
        <div
            className={`arborito-sources-loading-slot${compact ? ' arborito-sources-loading-slot--compact' : ''}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label={label}
        >
            <p className="arborito-sources-loading-slot__title m-0 text-sm font-extrabold leading-snug">
                {title}
            </p>
            {hint ? (
                <p className="arborito-sources-loading-slot__hint m-0 mt-1 text-xs font-semibold leading-snug opacity-80">
                    {hint}
                </p>
            ) : null}
            {count > 0 ? (
                <div className="mt-3 space-y-3">
                    <ListRowSkeleton count={count} variant="card" />
                </div>
            ) : null}
        </div>
    );
}
