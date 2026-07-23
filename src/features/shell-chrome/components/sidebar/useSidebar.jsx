import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShellChrome } from '../../hooks/useShellChrome.js';
import { useShellMobileChromeSync } from '../../hooks/useShellMobileChromeSync.js';
import { useRegisterPanel } from '../../../../app/hooks/useRegisterPanel.js';
import { getPanelRef } from '../../../../app/panel-refs.js';
import { curriculumBaseName } from '../../../version-updates/api/version-switch-logic.js';
import {
    initMobileDetection,
    useDockModalChrome,
    useViewportShell,
} from '../../../../shared/ui/breakpoints.js';
import { closeProgressWidgetIfOpenOnStore } from '../../../../stores/shell-sage-lifecycle.js';
import { getArboritoStore } from '../../../../core/store-singleton.js';
import {
    prefetchAboutModalChunk,
    prefetchCertificatesModalChunk,
    ensureCertificatesModalChunk,
} from '../../../../shared/lib/lazy-stylesheet.js';
import {
    prefetchProfileMenuOnIntent,
    prefetchConstructionShellOnIntent,
    prefetchMobileMenuModalChunks,
} from '../../../../app/modal-open-bridge.js';
import { prefetchModal } from '../../../../app/modal-open.js';
import { shouldShowWebDownloadUi } from '../../../../shared/ui/download-app-panel.js';
import { countCareDue } from '../../../garden-progress/api/care-reminders.js';

initMobileDetection();

const DRILL_PANES = new Set(['language', 'about', 'sources', 'certs', 'community']);

function normalizeMenuStack(stack) {
    const filtered = (stack || []).filter((p) => DRILL_PANES.has(p));
    return filtered.length > 1 ? [filtered[filtered.length - 1]] : filtered;
}

function mobileProgressPct(shell) {
    try {
        const modules = shell.getModulesStatus();
        const total = modules.reduce((acc, m) => acc + (m.totalLeaves || 0), 0);
        const done = modules.reduce((acc, m) => acc + (m.completedLeaves || 0), 0);
        return total === 0 ? 0 : Math.round((done / total) * 100);
    } catch {
        return 0;
    }
}

function mobileProgressScopeClass(shell) {
    try {
        return shell.getProgressScope?.() === 'tree' ? 'arborito-progress--tree' : 'arborito-progress--branch';
    } catch {
        return 'arborito-progress--branch';
    }
}

