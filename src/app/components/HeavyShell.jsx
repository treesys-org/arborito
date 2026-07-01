import { useEffect, useState } from 'react';
import { isFirstVisitOnboarding } from '../../shared/lib/onboarding-boot-gate.js';
import { Sidebar } from '../../features/shell-chrome/components/Sidebar.jsx';
import { Graph } from '../../features/tree-graph/components/Graph.jsx';
import { Content } from '../../features/learning/components/Content.jsx';
import { ConstructionPanel } from '../../features/editor/components/ConstructionPanel.jsx';
import { ProgressWidget } from '../../features/garden-progress/components/ProgressWidget.jsx';

/** Main shell: sidebar, graph, content, construction, progress. */
export function HeavyShell() {
    const [ready, setReady] = useState(!isFirstVisitOnboarding());

    useEffect(() => {
        if (!isFirstVisitOnboarding()) return undefined;
        const onDone = () => setReady(true);
        window.addEventListener('arborito-onboarding-complete', onDone, { once: true });
        return () => window.removeEventListener('arborito-onboarding-complete', onDone);
    }, []);

    if (!ready) return null;

    return (
        <>
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
        </>
    );
}
