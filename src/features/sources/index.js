/** Public API — fuentes / biblioteca de árboles. */
export { useSources } from './hooks/useSources.js';
export { useSourcesModal } from './hooks/useSourcesModal.js';
export {
    sourcesStore,
    useSourcesSlice,
    sourcesActions,
    patchSourcesSlice,
    commitSourcesState,
} from '../../stores/sources-store.js';
export { ModalSources } from './modals/SourcesModal.jsx';
export { ModalLoadWarning } from './modals/LoadWarningModal.jsx';
export { ModalSecurityWarning } from './modals/SecurityWarningModal.jsx';
export { ModalPickCurriculumLang } from './modals/PickCurriculumLangModal.jsx';
