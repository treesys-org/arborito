import { forwardRef, useCallback, useEffect, useRef } from 'react';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { resolvePresentationState } from '../api/tree-presentation-logic.js';
import { TreePresentationForm } from './TreePresentationForm.jsx';

function shouldSkipClearance(rootEl) {
    if (!rootEl) return true;
    return !!(
        rootEl.closest('#mobile-menu') ||
        rootEl.closest('[data-arborito-panel="sidebar"]') ||
        rootEl.closest('[data-arborito-panel="modal-tree-info"]') ||
        rootEl.closest('[data-arborito-panel="modal-construction-about"]')
    );
}

export const TreePresentation = forwardRef(function TreePresentation({ embed, modalHost, formRef, publishHub }, ref) {
    const rootRef = useRef(null);
    const isModalHost = !!modalHost;

    const panelState = resolvePresentationState({
        isModalHost,
    });

    const syncClearance = useCallback(() => {
        const el = rootRef.current;
        if (!el || shouldSkipClearance(el)) return;
        if (typeof document === 'undefined') return;
        document.documentElement.style.removeProperty('--arbor-mobile-pres-clearance');
    }, []);

    const api = useRef({
        syncMobilePresClearanceFromHost() {
            syncClearance();
        },
    });

    useRegisterPanel('tree-presentation', () => api.current);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return undefined;
        const onViewport = () => syncClearance();
        window.addEventListener('arborito-viewport', onViewport);
        requestAnimationFrame(() => syncClearance());
        return () => {
            window.removeEventListener('arborito-viewport', onViewport);
            if (typeof document !== 'undefined') {
                document.documentElement.style.removeProperty('--arbor-mobile-pres-clearance');
            }
        };
    }, [syncClearance, panelState.visible]);

    if (!panelState.visible) {
        return (
            <div
                ref={rootRef}
                className="arborito-tree-presentation hidden"
                data-arborito-panel="tree-presentation"
                data-arbor-tour="con-info"
                data-embed={embed ? '1' : undefined}
                data-arbor-pres-modal-host={modalHost ? '1' : undefined}
            />
        );
    }

    const { aboutKind, desc, authorName, supportInputValue, title } = panelState;

    return (
        <div
            ref={rootRef}
            className="arborito-tree-presentation arborito-tree-pres--inline arborito-tree-pres--inline-modal"
            data-arborito-panel="tree-presentation"
            data-arbor-tour="con-info"
            data-embed={embed ? '1' : undefined}
            data-arbor-pres-modal-host={modalHost ? '1' : undefined}
        >
            <TreePresentationForm
                ref={formRef}
                aboutKind={aboutKind}
                desc={desc}
                authorName={authorName}
                supportInputValue={supportInputValue}
                hideTitle
                hideDescLabel={!!title}
                title={title}
                publishHub={!!publishHub || !!modalHost}
            />
        </div>
    );
});
