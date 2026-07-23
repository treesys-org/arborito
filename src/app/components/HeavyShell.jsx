import { lazy, Suspense, useEffect } from 'react';
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
export function HeavyShell() {
    useEffect(() => {
        void ensureHeavyShellLoaded();
        if (hasGdprNetworkConsent()) return undefined;
        return onGdprNetworkConsentGranted(() => {
            void ensureHeavyShellLoaded();
        });
    }, []);

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
