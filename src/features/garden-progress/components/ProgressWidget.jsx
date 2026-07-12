import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { useViewportShell } from '../../../shared/ui/breakpoints.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { prepareShellForMochilaOpen } from '../../../stores/shell-overlay-coordinator.js';
import { DockHubShell } from '../../../app/components/DockHubShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { DockHubSheet } from '../../../shared/ui/DockHubSheet.jsx';
import {
    PROGRESS_DOCK_BACKDROP_ID,
    PROGRESS_DOCK_SHEET_ID,
    PROGRESS_MODAL_HTML_CLASS,
    syncPanelSheetFullbleedClass,
} from '../../../shared/ui/dock-sheet-chrome.js';
import { ProgressGardenBody } from './ProgressGardenBody.jsx';
import { deriveWidgetBodyData, getProgressStats } from '../api/progress-widget-body.js';

export function ProgressWidget() {
    const garden = useGardenProgress();
    const {
        ui,
        setModal,
        setViewMode,
        dailyXpGoal,
        getCareDueCount,
        getCareStats,
        openArcadeCare,
        constructionMode,
        data,
        gamification,
        userStore,
        gardenProgressActions,
    } = garden;

    const { getAllAchievements } = gardenProgressActions;
    const rootRef = useRef(null);
    const panelApiRef = useRef({
        isOpen: false,
        renderKey: null,
        _scheduleRender: () => {},
    });
    const [, forceRender] = useState(0);
    const bump = useCallback(() => forceRender((n) => n + 1), []);
    const [isOpen, setIsOpen] = useState(false);
    const [instantOpen, setInstantOpen] = useState(false);
    const { mobile: mob } = useViewportShell();
    const prevMobRef = useRef(mob);

    const scheduleRender = useCallback(() => {
        bump();
    }, [bump]);

    const closeSheet = useCallback(() => {
        setIsOpen(false);
        panelApiRef.current.isOpen = false;
        scheduleRender();
    }, [scheduleRender]);

    panelApiRef.current.isOpen = isOpen;
    panelApiRef.current.renderKey = null;
    panelApiRef.current._scheduleRender = scheduleRender;
    panelApiRef.current.close = closeSheet;

    useRegisterPanel('progress-widget', () => panelApiRef.current);

    const toggle = useCallback(() => {
        setIsOpen((open) => {
            const next = !open;
            if (next) {
                prepareShellForMochilaOpen(getArboritoStore());
                setInstantOpen(true);
            }
            panelApiRef.current.isOpen = next;
            return next;
        });
        scheduleRender();
    }, [scheduleRender]);

    useEffect(() => {
        if (prevMobRef.current === mob) return;
        prevMobRef.current = mob;
        if (!isOpen) return;
        closeSheet();
    }, [mob, isOpen, closeSheet]);

    useEffect(() => {
        const onToggle = () => toggle();
        document.addEventListener('toggle-progress-widget', onToggle);
        return () => document.removeEventListener('toggle-progress-widget', onToggle);
    }, [toggle]);

    useEffect(() => {
        const onDocClick = (e) => {
            if (!panelApiRef.current.isOpen) return;
            const root = rootRef.current;
            if (!root) return;
            if (!root.contains(e.target) && !e.target.closest?.('.js-btn-progress-mobile')) {
                setIsOpen(false);
                panelApiRef.current.isOpen = false;
                scheduleRender();
            }
        };
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
    }, [scheduleRender]);

    useEffect(() => {
        if (!mob) return undefined;
        syncPanelSheetFullbleedClass(PROGRESS_MODAL_HTML_CLASS, isOpen);
        return () => syncPanelSheetFullbleedClass(PROGRESS_MODAL_HTML_CLASS, false);
    }, [mob, isOpen]);

    useEffect(() => {
        const onViewport = () => scheduleRender();
        const onProgress = () => scheduleRender();
        const onGraph = () => scheduleRender();
        const store = getArboritoStore();
        window.addEventListener('arborito-viewport', onViewport);
        window.addEventListener('arborito-emoji-ready', onViewport);
        window.addEventListener('arborito-user-progress-changed', onProgress);
        window.addEventListener('graph-update', onGraph);
        store?.addEventListener('graph-update', onGraph);
        return () => {
            window.removeEventListener('arborito-viewport', onViewport);
            window.removeEventListener('arborito-emoji-ready', onViewport);
            window.removeEventListener('arborito-user-progress-changed', onProgress);
            window.removeEventListener('graph-update', onGraph);
            store?.removeEventListener('graph-update', onGraph);
        };
    }, [scheduleRender]);

    if (constructionMode || !data) {
        return null;
    }

    const stats = getProgressStats();
    const g = gamification ?? userStore?.state?.gamification ?? {};
    const dailyGoalVal = dailyXpGoal || 0;
    const collectedItems = g.seeds || g.fruits || [];
    const certsAll = getAllAchievements();
    const dueCount = getCareDueCount();
    const careStats = getCareStats();
    const progressHeading = ui.progressTitle || 'Tu mochila';

    const compactCtx = {
        ui,
        g,
        stats,
        dailyProgress: dailyGoalVal <= 0 ? 0 : Math.min(100, Math.round(((g.dailyXP || 0) / dailyGoalVal) * 100)),
        dailyGoalVal,
        collectedItems,
        certsAll,
        seedsWord: ui.seedsTitle || 'Semillas',
        trophyLabel: ui.navCertificates || 'Logros',
        seedsLabel: ui.gardenTitle || ui.seedsTitle || 'Semillas',
        dueCount,
        careStats,
        progressHeading,
    };

    const desktopBody = deriveWidgetBodyData(compactCtx, { omitActions: true });
    const mobileBody = deriveWidgetBodyData(compactCtx, {
        mobile: true,
        omitGardenBlock: true,
        modalFull: true,
    });

    const bindMochilaClick = (e, mobClose) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const certBtn = t.closest('.js-mochila-open-cert');
        if (certBtn) {
            e.stopPropagation();
            const raw = certBtn.getAttribute('data-id');
            if (!raw) return;
            let id;
            try {
                id = decodeURIComponent(raw);
            } catch {
                id = raw;
            }
            setModal({ type: 'certificate', moduleId: id });
            if (mobClose) {
                setIsOpen(false);
                panelApiRef.current.isOpen = false;
                scheduleRender();
            }
            return;
        }
        if (t.closest('.js-mochila-certs')) {
            e.stopPropagation();
            setViewMode('certificates');
            if (mobClose) {
                setIsOpen(false);
                panelApiRef.current.isOpen = false;
                scheduleRender();
            }
            return;
        }
        if (t.closest('.js-mochila-care')) {
            e.stopPropagation();
            openArcadeCare();
            if (mobClose) {
                setIsOpen(false);
                panelApiRef.current.isOpen = false;
                scheduleRender();
            }
        }
    };

    const closeMobile = () => {
        closeSheet();
    };

    const mobileHero =
        isOpen && mob ? (
            <ModalHubHero
                ui={ui}
                mobile
                title={progressHeading}
                subtitle={ui.progressBackpackTagline || 'Lo que llevas en el bosque'}
                leadingIcon="🎒"
                tagClass="btn-close-mobile-mochila"
                onClose={closeMobile}
            />
        ) : null;

    if (instantOpen && isOpen && mob) {
        queueMicrotask(() => setInstantOpen(false));
    }

    return (
        <div ref={rootRef} data-arborito-panel="progress-widget" style={{ display: 'block' }}>
            <div className="relative">
                {!mob && (
                    <div className="arborito-desktop-mochila-host">
                        <aside
                            className="arborito-mochila-card arborito-mochila-card--v2"
                            aria-label={progressHeading}
                            onClick={(e) => bindMochilaClick(e, false)}
                        >
                            <ProgressGardenBody data={desktopBody} />
                        </aside>
                    </div>
                )}

                {isOpen && mob && (
                    <DockHubSheet
                        backdropId={PROGRESS_DOCK_BACKDROP_ID}
                        sheetId={PROGRESS_DOCK_SHEET_ID}
                        ariaLabel={progressHeading}
                        instantReveal={instantOpen}
                        onBackdropClose={closeMobile}
                    >
                        <div
                            className="flex flex-col flex-1 min-h-0 h-full min-w-0"
                            data-arborito-panel="progress-widget-mobile"
                        >
                            <DockHubShell mobile hero={mobileHero} skipBodyWrap>
                                <div
                                    className="arborito-mochila-mobile-scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar"
                                    onClick={(e) => bindMochilaClick(e, true)}
                                >
                                    <ProgressGardenBody data={mobileBody} />
                                </div>
                            </DockHubShell>
                        </div>
                    </DockHubSheet>
                )}
            </div>
        </div>
    );
}
