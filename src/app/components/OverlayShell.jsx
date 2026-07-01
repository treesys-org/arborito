import { ModalHost } from '../../shared/ui/modal-dispatcher.js';
import { ToastStack } from './ToastStack.jsx';
import { ModalOverlayHost } from './ModalOverlayHost.jsx';
import { TreeGrowingOverlay } from '../../features/tree-graph/components/TreeGrowingOverlay.jsx';
import { Sage } from '../../features/learning/modals/SageOverlay.jsx';
import { ProductTour } from '../../features/tour/components/ProductTour.jsx';

/** Global overlays: modals host, toasts, sage, product tour. */
export function OverlayShell() {
    return (
        <>
            <ModalHost />
            <ToastStack />
            <ModalOverlayHost />
            <TreeGrowingOverlay />
            <Sage />
            <ProductTour />
        </>
    );
}
