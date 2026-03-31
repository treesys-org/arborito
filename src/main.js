
import { store } from './store.js';
import { initMobileDetection } from './utils/breakpoints.js';
import './components/sidebar.js';
import './components/graph.js';
import './components/content.js';
import './components/modals.js';
import './components/progress-widget.js';
import './components/version-widget.js';
import './components/construction-panel.js'; 
import './components/modals/editor.js';
import './components/modals/sage.js';
import './components/product-tour.js';

const syncConstructionDockMode = () => {
    document.documentElement.classList.toggle('arborito-construction-mobile', !!store.value.constructionMode);
};

initMobileDetection();
store.addEventListener('state-change', syncConstructionDockMode);
window.addEventListener('arborito-viewport', syncConstructionDockMode);
syncConstructionDockMode();

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Check local storage for theme, falling back to system preference
    let initialTheme = localStorage.getItem('arborito-theme');
    if (!initialTheme) {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            initialTheme = 'dark';
        } else {
            initialTheme = 'light';
        }
    }
    store.setTheme(initialTheme);

    // Store initializes itself in its constructor via this.initialize()
});
