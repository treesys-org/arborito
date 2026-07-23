import { lazy, Suspense } from 'react';
import { ModalHost } from '../../shared/ui/modal-dispatcher.js';
import { ToastStack } from './ToastStack.jsx';
import { TreeGrowingOverlay } from '../../features/tree-graph/components/TreeGrowingOverlay.jsx';

const Sage = lazy(() =>
    import('../../features/learning/modals/SageOverlay.jsx').then((m) => ({ default: m.SageOverlay }))
);
const ProductTour = lazy(() =>
    import('../../features/tour/components/ProductTour.jsx').then((m) => ({ default: m.ProductTour }))
);

/** Global overlays: modals host, toasts, sage, product tour. */
export function OverlayShell() {
    return (
        <>
            <ModalHost />
            <ToastStack />
            <TreeGrowingOverlay />
            <Suspense fallback={null}>
                <Sage />
                <ProductTour />
            </Suspense>
        </>
    );
}
