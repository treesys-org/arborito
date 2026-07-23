import { isFirstVisitOnboarding } from '../shared/lib/onboarding-boot-gate.js';
import { onGdprNetworkConsentGranted } from '../shared/lib/connected-services/index.js';
import { runAfterPaint, scheduleIdle } from '../shared/lib/yield-to-paint.js';
import { getArboritoStore } from '../core/store-singleton.js';
import { persistTreeUiState } from '../features/tree-graph/api/tree-ui-persist.js';
import { initMobileDetection } from '../shared/ui/breakpoints.js';
import {
    initElectronViewportRepaint,
    scheduleStartupRepaints,
    initViewportRelayout,
} from '../shared/ui/viewport-repaint.js';
import { initSceneBackground } from '../shared/ui/scene-background.js';
import { initArborTips } from '../shared/ui/arbor-tip.js';
import { initA11y } from '../shared/ui/a11y.js';
import { syncLessonReaderChromeClass } from '../shared/ui/lesson-reader-open.js';
import { syncMobileTreeShellClass } from '../shared/ui/mobile-tree-shell-class.js';
import { scheduleDeferredShellComponents } from '../shell-lazy-init.js';
import {
    applyArboritoTheme,
    hasExplicitThemePreference,
    resolveStoredTheme,
} from '../shared/lib/boot-theme.js';
import { scheduleBootLoaderFallback } from '../boot-loader.js';
import { initEmojiRendering } from '../shared/lib/emoji-display.js';
import { ensureWebTorrentLoaded } from '../features/p2p-webtorrent/api/boot-webtorrent.js';
import {
    hasGdprNetworkConsent,
} from '../shared/lib/connected-services/index.js';
import { ensureDeferredProductTourStyles } from '../shared/lib/lazy-stylesheet.js';
import { getPanelRef } from '../app/panel-refs.js';
import { initElectronWindowCloseGuard } from '../app/electron-window-close.js';
import { initElectronAppUpdatePrompt } from '../app/electron-app-update.js';
import { flushConstructDraftToLocalStorage } from '../features/editor/api/logic/flush-construct-draft-on-exit.js';
import { persistActiveComposedBranchFromRaw } from '../features/forest/api/persist-composed-branch-from-raw.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import '../shared/ui/modal-dispatcher.js';

/* Dev-only debug handle: inspect store state from the browser console. */
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    window.__arborito = { getPanelRef, get store() { return getArboritoStore(); } };
}

/** @type {Promise<void>|null} */
let _heavyShellPromise = null;

export function ensureHeavyShellLoaded() {
    if (!_heavyShellPromise) {
        _heavyShellPromise = Promise.all([
            import('../features/shell-chrome/components/Sidebar.jsx'),
            import('../features/tree-graph/components/Graph.jsx'),
            import('../features/learning/components/Content.jsx'),
        ]).then(() => undefined);
    }
    return _heavyShellPromise;
}

function scheduleHeavyShellAfterOnboarding() {
    if (typeof window === 'undefined') return;
    const run = () => scheduleIdle(() => void ensureHeavyShellLoaded(), 400);
    window.addEventListener('arborito-onboarding-complete', run, { once: true });
}

function armEmojiRendering() {
    const start = () => {
        void initEmojiRendering().catch((e) => console.warn('[Arborito] emoji init failed', e));
    };
    /* Twemoji is vendored locally — start after first paint on all platforms so Forest /
     * onboarding catalog icons are not blank for several seconds on desktop first visit. */
    runAfterPaint(start);
}

function scheduleWebTorrentLoad() {
    scheduleIdle(() => {
        ensureWebTorrentLoaded().catch((e) =>
            console.error('[Arborito] WebTorrent deferred load failed', e)
        );
    }, 4000);
}

function armWebTorrentScheduling() {
    if (document.readyState === 'complete') {
        scheduleWebTorrentLoad();
    } else {
        window.addEventListener('load', scheduleWebTorrentLoad, { once: true });
    }
}

const reapplyConstructionHtmlClass = () => {
    document.documentElement.classList.toggle(
        'arborito-construction-mobile',
        !!getArboritoStore()?.value.constructionMode
    );
};

