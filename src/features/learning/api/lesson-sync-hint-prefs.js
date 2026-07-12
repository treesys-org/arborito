const DISMISS_KEY = 'arborito-lesson-sync-hint-dismissed';

export function isLessonSyncHintDismissed() {
    try {
        return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
        return false;
    }
}

export function dismissLessonSyncHint() {
    try {
        localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
        /* ignore */
    }
}

/** True once the learner has visited a section, answered a quiz, or moved the progress bar. */
export function lessonHasMeaningfulProgress(visitedSections, quizStates, progressPct) {
    if (progressPct > 0) return true;
    if (visitedSections && visitedSections.size > 0) return true;
    if (quizStates && typeof quizStates === 'object') {
        for (const st of Object.values(quizStates)) {
            if (st?.started || st?.finished) return true;
        }
    }
    return false;
}
