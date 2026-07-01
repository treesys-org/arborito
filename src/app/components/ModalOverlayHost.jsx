import { useShellUiSlice } from '../../stores/shell-ui-store.js';
import { ModalAuthorLicense } from '../../features/publishing/modals/AuthorLicenseModal.jsx';

/** Floating layer above modals (CC license overlay). */
export function ModalOverlayHost() {
    const overlay = useShellUiSlice((s) => s.modalOverlay);
    if (!overlay || overlay.type !== 'author-license') return null;

    return (
        <div data-arborito-panel="modal-overlay-host">
            <ModalAuthorLicense overlay={overlay} />
        </div>
    );
}
