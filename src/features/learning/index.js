/** Public API — lecciones, contenido, Sage. */
export { useLearning, useLearningStore } from './hooks/useLearning.js';
export { useSageAi } from './hooks/useSageAi.js';
export { learningStore, useLearningSlice, learningActions, patchLearningSlice, commitLearningState } from '../../stores/learning-store.js';
export { enterLessonAction, closeContentAction, closePreviewAction } from '../../stores/learning-store-actions.js';
export { Content } from './components/Content.jsx';
export { SageOverlay } from './modals/SageOverlay.jsx';
export { ModalEmptyModule } from './modals/EmptyModuleModal.jsx';
