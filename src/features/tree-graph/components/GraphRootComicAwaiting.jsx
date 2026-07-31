import { LoadingBrandRing } from '../../../shared/ui/Loading.jsx';
import { ARBORITO_ROOT_LOGO_URL } from '../../../shared/ui/arborito-logo-root.js';

/**
 * Soft-mount root slot: same knot wrapper geometry as the real root, plus comic bubble.
 * Lives inside `#mobile-knots-container` so position matches the eventual root knot.
 *
 * @param {{ title?: string, body?: string }} props
 */
export function GraphRootComicAwaiting({ title = '', body = '' }) {
    return (
        <div
            className="mobile-knot-wrapper arborito-root-comic-slot"
            data-arborito-panel="graph-root-comic"
        >
            <div
                className="mobile-knot mobile-knot-tone-root mobile-knot--svg arborito-root-comic__knot"
                aria-hidden="true"
                data-arbor-tour="graph-root"
            >
                <img
                    className="mobile-knot__svg arborito-root-knot-mark"
                    src={ARBORITO_ROOT_LOGO_URL}
                    alt=""
                    draggable={false}
                />
            </div>
            <div className="arborito-root-comic__bubble" role="status" aria-live="polite" aria-busy="true">
                <LoadingBrandRing size="sm" />
                <div className="arborito-root-comic__copy">
                    {title ? <p className="arborito-root-comic__title">{title}</p> : null}
                    {body ? <p className="arborito-root-comic__body">{body}</p> : null}
                </div>
            </div>
        </div>
    );
}

/** Trunk path SVG — same host as TreePathChrome (`mobile-trunk-col`). */
export function GraphAwaitingTrunkSvg() {
    return (
        <svg
            className="tree-path-chrome-svg tree-path-chrome-svg--trunk arborito-awaiting-trunk-svg"
            aria-hidden="true"
            viewBox="0 0 72 640"
            preserveAspectRatio="none"
        >
            <path
                className="mobile-trunk-path arborito-awaiting-trunk__path"
                d="M36 620 C 34 480, 38 320, 36 160 C 35 90, 36 40, 36 12"
            />
        </svg>
    );
}
