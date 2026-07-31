import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHookUi, useShellModalLang } from '../../../app/hooks/useHookShell.js';
import { useShellUiSlice } from '../../../stores/shell-ui-store.js';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { LoadingBrand } from '../../../shared/ui/Loading.jsx';
import {
    endBibliotecaSoftMount,
    isBibliotecaSoftMount,
    shouldSuppressTreeGrowingBlock,
} from '../../sources/api/sources-session.js';
import { isBootLoaderDismissed } from '../../../boot-loader.js';

const STYLE_ID = 'arborito-tree-growing-overlay-style-v3';

const overlaySliceSelector = (s) => ({
    treeGrowingOverlay: s.treeGrowingOverlay,
    treeGrowingHint: s.treeGrowingHint,
    bibliotecaSoftMount: s.bibliotecaSoftMount,
    data: s.data,
    rawGraphData: s.rawGraphData,
});

const STYLE_CSS = `
.arborito-tree-growing-block {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    background: rgba(241, 245, 249, 0.78);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
    pointer-events: auto;
    cursor: progress;
    animation: arborito-tree-growing-block-in 180ms ease-out both;
}
html.dark .arborito-tree-growing-block {
    background: rgba(2, 6, 23, 0.75);
}
.arborito-tree-growing-block__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem 1.75rem;
    min-width: min(20rem, calc(100vw - 3rem));
    max-width: 26rem;
    border-radius: 1rem;
    background: rgb(255 255 255);
    color: rgb(22 101 52);
    border: 1px solid rgba(34, 197, 94, 0.35);
    box-shadow: 0 18px 48px rgb(15 23 42 / 0.28);
    text-align: center;
    cursor: default;
}
html.dark .arborito-tree-growing-block__card {
    background: rgb(6 44 34);
    color: rgb(187 247 208);
    border-color: rgba(74, 222, 128, 0.38);
    box-shadow: 0 18px 48px rgb(0 0 0 / 0.55);
}
.arborito-tree-growing-block__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.25;
}
.arborito-tree-growing-block__subtitle {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 500;
    line-height: 1.35;
    opacity: 0.85;
}
@keyframes arborito-tree-growing-block-in {
    from { opacity: 0; }
    to   { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
    .arborito-tree-growing-block { animation: none !important; opacity: 1; }
}
`;

function ensureStyleInjected() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
}

/** Publish hub shows its own LoadingBrand while the graph mounts — avoid a second overlay. */
function constructionAboutOpen(state) {
    const m = state?.modal;
    return !!(m && typeof m === 'object' && m.type === 'construction-about');
}

function hasGraphStructure(s) {
    if (s?.data) return true;
    const raw = s?.rawGraphData;
    return !!(raw && (raw.languages || raw.nodes));
}

/** Block overlay only for publish / explicit growing; soft-mount waits use graph comic. */
function shouldShowBlock(state) {
    const s = state || {};
    if (!isBootLoaderDismissed() || s.bootChromeReady === false) return false;
    if (s.sourceBootInProgress) return false;

    const publishHubOpen = constructionAboutOpen(s);
    if (publishHubOpen) return !!s.publishingTree;
    if (s.publishingTree) return true;

    if (s.bibliotecaSoftMount || isBibliotecaSoftMount()) return false;

    const graphMissing = !hasGraphStructure(s);
    return !!(
        s.treeGrowingOverlay &&
        graphMissing &&
        !shouldSuppressTreeGrowingBlock({ state: s })
    );
}

function currentText(state, ui) {
    const s = state || {};
    if (s.publishingTree) {
        return ui.publishingTreeShort || ui.publishingTreeTitle || 'Publishing tree…';
    }
    if (s.treeGrowingHint) return String(s.treeGrowingHint);
    return ui.treeGrowingShort || ui.treeGrowingTitle || 'Loading tree…';
}

export function TreeGrowingOverlay() {
    const ui = useHookUi();
    const { modal } = useShellModalLang();
    const { publishingTree, sourceBootInProgress } = useShellUiSlice(
        useShallow((s) => ({
            publishingTree: s.publishingTree,
            sourceBootInProgress: s.sourceBootInProgress,
        }))
    );
    const { treeGrowingOverlay, treeGrowingHint, bibliotecaSoftMount, data, rawGraphData } =
        useTreeGraphSlice(useShallow(overlaySliceSelector));
    const [bootChromeReady, setBootChromeReady] = useState(() => isBootLoaderDismissed());

    useEffect(() => {
        if (bootChromeReady) return undefined;
        const onDismiss = () => setBootChromeReady(true);
        window.addEventListener('arborito-boot-dismiss', onDismiss);
        if (isBootLoaderDismissed()) setBootChromeReady(true);
        return () => window.removeEventListener('arborito-boot-dismiss', onDismiss);
    }, [bootChromeReady]);

    /* Clear soft-mount once structure is on screen so the flag cannot stick over Arcade. */
    useEffect(() => {
        if (!bibliotecaSoftMount && !isBibliotecaSoftMount()) return;
        if (hasGraphStructure({ data, rawGraphData })) {
            endBibliotecaSoftMount();
        }
    }, [bibliotecaSoftMount, data, rawGraphData]);

    const overlayState = useMemo(
        () => ({
            modal,
            publishingTree,
            sourceBootInProgress,
            treeGrowingOverlay,
            treeGrowingHint,
            bibliotecaSoftMount,
            data,
            rawGraphData,
            bootChromeReady,
        }),
        [
            modal,
            publishingTree,
            sourceBootInProgress,
            treeGrowingOverlay,
            treeGrowingHint,
            bibliotecaSoftMount,
            data,
            rawGraphData,
            bootChromeReady,
        ]
    );
    const showBlock = useMemo(() => shouldShowBlock(overlayState), [overlayState]);
    const text = useMemo(
        () => (showBlock ? currentText(overlayState, ui) : ''),
        [showBlock, overlayState, ui]
    );

    useEffect(() => {
        ensureStyleInjected();
    }, []);

    useEffect(() => {
        if (!showBlock) {
            document.body.style.removeProperty('overflow');
            return undefined;
        }
        document.body.style.overflow = 'hidden';
        return () => document.body.style.removeProperty('overflow');
    }, [showBlock]);

    if (!showBlock) return null;

    const title = ui.treeGrowingPleaseWait || 'Un momento, por favor';
    return (
        <div data-arborito-panel="tree-growing-overlay">
            <div
                className="arborito-tree-growing-block"
                role="dialog"
                aria-modal="true"
                aria-busy="true"
                aria-live="polite"
            >
                <div className="arborito-tree-growing-block__card">
                    <LoadingBrand label="" size="boot" />
                    <p className="arborito-tree-growing-block__title">{title}</p>
                    <p className="arborito-tree-growing-block__subtitle">{text}</p>
                </div>
            </div>
        </div>
    );
}

export function ensureTreeGrowingOverlayReady() {
    return import('../api/tree-growing-overlay.js').then(() => undefined);
}
