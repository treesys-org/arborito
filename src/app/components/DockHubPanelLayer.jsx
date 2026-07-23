import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';
import { useShellUiSlice } from '../../stores/shell-ui-store.js';
import { useStore } from 'zustand';
import { reactStateStore } from '../../stores/react-state.js';
import { useShellModalActions } from '../hooks/useShell.js';
import {
    resolveModalSurface,
    resolveBrowseDockHubChunkType,
    resolveConstructionDockHubChunkType,
    BROWSE_DOCK_HUB_BACKDROP_ID,
    BROWSE_DOCK_HUB_SHEET_ID,
} from '../modal-surface-routing.js';
import { useModalChunk } from '../hooks/useModalChunk.js';
import { ModalChunkFallback } from './ModalChunkFallback.jsx';
import { DockHubSheet } from '../../shared/ui/DockHubSheet.jsx';
import { DockHubEmbedCloseProvider } from '../../shared/ui/DockHubEmbedContext.jsx';
import {
    DockHubTabCacheSlot,
    getDockHubCachedTypes,
    isDockHubCacheableType,
    recordDockHubTabVisit,
} from './DockHubTabCache.jsx';

function dockHubAriaLabel(type, ui) {
    switch (type) {
        case 'search':
            return ui?.navSearch || 'Search';
        case 'arcade':
            return ui?.arcadeTitle || 'Arcade';
        case 'forum':
            return ui?.forumTitle || 'Forum';
        case 'certificates':
            return ui?.navCertificates || 'Logros';
        case 'tree-info':
            return ui?.treeInfoTitle || 'Tree info';
        default:
            return 'Panel';
    }
}

function BrowseHubFallback({ chunkType, ui }) {
    return (
        <DockHubSheet
            backdropId={BROWSE_DOCK_HUB_BACKDROP_ID}
            sheetId={BROWSE_DOCK_HUB_SHEET_ID}
            ariaLabel="Loading"
        >
            <ModalChunkFallback chunkType={chunkType} ui={ui} />
        </DockHubSheet>
    );
}

function ConstructionHubFallback({ chunkType, ui }) {
    return <ModalChunkFallback chunkType={chunkType} ui={ui} dockHost />;
}

function DockHubEmbedMount({ type, active }) {
    const { ready, Component } = useModalChunk(type, type);
    if (!ready || !Component) return null;
    return <Component dockEmbed dockEmbedActive={active} />;
}

function BrowseDockHubPanel({ activeType, ui }) {
    const { dismissModal } = useShellModalActions();
    const closeRef = useRef(() => dismissModal());
    const { ready, chunkType } = useModalChunk(activeType, activeType);
    const cachedTypes = useMemo(() => getDockHubCachedTypes(activeType), [activeType]);
    const cacheable = isDockHubCacheableType(activeType);

    useEffect(() => {
        closeRef.current = () => dismissModal();
    }, [dismissModal]);

    if (!ready) {
        return <BrowseHubFallback chunkType={chunkType || activeType} ui={ui} />;
    }

    const onBackdropClose = () => closeRef.current?.();

    if (!cacheable) {
        return (
            <DockHubSheet
                backdropId={BROWSE_DOCK_HUB_BACKDROP_ID}
                sheetId={BROWSE_DOCK_HUB_SHEET_ID}
                ariaLabel={dockHubAriaLabel(activeType, ui)}
                onBackdropClose={onBackdropClose}
            >
                <DockHubEmbedCloseProvider closeRef={closeRef} fallbackClose={dismissModal}>
                    <DockHubEmbedMount type={activeType} active />
                </DockHubEmbedCloseProvider>
            </DockHubSheet>
        );
    }

    return (
        <DockHubSheet
            backdropId={BROWSE_DOCK_HUB_BACKDROP_ID}
            sheetId={BROWSE_DOCK_HUB_SHEET_ID}
            ariaLabel={dockHubAriaLabel(activeType, ui)}
            onBackdropClose={onBackdropClose}
        >
            <DockHubEmbedCloseProvider closeRef={closeRef} fallbackClose={dismissModal}>
                {cachedTypes.map((type) => (
                    <DockHubTabCacheSlot key={type} type={type} visible={type === activeType}>
                        <DockHubEmbedMount type={type} active={type === activeType} />
                    </DockHubTabCacheSlot>
                ))}
            </DockHubEmbedCloseProvider>
        </DockHubSheet>
    );
}

function ConstructionDockHubPanel({ activeType, ui }) {
    const pendingInstantRef = useRef(false);
    const { ready, Component, chunkType, needsChunk } = useModalChunk(activeType, activeType);

    if (!ready) {
        if (needsChunk) pendingInstantRef.current = true;
        return <ConstructionHubFallback chunkType={chunkType || activeType} ui={ui} />;
    }
    if (!Component) return null;
    const instantReveal = pendingInstantRef.current;
    pendingInstantRef.current = false;
    return <Component dockHost instantReveal={instantReveal} />;
}

/**
 * Unified dock hub panel layer (browse + construction mobile sheets).
 * @param {{ surface: 'browse' | 'construction' }} props
 */
export function DockHubPanelLayer({ surface }) {
    const { modal, viewMode } = useShellUiSlice(
        useShallow((s) => ({ modal: s.modal, viewMode: s.viewMode }))
    );
    const ui = useStore(reactStateStore, (s) => s.ui);
    const mob = shouldShowMobileUI();
    const state = useMemo(() => ({ modal, viewMode }), [modal, viewMode]);

    const resolvedSurface = resolveModalSurface(state, mob);
    const active =
        surface === 'browse'
            ? resolvedSurface === 'browse-dock-hub'
            : resolvedSurface === 'construction-dock-hub';

    const activeType =
        surface === 'browse'
            ? resolveBrowseDockHubChunkType(state, mob)
            : resolveConstructionDockHubChunkType(state);

    useEffect(() => {
        if (active && surface === 'browse' && activeType) {
            recordDockHubTabVisit(activeType);
        }
    }, [active, surface, activeType]);

    if (!active || !activeType) return null;

    if (surface === 'browse') {
        return <BrowseDockHubPanel activeType={activeType} ui={ui} />;
    }

    return <ConstructionDockHubPanel activeType={activeType} ui={ui} />;
}
