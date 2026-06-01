import { store } from './core/store.js';
import { persistTreeUiState } from './features/tree-graph/tree-ui-persist.js';
import { initMobileDetection } from './shared/ui/breakpoints.js';
import { syncMobileTreeShellClass } from './shared/ui/mobile-tree-shell-class.js';
import './features/shell-chrome/sidebar.js';
import './features/tree-graph/graph.js';
import './features/learning/content.js';
import './shared/ui/modal-dispatcher.js';
import './shared/ui/toast-stack.js';
import './shared/ui/modal-overlay-host.js';
import './features/tree-graph/tree-growing-overlay.js';
import './features/garden-progress/progress-widget.js';
import './features/version-updates/version-widget.js';
import './features/editor/construction-panel.js';
import './features/tree-graph/tree-presentation.js';
import './features/learning/modals/sage.js';
import './features/tour/product-tour.js';
import { syncGardenBackground } from './features/garden-progress/garden-background.js';

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

window.addEventListener('beforeunload', (event) => {
    try {
        persistTreeUiState(store);
    } catch {
        /* ignore */
    }
    const contentEl = document.querySelector('arborito-content');
    if (contentEl?.hasActiveQuizInProgress?.()) {
        event.preventDefault();
        event.returnValue = '';
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

    // Apply theme class immediately to avoid flash of wrong theme
    if (initialTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    store.setTheme(initialTheme);

    syncGardenBackground(store);
    store.addEventListener('state-change', () => syncGardenBackground(store));

    // Listen for system theme changes in real-time (only if user hasn't manually chosen)
    if (window.matchMedia && !hasExplicitTheme) {
        const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        darkModeQuery.addEventListener('change', (e) => {
            const newTheme = e.matches ? 'dark' : 'light';
            document.documentElement.classList.toggle('dark', newTheme === 'dark');
            store.setTheme(newTheme);
        });
    }
});