const reapplyMobileShellClasses = () => {
    reapplyConstructionHtmlClass();
    const sb = getPanelRef('sidebar');
    const store = getArboritoStore();
    syncMobileTreeShellClass(store, { mobileMoreOpen: !!(sb && sb.isMobileMenuOpen) });
    syncLessonReaderChromeClass(store);
};

/** Runs once before React paints the shell. */
export function runStartup() {
    applyArboritoTheme(resolveStoredTheme());
    ensureDeferredProductTourStyles();
    scheduleBootLoaderFallback();

    try {
        const h = window.location?.hostname || '';
        if ((h === '127.0.0.1' || h === '::1') && window.location.protocol !== 'file:') {
            const u = new URL(window.location.href);
            u.hostname = 'localhost';
            window.location.replace(u.toString());
            return;
        }
    } catch {
        /* ignore */
    }

    if (isFirstVisitOnboarding()) {
        /* Prefetch shell chunks so the forest is visible behind the welcome card. */
        void ensureHeavyShellLoaded();
        onGdprNetworkConsentGranted(scheduleHeavyShellAfterOnboarding);
        // Twemoji is vendored locally (data URIs + /vendor/emoji PNGs), not third-party network.
        armEmojiRendering();
    } else {
        void ensureHeavyShellLoaded();
        armEmojiRendering();
    }

    if (hasGdprNetworkConsent()) {
        armWebTorrentScheduling();
    } else {
        onGdprNetworkConsentGranted(armWebTorrentScheduling);
    }

    scheduleDeferredShellComponents();
    scheduleIdle(() => {
        void import('../features/learning/modals/SageOverlay.jsx');
        void import('../features/tour/components/ProductTour.jsx');
    }, 1500);

    const applyViewport = initMobileDetection();
    initSceneBackground();
    initArborTips();
    initA11y();

    window.addEventListener('arborito-viewport', () => {
        reapplyMobileShellClasses();
    });
    reapplyMobileShellClasses();
    initViewportRelayout();
    initElectronViewportRepaint();
    initElectronWindowCloseGuard();
    initElectronAppUpdatePrompt();

    window.addEventListener('load', () => {
        applyViewport();
        scheduleStartupRepaints();
    });

    window.addEventListener('beforeunload', (event) => {
        try {
            persistTreeUiState(getArboritoStore());
        } catch {
            /* ignore */
        }
        /* Sync flush pending construct draft into localStorage before the tab dies. */
        try {
            flushConstructDraftToLocalStorage();
        } catch {
            /* ignore */
        }
        /* Flush debounced branch / composed-tree structure autosave. */
        try {
            const st = getArboritoStore();
            if (st?._branchAutosaveTimer) {
                clearTimeout(st._branchAutosaveTimer);
                st._branchAutosaveTimer = null;
            }
            if (fileSystem.isLocalComposedTree?.()) {
                persistActiveComposedBranchFromRaw(st, st.state?.rawGraphData);
            } else if (typeof st?.persistActiveBranchIfNeeded === 'function') {
                st.persistActiveBranchIfNeeded();
            }
        } catch {
            /* ignore */
        }
        /* Electron uses IPC close guard with Save / Don't save / Cancel (see electron-window-close.js). */
        if (window.arboritoElectron?.respondWindowClose) return;
        const contentEl = getPanelRef('content');
        if (contentEl?.hasActiveQuizInProgress?.() || contentEl?.hasExamAttemptInProgress?.()) {
            event.preventDefault();
            event.returnValue = '';
            return;
        }
        if (contentEl?._isLessonDirty?.()) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    const initialTheme = resolveStoredTheme();
    applyArboritoTheme(initialTheme);
    getArboritoStore()?.setTheme(initialTheme);

    const followSystemTheme = (newTheme) => {
        if (hasExplicitThemePreference()) return;
        if (newTheme === 'dark' || newTheme === 'light') {
            getArboritoStore()?.setTheme(newTheme);
        }
    };

    if (!hasExplicitThemePreference()) {
        const bridge = window.arboritoElectron?.systemTheme;
        if (bridge && typeof bridge.onChanged === 'function') {
            bridge.onChanged(followSystemTheme);
        } else if (window.matchMedia) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            darkModeQuery.addEventListener('change', (e) => {
                followSystemTheme(e.matches ? 'dark' : 'light');
            });
        }
    }

    scheduleStartupRepaints();
}