export function useSidebar() {
    const shell = useShellChrome();
    const { ui, setModal, dismissModal, search, searchBroad } = shell;
    const state = shell;
    const { mobile, desktopForest: isDesktop } = useViewportShell();

    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mobileMenuStack, setMobileMenuStack] = useState([]);
    const [mmenuFreshEnter, setMmenuFreshEnter] = useState(false);
    const [mmenuReopenInstant, setMmenuReopenInstant] = useState(false);
    const [mmenuPaneDir, setMmenuPaneDir] = useState(null);
    const [aboutDrillTab, setAboutDrillTab] = useState(null);
    const [forumEmbedSubNavOpen, setForumEmbedSubNavOpen] = useState(false);
    const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
    const [deskSearch, setDeskSearch] = useState({ query: '', results: [], isSearching: false });
    const [, setSidebarRenderTick] = useState(0);

    const deskSearchTimerRef = useRef(null);
    const aboutDrillTabRef = useRef(null);
    aboutDrillTabRef.current = aboutDrillTab;

    const mmenuPane = mobileMenuStack.length
        ? mobileMenuStack[mobileMenuStack.length - 1]
        : 'root';

    const closeMobileMenuIfOpen = useCallback(() => {
        setMobileMenuOpen((open) => {
            if (!open) return open;
            setMobileMenuStack([]);
            return false;
        });
    }, []);

    const openMobileMoreMenu = useCallback(() => {
        prefetchMobileMenuModalChunks();
        setMobileMenuOpen(true);
        setMobileMenuStack([]);
        setMmenuFreshEnter(false);
        setMmenuReopenInstant(true);
    }, []);

    const requestRender = useCallback(() => {
        if (typeof window !== 'undefined' && window.arboritoElectron) {
            setSidebarRenderTick((n) => n + 1);
        }
    }, []);

    const pushMmenuPaneRef = useRef(async () => {});

    const panelApi = useMemo(
        () => ({
            get isMobileMenuOpen() {
                return isMobileMenuOpen;
            },
            closeMobileMenuIfOpen,
            openMobileMoreMenu,
            pushMmenuPane: (pane) => void pushMmenuPaneRef.current?.(pane),
            setForumEmbedSubNavOpen,
            requestRender,
            render() {
                requestRender();
            },
            renderKey: null,
        }),
        [isMobileMenuOpen, closeMobileMenuIfOpen, openMobileMoreMenu, requestRender]
    );

    useRegisterPanel('sidebar', () => panelApi);

    useShellMobileChromeSync({
        mobileMoreOpen: isMobileMenuOpen,
        modal: state.modal,
        viewMode: state.viewMode,
        selectedNode: state.selectedNode,
        previewNode: state.previewNode,
        treeHydrating: state.treeHydrating,
        data: state.data,
    });

    useEffect(() => {
        const onViewport = () => requestRender();
        window.addEventListener('arborito-viewport', onViewport);
        return () => window.removeEventListener('arborito-viewport', onViewport);
    }, [requestRender]);

    useEffect(() => {
        if (!aboutDrillTab || mmenuPane !== 'about') return undefined;
        const tab = aboutDrillTab;
        let cancelled = false;
        const tryApply = () => {
            const about = getPanelRef('modal-about');
            if (about?.openTab) {
                about.openTab(tab);
                if (!cancelled) setAboutDrillTab(null);
                return true;
            }
            return false;
        };
        if (tryApply()) return undefined;
        prefetchAboutModalChunk();
        const id = requestAnimationFrame(() => {
            if (!tryApply() && !cancelled) setAboutDrillTab(null);
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(id);
        };
    }, [aboutDrillTab, mmenuPane]);

    const toggleMobileMenu = useCallback(() => {
        const m = shell.modal;
        const modalType = m && (typeof m === 'string' ? m : m.type);
        const fromMoreStack =
            m && typeof m === 'object' && (m.fromMobileMore || m.fromConstructionMore);

        if (fromMoreStack) {
            dismissModal({ returnToMore: false });
            setMobileMenuOpen(false);
            setMobileMenuStack([]);
            return;
        }

        setMobileMenuOpen((open) => {
            const opening = !open;
            if (opening) {
                setMobileMenuStack([]);
                setMmenuFreshEnter(true);
                prefetchAboutModalChunk();
                prefetchProfileMenuOnIntent();
                prefetchConstructionShellOnIntent();
                const keepOpen = new Set(['game-player', 'onboarding']);
                if (modalType && !keepOpen.has(modalType)) {
                    dismissModal({ returnToMore: false });
                }
            } else {
                if (m && typeof m === 'object' && m.fromMobileMore) {
                    dismissModal({ returnToMore: false });
                }
                setMobileMenuStack([]);
            }
            return opening;
        });
    }, [dismissModal, shell.modal]);

    const mobileMenuStackRef = useRef(mobileMenuStack);
    mobileMenuStackRef.current = mobileMenuStack;

    const mobileMenuGoBack = useCallback(() => {
        const stack = mobileMenuStackRef.current;
        const pane = stack.length ? stack[stack.length - 1] : null;
        if (pane === 'forum') {
            const forum = getPanelRef('modal-forum');
            if (forum?.handleMoreBack?.()) return;
        }
        setMobileMenuStack((s) => {
            if (s.length > 0) {
                setMmenuPaneDir('back');
                return s.slice(0, -1);
            }
            setMobileMenuOpen(false);
            return [];
        });
    }, []);

    const pushMmenuPane = useCallback(async (pane) => {
        if (pane === 'sources') {
            closeProgressWidgetIfOpenOnStore(getArboritoStore());
        }
        setMmenuPaneDir('forward');
        if (pane === 'arborito-support') {
            setMobileMenuStack((s) => {
                if (s.includes('community')) return ['community', 'arborito-support'];
                if (s.includes('about')) return ['about', 'arborito-support'];
                return ['arborito-support'];
            });
            return;
        }
        if (pane === 'about') prefetchAboutModalChunk();
        if (pane === 'certs') {
            prefetchCertificatesModalChunk();
            await ensureCertificatesModalChunk();
        }
        if (pane === 'forum') prefetchModal('forum');
        if (pane === 'celebration') prefetchModal('celebration-prefs');
        if (pane === 'a11y') prefetchModal('accessibility-prefs');
        if (pane === 'sources') prefetchModal('sources');
        if (pane === 'language') {
            setMobileMenuStack((s) => normalizeMenuStack([...s, 'language']));
        } else {
            setMobileMenuStack([pane]);
        }
    }, []);
    pushMmenuPaneRef.current = pushMmenuPane;

    const drillMobileMoreAbout = useCallback((tab = 'manifesto') => {
        setMobileMenuOpen(true);
        setMmenuPaneDir('forward');
        setMobileMenuStack(['about']);
        setMmenuFreshEnter(false);
        setAboutDrillTab(tab);
    }, []);

    const mobileMenuAction = useCallback((fn) => {
        return (...args) => {
            const wasOpen = isMobileMenuOpen;
            if (wasOpen) setMobileMenuOpen(false);
            fn(...args);
            const m = shell.modal;
            const keepMoreDom = wasOpen && m && typeof m === 'object' && m.fromMobileMore;
            if (wasOpen && !keepMoreDom) {
                queueMicrotask(() => setMobileMenuStack([]));
            }
        };
    }, [isMobileMenuOpen, shell.modal]);

    const mmenuOpenModal = useCallback(
        (payload) =>
            mobileMenuAction(() => {
                setModal({ ...payload, fromMobileMore: true });
            }),
        [mobileMenuAction, setModal]
    );

    const dockToggleModal = useCallback((payload) => {
        const cur = shell.modal;
        const curType = cur && (typeof cur === 'string' ? cur : cur.type);
        if (curType === payload.type) {
            setModal(null);
            return;
        }
        setModal(payload);
    }, [setModal, shell.modal]);

    const pickLanguage = useCallback(async (code) => {
        setMmenuPaneDir('back');
        setMobileMenuStack((s) => (s.length ? s.slice(0, -1) : s));
        try {
            await shell.setLanguage(code);
        } catch (e) {
            console.error('[Arborito] sidebar language pick', e);
        }
    }, []);

    const openDesktopSearch = useCallback(() => {
        setDesktopSearchOpen(true);
        if (deskSearchTimerRef.current) clearTimeout(deskSearchTimerRef.current);
        deskSearchTimerRef.current = null;
        setDeskSearch({ query: '', results: [], isSearching: false });
    }, []);

    const closeDesktopSearch = useCallback(() => {
        setDesktopSearchOpen(false);
        if (deskSearchTimerRef.current) clearTimeout(deskSearchTimerRef.current);
        deskSearchTimerRef.current = null;
        setDeskSearch({ query: '', results: [], isSearching: false });
    }, []);

    const runDeskSearch = useCallback((q) => {
        if (deskSearchTimerRef.current) clearTimeout(deskSearchTimerRef.current);
        if (!q.length) {
            setDeskSearch({ query: q, results: [], isSearching: false });
            return;
        }
        if (q.length === 1) {
            setDeskSearch((ds) => ({ ...ds, query: q, isSearching: true }));
            deskSearchTimerRef.current = setTimeout(async () => {
                try {
                    const results = await searchBroad(q);
                    setDeskSearch((ds) =>
                        ds.query === q ? { ...ds, results, isSearching: false } : ds
                    );
                } catch {
                    setDeskSearch((ds) =>
                        ds.query === q ? { ...ds, results: [], isSearching: false } : ds
                    );
                }
            }, 500);
            return;
        }
        setDeskSearch((ds) => ({ ...ds, query: q, isSearching: true }));
        deskSearchTimerRef.current = setTimeout(async () => {
            try {
                const results = await search(q);
                setDeskSearch((ds) =>
                    ds.query === q ? { ...ds, results, isSearching: false } : ds
                );
            } catch {
                setDeskSearch((ds) =>
                    ds.query === q ? { ...ds, results: [], isSearching: false } : ds
                );
            }
        }, 300);
    }, [search, searchBroad]);

    const refreshDeskSearch = useCallback(() => {
        runDeskSearch(deskSearch.query);
    }, [runDeskSearch, deskSearch.query]);

    useEffect(() => {
        const onDeskOpen = () => {
            if (!isDesktop) return;
            setDesktopSearchOpen(true);
            setDeskSearch({ query: '', results: [], isSearching: false });
        };
        const onDeskRefresh = () => {
            if (!desktopSearchOpen) return;
            queueMicrotask(() => runDeskSearch(deskSearch.query));
        };
        window.addEventListener('arborito-desktop-search-open', onDeskOpen);
        window.addEventListener('arborito-desktop-search-refresh', onDeskRefresh);
        return () => {
            window.removeEventListener('arborito-desktop-search-open', onDeskOpen);
            window.removeEventListener('arborito-desktop-search-refresh', onDeskRefresh);
        };
    }, [desktopSearchOpen, deskSearch.query, runDeskSearch, isDesktop]);

    useEffect(() => {
        if (mmenuFreshEnter) {
            const id = requestAnimationFrame(() => setMmenuFreshEnter(false));
            return () => cancelAnimationFrame(id);
        }
        if (mmenuReopenInstant) {
            const id = requestAnimationFrame(() => setMmenuReopenInstant(false));
            return () => cancelAnimationFrame(id);
        }
        return undefined;
    }, [mmenuFreshEnter, mmenuReopenInstant, isMobileMenuOpen]);

    const g = state.gamification || {};
    const mobProfileChipLabel = mobile
        ? String(g.username || '').trim() || ui.navProfile || 'Profile'
        : '';

    const modalType = typeof state.modal === 'string' ? state.modal : state.modal?.type || null;
    const lessonOpen = !!(state.selectedNode || state.previewNode);
    const dueCount = countCareDue(shell);
    const mobProgressPctVal = mobile && state.data ? mobileProgressPct(shell) : 0;

    const chrome = {
        isDesktop,
        mobile,
        ui,
        state,
        g,
        modalType,
        lessonOpen,
        dueCount,
        mobProfileChipLabel,
        mobProgressPct: mobProgressPctVal,
        mobProgressScope: mobileProgressScopeClass(shell),
        searchActive: isDesktop
            ? desktopSearchOpen
            : state.modal === 'search' || modalType === 'search',
        sageActive: state.modal === 'sage' || modalType === 'sage',
        arcadeActive: state.modal === 'arcade' || modalType === 'arcade',
        homeActive:
            state.viewMode === 'explore' && !state.modal && !lessonOpen && !isMobileMenuOpen,
        moreActive: isMobileMenuOpen,
        constructionMode: state.constructionMode,
        curLang: shell.currentLangInfo,
        lang: state.lang,
        theme: state.theme,
        showWebDownload: shouldShowWebDownloadUi(),
        treeName: curriculumBaseName(ui) || ui.sourcesActiveTreeFallback || 'Tree',
        forumNavEnabled: shell.forumNavEnabled !== false,
    };

    return {
        chrome,
        ui: ui,
        isMobileMenuOpen,
        mobileMenuStack,
        mmenuPane,
        mmenuFreshEnter,
        mmenuReopenInstant,
        mmenuPaneDir,
        setMmenuPaneDir,
        desktopSearchOpen,
        deskSearch,
        toggleMobileMenu,
        mobileMenuGoBack,
        pushMmenuPane,
        drillMobileMoreAbout,
        mmenuOpenModal,
        dockToggleModal,
        pickLanguage,
        closeDesktopSearch,
        openDesktopSearch,
        runDeskSearch,
        refreshDeskSearch,
        setDesktopSearchOpen,
        closeMobileMenuIfOpen,
        mobileMenuAction,
        forumEmbedSubNavOpen,
        useDockModalChrome: useDockModalChrome(),
    };
}
