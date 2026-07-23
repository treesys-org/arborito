import { Callout } from '../../../../shared/ui/Callout.jsx';

export function RoadmapSection({ ui }) {
    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 pl-4">
            <div className="flex items-center gap-3 mb-8">
                <span className="text-3xl">🗺️</span>
                <h2 className="text-xl font-black text-slate-800 dark:text-white">{ui.roadmapTitle || 'The Roadmap'}</h2>
            </div>

            <div className="relative space-y-8 border-l-2 border-slate-200 dark:border-slate-700 ml-3">
                <div className="relative pl-8">
                    <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white dark:border-slate-900 shadow-sm animate-pulse" />
                    <Callout tone="green" layout="stack">
                        <span className="arborito-pill arborito-pill--sm arborito-pill--green mb-2 self-start">
                            {ui.roadmapCurrent || 'Current Phase'}
                        </span>
                        <h3 className="arborito-callout__title text-lg mb-1">
                            🌱 {ui.roadmapPhase1 || 'Phase 1: The Seed'}
                        </h3>
                        <p className="arborito-callout__body">
                            {ui.roadmapPhase1Desc || 'Foundation & Content Growth'}
                        </p>
                    </Callout>
                </div>

                <div className="relative pl-8 opacity-80">
                    <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-900" />
                    <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">
                        🌿 {ui.roadmapPhase2 || 'Phase 2: The Sapling'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{ui.roadmapPhase2Desc || 'Community & Collaboration'}</p>
                </div>

                <div className="relative pl-8 opacity-60">
                    <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900" />
                    <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">
                        🌳 {ui.roadmapPhase3 || 'Phase 3: The Forest'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{ui.roadmapPhase3Desc || 'Decentralized Ecosystem'}</p>
                </div>
            </div>

            <div className="mt-12 text-center pl-4 pr-8">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    {ui.roadmapExternalHint || 'Roadmap updates are published with the app releases.'}
                </p>
            </div>
        </div>
    );
}
