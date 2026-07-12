import { lazy, Suspense, useEffect, useState } from 'react';
import { isFirstVisitOnboarding } from '../../shared/lib/onboarding-boot-gate.js';
import { hasGdprNetworkConsent, onGdprNetworkConsentGranted } from '../../shared/lib/connected-services/index.js';
import { ensureHeavyShellLoaded } from '../startup.js';

const Sidebar = lazy(() =>
    import('../../features/shell-chrome/components/Sidebar.jsx').then((m) => ({ default: m.Sidebar }))
);
const Graph = lazy(() =>
    import('../../features/tree-graph/components/Graph.jsx').then((m) => ({ default: m.Graph }))
);
const Content = lazy(() =>
    import('../../features/learning/components/Content.jsx').then((m) => ({ default: m.Content }))
);
const ConstructionPanel = lazy(() =>
    import('../../features/editor/components/ConstructionPanel.jsx').then((m) => ({
        default: m.ConstructionPanel,
    }))
);
const ProgressWidget = lazy(() =>
    import('../../features/garden-progress/components/ProgressWidget.jsx').then((m) => ({
        default: m.ProgressWidget,
    }))
);

/** Main shell: sidebar, graph, content, construction, progress. */
function shouldDeferHeavyShell() {
    if (!isFirstVisitOnboarding()) return false;
    return !hasGdprNetworkConsent();
}

export function HeavyShell() {
    const [ready, setReady] = useState(() => !shouldDeferHeavyShell());

    useEffect(() => {
        if (ready) return undefined;
        const bump = () => {
            void ensureHeavyShellLoaded();
            setReady(true);
        };
        const offGdpr = onGdprNetworkConsentGranted(bump);
        window.addEventListener('arborito-onboarding-complete', bump, { once: true });
        return () => {
            offGdpr();
            window.removeEventListener('arborito-onboarding-complete', bump);
        };
    }, [ready]);

    if (!ready) return null;

    return (
        <Suspense fallback={null}>
            <Sidebar />
            <main
                id="main-content"
                className="flex-1 relative flex flex-col h-full min-w-0 min-h-0 overflow-hidden"
                tabIndex={-1}
            >
                <div
                    id="arborito-graph-tour-anchor"
                    className="w-full h-full absolute inset-0 z-10"
                >
                    <Graph />
                </div>
            </main>
            <Content />
            <ConstructionPanel />
            <ProgressWidget />
        </Suspense>
    );
}
