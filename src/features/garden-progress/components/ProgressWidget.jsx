import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ProgressGardenBody } from './ProgressGardenBody.jsx';
import {
    deriveWidgetBodyData,
    getProgressStats,
    syncProgressModalChrome,
} from '../api/progress-widget-body.js';

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

    const { getAvailableCertificates } = gardenProgressActions;
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
    const mob = shouldShowMobileUI();

    const scheduleRender = useCallback(() => {
        bump();
    }, [bump]);

    panelApiRef.current.isOpen = isOpen;
    panelApiRef.current.renderKey = null;
    panelApiRef.current._scheduleRender = scheduleRender;

    useRegisterPanel('progress-widget', () => panelApiRef.current);

    const toggle = useCallback(() => {
        setIsOpen((open) => {
            const next = !open;
            syncProgressModalChrome(next);
            if (next) setInstantOpen(true);
            panelApiRef.current.isOpen = next;
            return next;
        });
        scheduleRender();
    }, [scheduleRender]);

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
                syncProgressModalChrome(false);
                scheduleRender();
            }
        };
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
    }, [scheduleRender]);

    useEffect(() => {
        const onViewport = () => scheduleRender();
        window.addEventListener('arborito-viewport', onViewport);
        window.addEventListener('arborito-emoji-ready', onViewport);
        return () => {
            window.removeEventListener('arborito-viewport', onViewport);
            window.removeEventListener('arborito-emoji-ready', onViewport);
        };
    }, [scheduleRender]);

    useEffect(() => () => syncProgressModalChrome(false), []);

    useEffect(() => {
        if (constructionMode || !data) {
            syncProgressModalChrome(false);
            return;
        }
        syncProgressModalChrome(isOpen && mob);
    }, [isOpen, mob, constructionMode, data]);

    if (constructionMode || !data) {
        return null;
    }

    const stats = getProgressStats();
    const g = gamification ?? userStore?.state?.gamification ?? {};
    const dailyGoalVal = dailyXpGoal || 0;
    const collectedItems = g.seeds || g.fruits || [];
    const certsAll = getAvailableCertificates();
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
                syncProgressModalChrome(false);
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
                syncProgressModalChrome(false);
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
                syncProgressModalChrome(false);
                scheduleRender();
            }
        }
    };

    const closeMobile = () => {
        setIsOpen(false);
        panelApiRef.current.isOpen = false;
        syncProgressModalChrome(false);
        scheduleRender();
    };

    const mobileHero =
        isOpen && mob ? (
            <ModalHubHero
                ui={ui}
                mobile
                title={progressHeading}
                subtitle={ui.progressBackpackTagline || 'Lo que llevas en el bosque'}
                leadingIcon={<ChromeEmoji emoji="🎒" size={24} />}
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
                    <DockModalShell
                        mobile
                        sizeTier="HUB"
                        skipBodyWrap
                        hero={mobileHero}
                        shellOpts={{
                            backdropId: 'mobile-widget-overlay',
                            z: 220,
                            scrim: 'translucent',
                            instantOpen,
                        }}
                        onBackdropClick={closeMobile}
                    >
                        <div
                            className="arborito-mochila-mobile-scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar"
                            onClick={(e) => bindMochilaClick(e, true)}
                        >
                            <ProgressGardenBody data={mobileBody} />
                        </div>
                    </DockModalShell>
                )}
            </div>
        </div>
    );
}
