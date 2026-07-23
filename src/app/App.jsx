import { useEffect } from 'react';
import { BootScreen } from './components/BootScreen.jsx';
import { HeavyShell } from './components/HeavyShell.jsx';
import { OverlayShell } from './components/OverlayShell.jsx';
import { ArboritoDebugger } from './components/ArboritoDebugger.jsx';

const DEV = import.meta.env?.DEV;

function useDocumentLang() {
    useEffect(() => {
        try {
            const lang = (localStorage.getItem('arborito-lang') || 'EN').toUpperCase();
            const es = lang.indexOf('ES') === 0;
            document.documentElement.lang = es ? 'es' : 'en';
        } catch {
            /* ignore */
        }
    }, []);
}

export function App() {
    useDocumentLang();

    const skipLabel = (() => {
        try {
            const lang = (localStorage.getItem('arborito-lang') || 'EN').toUpperCase();
            return lang.indexOf('ES') === 0 ? 'Saltar al contenido principal' : 'Skip to main content';
        } catch {
            return 'Skip to main content';
        }
    })();

    return (
        <>
            <a href="#main-content" id="arborito-skip-link" className="arborito-skip-link">
                {skipLabel}
            </a>

            <div id="arborito-scene-bg" aria-hidden="true" />

            <BootScreen />

            <div id="app" className="arborito-shell h-full w-full flex relative min-h-0">
                <HeavyShell />
            </div>

            <OverlayShell />

            {DEV ? <ArboritoDebugger /> : null}
        </>
    );
}
