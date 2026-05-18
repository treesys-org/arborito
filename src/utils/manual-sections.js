/**
 * Shared Arborito guide sections for manual modal and Sage “What is Arborito?”.
 */
export function getManualSections(ui) {
    return [
        { id: 'intro', title: ui.manualPhilosophyTitle || 'Philosophy', icon: '🌱' },
        { id: 'nav', title: ui.manualNavigationTitle || 'Navigation', icon: '🗺️' },
        { id: 'learn', title: ui.manualLearningTitle || 'Learning', icon: '📝' },
        { id: 'garden', title: ui.manualGardenTitle || 'The Garden', icon: '🎒' },
        { id: 'arcade', title: ui.manualArcadeTitle || 'Arcade', icon: '🎮' },
        { id: 'sage', title: ui.manualSageTitle || 'Sage (AI)', icon: '🦉' },
        { id: 'construct', title: ui.navConstruct || ui.manualConstructTitle || 'Construction Mode', icon: '👷' },
        { id: 'authoring', title: ui.manualAuthoringTitle || 'Courses without a terminal', icon: '🚀' },
        { id: 'data', title: ui.manualDataTitle || 'Data & Sync', icon: '💾' }
    ];
}

export function renderManualSectionHtml(ui, sectionId) {
    switch (sectionId) {
        case 'intro':
            return `
                <section class="scroll-mt-4">
                    <h2 class="text-lg font-black m-0 mb-2">${ui.manualHeader || ui.manualTitle || 'Arborito Guide'}</h2>
                    <p class="text-sm leading-relaxed m-0 mb-4">${ui.manualIntroText || ''}</p>
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                        <strong class="text-blue-700 dark:text-blue-300 block mb-2 text-sm">${ui.manualPhilosophyCore || ''}</strong>
                        <div class="text-sm text-slate-700 dark:text-slate-200">${ui.manualPhilosophyDesc || ''}</div>
                    </div>
                </section>`;
        case 'nav':
            return `
                <section class="scroll-mt-4">
                    <h2 class="text-lg font-black m-0 mb-2">${ui.manualNavigationTitle || ''}</h2>
                    <p class="text-sm m-0 mb-3">${ui.manualNavDesc || ''}</p>
                    <ul class="grid grid-cols-1 gap-2 list-none p-0 m-0 text-sm">
                        <li class="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700"><strong>${ui.manualNavPan || ''}</strong><br>${ui.manualNavPanDesc || ''}</li>
                        <li class="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700"><strong>${ui.manualNavZoom || ''}</strong><br>${ui.manualNavZoomDesc || ''}</li>
                        <li class="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700"><strong>${ui.manualNavExpand || ''}</strong><br>${ui.manualNavExpandDesc || ''}</li>
                        <li class="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700"><strong>${ui.manualNavFocus || ''}</strong><br>${ui.manualNavFocusDesc || ''}</li>
                    </ul>
                </section>`;
        case 'learn':
            return `
                <section class="scroll-mt-4">
                    <h2 class="text-lg font-black m-0 mb-2">${ui.manualLearningTitle || ''}</h2>
                    <p class="text-sm m-0 mb-3">${ui.manualLearnDesc || ''}</p>
                    <ul class="space-y-2 text-sm m-0 pl-4">
                        <li><strong>${ui.manualLearnRoots} (🌳):</strong> ${ui.manualLearnRootsDesc || ''}</li>
                        <li><strong>${ui.manualLearnModules} (📁):</strong> ${ui.manualLearnModulesDesc || ''}</li>
                        <li><strong>${ui.manualLearnLessons} (📄):</strong> ${ui.manualLearnLessonsDesc || ''}</li>
                        <li><strong>${ui.manualLearnExams} (⚔️):</strong> ${ui.manualLearnExamsDesc || ''}</li>
                    </ul>
                </section>`;
        case 'garden':
            return `
                <section class="scroll-mt-4">
                    <h2 class="text-lg font-black m-0 mb-2">${ui.manualGardenTitle || ''}</h2>
                    <p class="text-sm m-0 mb-3">${ui.manualGardenDesc || ''}</p>
                    <ul class="text-sm m-0 pl-4 space-y-1">
                        <li><strong>${ui.manualGardenSeeds || ''}</strong></li>
                        <li><strong>${ui.manualGardenStreak || ''}</strong></li>
                        <li><strong>${ui.manualGardenXP || ''}</strong></li>
                        <li><strong>${ui.manualGardenMemory || ''}</strong></li>
                    </ul>
                </section>`;
        case 'arcade':
            return `
                <section class="scroll-mt-4">
                    <h2 class="text-lg font-black m-0 mb-2">${ui.manualArcadeTitle || ''}</h2>
                    <p class="text-sm m-0 mb-3">${ui.manualArcadeDesc || ''}</p>
                    <div class="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-xl border border-purple-100 dark:border-purple-800 text-sm">
                        <strong>${ui.manualArcadeContextTitle || ''}</strong> ${ui.manualArcadeContextBody || ''}
                    </div>
                </section>`;
        case 'sage':
            return `
                <section class="scroll-mt-4">
                    <h2 class="text-lg font-black m-0 mb-2">${ui.manualSageTitle || ''}</h2>
                    <p class="text-sm m-0 mb-3">${ui.manualSageIntro || ''}</p>
                    <ul class="text-sm m-0 pl-4 space-y-1">
                        <li><strong>${ui.sageModeLocal || 'Local'}:</strong> ${ui.manualSageLocalDesc || ''}</li>
                        <li><strong>${ui.sageModeInBrowser || 'In-browser'}:</strong> ${ui.manualSageInBrowser || ''}</li>
                    </ul>
                </section>`;
        case 'construct':
            return `
                <section class="scroll-mt-4">
                    <h2 class="text-lg font-black m-0 mb-2">${ui.navConstruct || ui.manualConstructTitle || ''}</h2>
                    <p class="text-sm m-0 mb-3">${ui.manualConstructDesc || ''}</p>
                    <ol class="text-sm m-0 pl-5 space-y-1">
                        <li>${ui.manualConstructStep1 || ''}</li>
                        <li>${ui.manualConstructStep2 || ''}</li>
                        <li>${ui.manualConstructStep3 || ''}</li>
                        <li>${ui.manualConstructStep4 || ''}</li>
                        <li>${ui.manualConstructStep5 || ''}</li>
                    </ol>
                </section>`;
        case 'authoring':
            return `
                <section class="scroll-mt-4">
                    <h2 class="text-lg font-black m-0 mb-2">${ui.manualAuthoringTitle || ''}</h2>
                    <div class="manual-authoring-body text-sm prose prose-sm dark:prose-invert max-w-none">${ui.manualAuthoringBody || ''}</div>
                </section>`;
        case 'data':
            return `
                <section class="scroll-mt-4">
                    <h2 class="text-lg font-black m-0 mb-2">${ui.manualDataTitle || ''}</h2>
                    <p class="text-sm m-0 mb-3">${ui.manualDataDesc || ''}</p>
                    ${ui.manualDataPresence ? `<p class="text-sm">${ui.manualDataPresence}</p>` : ''}
                    <ul class="text-sm m-0 pl-4 space-y-1">
                        <li>${ui.manualDataExport || ''}</li>
                        <li>${ui.manualDataImport || ''}</li>
                    </ul>
                </section>`;
        default:
            return '';
    }
}
