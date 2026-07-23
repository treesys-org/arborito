/** Public API del feature shell (sidebar, idioma, about). */
export { useShellChrome } from './hooks/useShellChrome.js';
export { useShellUiSlice, shellUiActions, shellUiStore, commitShellUiState } from '../../stores/shell-ui-store.js';
export { Sidebar } from './components/Sidebar.jsx';
export { ModalAbout } from './modals/AboutModal.jsx';
export { ModalLanguage } from './modals/LanguageModal.jsx';
