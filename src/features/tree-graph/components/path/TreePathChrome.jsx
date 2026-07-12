/**
 * Single owner of tree path geometry, trunk SVG, active segment, branch connector.
 * Trunk SVG portals into #mobile-trunk-col; connector stays on #mobile-trunk-scroll-content.
 */
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTreePathLayout } from '../../hooks/useTreePathLayout.jsx';

const CONNECTOR_LAYERS = [
    { stroke: 'rgb(40 28 20)', width: 'var(--path-connector-stroke-outer, 10)', opacity: 0.16, className: 'tree-path-connector--shadow' },
    { stroke: 'rgb(120 90 68)', width: 'var(--path-connector-stroke-mid, 6)', opacity: 0.52, className: 'tree-path-connector--mid' },
    { stroke: 'rgb(230 210 175)', width: 'var(--path-connector-stroke-inner, 3.5)', className: 'tree-path-connector--highlight' },
];

function ConnectorPaths({ d }) {
    if (!d) return null;
    return CONNECTOR_LAYERS.map(({ stroke, width, opacity, className }) => (
        <path
            key={className}
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={opacity}
            className={`tree-path-connector ${className}`}
        />
    ));
}

function TrunkSvg({ trunkD, trunkActiveD, width, height }) {
    const w = Math.max(width || 1, 1);
    const h = Math.max(height || 1, 1);
    if (!trunkD && !trunkActiveD) return null;

    return (
        <svg
            className="tree-path-chrome-svg tree-path-chrome-svg--trunk mobile-trunk-svg"
            aria-hidden="true"
            width={w}
            height={h}
        >
            {trunkD ? (
                <path
                    className="mobile-trunk-path"
                    d={trunkD}
                    strokeLinejoin="round"
                />
            ) : null}
            {trunkActiveD ? (
                <path
                    className="mobile-trunk-path-active"
                    d={trunkActiveD}
                    strokeLinejoin="round"
                />
            ) : null}
        </svg>
    );
}

function ConnectorSvg({ connectorD, width, height }) {
    const w = Math.max(width || 1, 1);
    const h = Math.max(height || 1, 1);
    if (!connectorD) return null;

    return (
        <svg
            className="tree-path-chrome-svg tree-path-chrome-svg--connector mobile-trunk-svg"
            aria-hidden="true"
            width={w}
            height={h}
            style={{ width: w, height: h }}
        >
            <ConnectorPaths d={connectorD} />
        </svg>
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
    const [trunkColEl, setTrunkColEl] = useState(null);

    useLayoutEffect(() => {
        const el = panelRef?.current ?? null;
        setPanelEl((prev) => (prev === el ? prev : el));
    });

    useLayoutEffect(() => {
        const el = hostRefs?.trunkCol?.current ?? null;
        setTrunkColEl((prev) => (prev === el ? prev : el));
    });

    const layout = useTreePathLayout({
        model,
        hostRefs,
        panelEl,
    });

    if (!model?.pathNodes?.length) return null;

    const {
        trunkD,
        trunkActiveD,
        connectorD,
        svgWidth,
        trunkSvgWidth,
        svgHeight,
        trunkSvgHeight,
    } = layout;
    const trunkW = Math.max(trunkSvgWidth || 1, 1);
    const trunkH = Math.max(trunkSvgHeight || svgHeight || 1, 1);
    const connectorW = Math.max(svgWidth || 1, 1);
    const connectorH = Math.max(svgHeight || 1, 1);

    const trunkLayer =
        trunkColEl && (trunkD || trunkActiveD)
            ? createPortal(
                  <TrunkSvg
                      trunkD={trunkD}
                      trunkActiveD={trunkActiveD}
                      width={trunkW}
                      height={trunkH}
                  />,
                  trunkColEl
              )
            : null;

    return (
        <>
            {trunkLayer}
            <ConnectorSvg connectorD={connectorD} width={connectorW} height={connectorH} />
        </>
    );
}
