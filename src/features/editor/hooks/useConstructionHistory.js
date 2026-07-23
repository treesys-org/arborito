import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditor } from './useEditor.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { diffTreeData } from '../../tree-graph/api/tree-diff.js';

function formatHistoryTime(ts) {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
}

/** Construction undo timeline modal, jr entry point (no `useEditor()` in `.jsx`). */
export function useConstructionHistory() {
    const {
        ui,
        dismissModal,
        editorActions,
    } = useEditor();

    const {
        getConstructionHistoryTimeline,
        undoConstructionEdit,
        redoConstructionEdit,
        subscribeConstructionUndo,
    } = editorActions;

    const mobile = shouldShowMobileUI();
    const [, bump] = useState(0);
    const [selectedIndex, setSelectedIndex] = useState(null);

    const refresh = useCallback(() => bump((n) => n + 1), []);

    useEffect(() => subscribeConstructionUndo(refresh), [refresh, subscribeConstructionUndo]);

    const { states, currentIndex } = getConstructionHistoryTimeline();

    const activeIndex =
        selectedIndex == null || selectedIndex >= states.length ? currentIndex : selectedIndex;

    const diff = useMemo(() => {
        const sel = states[activeIndex];
        const next = states[activeIndex + 1];
        if (!sel || !next) return null;
        return diffTreeData(sel.snap, next.snap);
    }, [states, activeIndex]);

    const close = useCallback(() => dismissModal(), [dismissModal]);

    const canBack = currentIndex > 0;
    const canFwd = currentIndex < states.length - 1;

    const stepLabel = useCallback(
        (i) => {
            if (i === currentIndex) return ui.conHistoryCurrent || 'Current';
            if (i < currentIndex) return ui.conHistoryPast || 'Earlier';
            return ui.conHistoryFuture || 'After undo';
        },
        [currentIndex, ui]
    );

    const goBack = useCallback(() => {
        void (async () => {
            if (await undoConstructionEdit()) {
                const { currentIndex: ci } = getConstructionHistoryTimeline();
                setSelectedIndex(ci);
                refresh();
            }
        })();
    }, [getConstructionHistoryTimeline, refresh, undoConstructionEdit]);

    const goForward = useCallback(() => {
        void (async () => {
            if (await redoConstructionEdit()) {
                const { currentIndex: ci } = getConstructionHistoryTimeline();
                setSelectedIndex(ci);
                refresh();
            }
        })();
    }, [getConstructionHistoryTimeline, refresh, redoConstructionEdit]);

    const selectStep = useCallback((i) => setSelectedIndex(i), []);

    return {
        ui,
        mobile,
        states,
        currentIndex,
        activeIndex,
        diff,
        canBack,
        canFwd,
        close,
        goBack,
        goForward,
        selectStep,
        stepLabel,
        formatHistoryTime,
        title: ui.conHistoryTitle || 'Historial de cambios',
        emptyLabel: ui.conHistoryEmpty || 'No edits recorded yet.',
        selectStepHint: ui.conHistorySelectStep || 'Select a step to see what changed.',
        diffHeading: ui.conHistoryDiffHeading || 'Changes in this step',
        backLabel: ui.conHistoryBack || 'Back',
        forwardLabel: ui.conHistoryForward || 'Adelante',
        stepSummaryFallback: ui.conHistoryStep || 'Map change',
    };
}
