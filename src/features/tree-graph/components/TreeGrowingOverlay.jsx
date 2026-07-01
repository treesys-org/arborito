import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHookUi, useShellModalLang } from '../../../app/hooks/useHookShell.js';
import { useShellUiSlice } from '../../../stores/shell-ui-store.js';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { LoadingBrand, LoadingRow } from '../../../shared/ui/Loading.jsx';

const STYLE_ID = 'arborito-tree-growing-overlay-style';

const overlaySliceSelector = (s) => ({
    treeHydrating: s.treeHydrating,
    treeGrowingOverlay: s.treeGrowingOverlay,
});

const STYLE_CSS = `
.arborito-tree-growing-toast {
    position: fixed;
    top: max(1rem, env(safe-area-inset-top, 0px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.9rem;
    max-width: min(22rem, calc(100vw - 2rem));
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.96);
    color: rgb(22 101 52);
    border: 1px solid rgba(34, 197, 94, 0.28);
    box-shadow: 0 8px 22px rgb(15 23 42 / 0.18);
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.3;
    pointer-events: none;
    animation: arborito-tree-growing-toast-in 200ms ease-out both;
}
html.dark .arborito-tree-growing-toast {
    background: rgba(6, 44, 34, 0.94);
    color: rgb(187 247 208);
    border-color: rgba(74, 222, 128, 0.32);
    box-shadow: 0 8px 22px rgb(0 0 0 / 0.45);
}
.arborito-tree-growing-toast .arborito-loading-inline-row {
    font-size: inherit;
    font-weight: inherit;
    color: inherit;
    min-width: 0;
}
.arborito-tree-growing-toast .arborito-loading-inline-row > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
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
@keyframes arborito-tree-growing-toast-in {
    from { opacity: 0; transform: translate(-50%, -0.4rem); }
    to   { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes arborito-tree-growing-block-in {
    from { opacity: 0; }
    to   { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
    .arborito-tree-growing-toast,
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

function sourcesModalOpen(state) {
    const m = state?.modal;
    return !!(m && (m === 'sources' || (typeof m === 'object' && m.type === 'sources')));
}

function currentMode(state) {
    const s = state || {};
    const sourcesOpen = sourcesModalOpen(s);
    if (sourcesOpen && !s.publishingTree && !s.treeGrowingOverlay) return null;
    if (s.publishingTree) return 'block';
    if (s.treeGrowingOverlay) return 'block';
    if (s.treeHydrating && s.treeGrowingOverlay !== false) return 'toast';
    return null;
}

function currentText(state, ui) {
    const s = state || {};
    if (s.publishingTree) {
        return ui.publishingTreeShort || ui.publishingTreeTitle || 'Publicando árbol…';
    }
    return ui.treeGrowingShort || ui.treeGrowingTitle || 'Cargando árbol…';
}

export function TreeGrowingOverlay() {
    const ui = useHookUi();
    const { modal } = useShellModalLang();
    const publishingTree = useShellUiSlice((s) => s.publishingTree);
    const { treeHydrating, treeGrowingOverlay } = useTreeGraphSlice(useShallow(overlaySliceSelector));

    const overlayState = useMemo(
        () => ({ modal, publishingTree, treeHydrating, treeGrowingOverlay }),
        [modal, publishingTree, treeHydrating, treeGrowingOverlay]
    );
    const mode = useMemo(() => currentMode(overlayState), [overlayState]);
    const text = useMemo(() => (mode ? currentText(overlayState, ui) : ''), [mode, overlayState, ui]);

    useEffect(() => {
        ensureStyleInjected();
    }, []);

    useEffect(() => {
        if (mode !== 'block') {
            document.body.style.removeProperty('overflow');
            return undefined;
        }
        document.body.style.overflow = 'hidden';
        return () => document.body.style.removeProperty('overflow');
    }, [mode]);

    if (!mode) return null;

    if (mode === 'block') {
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

    return (
        <div data-arborito-panel="tree-growing-overlay">
            <div className="arborito-tree-growing-toast" role="status" aria-live="polite" aria-busy="true">
                <LoadingRow label={text} size="sm" tone="sage" />
            </div>
        </div>
    );
}

export function ensureTreeGrowingOverlayReady() {
    return import('../api/tree-growing-overlay.js').then(() => undefined);
}
