import { useMemo } from 'react';
import { useStore } from 'zustand';
import { reactStateStore } from '../../stores/react-state.js';
import { useShellUiSlice } from '../../stores/shell-ui-store.js';
import { learningStore } from '../../stores/learning-store.js';

/** Minimal store subscription for ModalHost — avoids re-rendering on unrelated slice updates. */
export function useModalHostRouteState() {
    const modal = useShellUiSlice((s) => s.modal);
    const viewMode = useShellUiSlice((s) => s.viewMode);
    const previewNode = useStore(learningStore, (s) => s.previewNode);
    const ui = useStore(reactStateStore, (s) => s.ui);

    return useMemo(
        () => ({ modal, viewMode, previewNode, ui }),
        [modal, viewMode, previewNode, ui]
    );
}
