/** Public API — importá desde aquí si tocás búsqueda. */
export { useSearch } from './hooks/useSearch.js';
export { useSearchSlice, useSearchStore, searchStore, searchActions, commitSearchState } from '../../stores/search-store.js';
export { navigationActions } from '../../stores/navigation-store-actions.js';
export { ModalSearch } from './modals/SearchModal.jsx';
export { SearchResultsPanel } from './components/SearchResultsPanel.jsx';
