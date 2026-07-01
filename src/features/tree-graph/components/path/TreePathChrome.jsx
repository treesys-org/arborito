/**
 * Single owner of tree path geometry — trunk SVG, active segment, branch connector.
 */
import { useLayoutEffect, useState } from 'react';
import { useTreePathLayout } from '../../hooks/useTreePathLayout.jsx';

function ConnectorPaths({ d }) {
    if (!d) return null;
    return (
        <>
            <path
                d={d}
                fill="none"
                stroke="rgb(40 28 20)"
                strokeWidth="var(--path-connector-stroke-outer, 10)"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.16"
                className="tree-path-connector tree-path-connector--shadow"
            />
            <path
                d={d}
                fill="none"
                stroke="rgb(120 90 68)"
                strokeWidth="var(--path-connector-stroke-mid, 6)"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.52"
                className="tree-path-connector tree-path-connector--mid"
            />
            <path
                d={d}
                fill="none"
                stroke="rgb(230 210 175)"
                strokeWidth="var(--path-connector-stroke-inner, 3.5)"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="tree-path-connector tree-path-connector--highlight"
            />
        </>
    );
}

/**
 * @param {{
 *   model: object | null,
 *   panelRef: import('react').RefObject<HTMLElement | null>,
 *   hostRefs: object,
 * }} props
 */
export function TreePathChrome({ model, panelRef, hostRefs }) {
    const [panelEl, setPanelEl] = useState(null);
    useLayoutEffect(() => {
        const el = panelRef?.current ?? null;
        setPanelEl((prev) => (prev === el ? prev : el));
    });

    const layout = useTreePathLayout({
        model,
        hostRefs,
        panelEl,
    });

    if (!model?.pathNodes?.length) return null;

    const { trunkD, trunkActiveD, connectorD, svgWidth, svgHeight } = layout;
    const w = Math.max(svgWidth || 1, 1);
    const h = Math.max(svgHeight || 1, 1);

    return (
        <svg
            className="tree-path-chrome-svg mobile-trunk-svg"
            aria-hidden="true"
            width={w}
            height={h}
            style={{ width: w, height: h }}
        >
            {trunkD ? <path className="mobile-trunk-path" d={trunkD} /> : null}
            {trunkActiveD ? <path className="mobile-trunk-path-active" d={trunkActiveD} /> : null}
            <ConnectorPaths d={connectorD} />
        </svg>
    );
}
