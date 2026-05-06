import { store } from './store.js';
import { persistTreeUiState } from './utils/tree-ui-persist.js';
import { initMobileDetection } from './utils/breakpoints.js';
import { syncMobileTreeShellClass } from './utils/mobile-tree-shell-class.js';
import './components/sidebar.js';
import './components/graph.js';
import './components/content.js';
import './components/modals.js';
import './components/toast-stack.js';
import './components/modal-overlay-host.js';
import './components/progress-widget.js';
import './components/version-widget.js';
import './components/construction-panel.js';
import './components/tree-presentation.js';
import './components/modals/sage.js';
import './components/product-tour.js';

/* Class on <html>: set by `UIStore.update` when `constructionMode` changes.
 * Re-sync only on viewport changes (rotation / breakpoint) in case the class tree drifts. */
const reapplyConstructionHtmlClass = () => {
    document.documentElement.classList.toggle(
        'arborito-construction-mobile',
        !!store.value.constructionMode
    );
};

const reapplyMobileShellClasses = () => {
    reapplyConstructionHtmlClass();
    const sb = document.querySelector('arborito-sidebar');
    syncMobileTreeShellClass(store, { mobileMoreOpen: !!(sb && sb.isMobileMenuOpen) });
};

initMobileDetection();
window.addEventListener('arborito-viewport', reapplyMobileShellClasses);
reapplyMobileShellClasses();

window.addEventListener('beforeunload', () => {
    try {
        persistTreeUiState(store);
    } catch {
        /* ignore */
    }
});

document.addEventListener('DOMContentLoaded', () => {
    let initialTheme = localStorage.getItem('arborito-theme');
    const hasExplicitTheme = !!initialTheme;
    
    if (!initialTheme) {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            initialTheme = 'dark';
        } else {
            initialTheme = 'light';
        }
    }
    store.setTheme(initialTheme);
    
    // Listen for system theme changes in real-time (only if user hasn't manually chosen)
    if (window.matchMedia && !hasExplicitTheme) {
        const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        darkModeQuery.addEventListener('change', (e) => {
            const newTheme = e.matches ? 'dark' : 'light';
            store.setTheme(newTheme);
        });
    }
});
