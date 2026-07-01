import './shared/styles/main.entry.css';
import './shared/styles/runtime-overrides/index.css';
import './core/bootstrap.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';
import { runStartup } from './app/startup.js';

runStartup();

const rootEl = document.getElementById('root');
if (!rootEl) {
    throw new Error('[Arborito] #root missing — index.html must mount the React app');
}

createRoot(rootEl).render(
    <StrictMode>
        <App />
    </StrictMode>
);
