import { useEffect, useRef } from 'react';
import { useModalHostRouteState } from '../hooks/useModalHostRouteState.js';
import { useShellModalActions, useShellStore } from '../hooks/useShell.js';
import { markModalChunkLoaded } from '../../shared/ui/modal-chunk-cache.js';
import { clearArboritoGameImmersiveOpen } from '../../shared/ui/breakpoints.js';
import { isModalBackdropEmptyTap } from '../../shared/ui/mobile-tap.js';
import { ModalChunkFallback } from './ModalChunkFallback.jsx';
import { ModalOnboarding } from '../../features/identity-auth/modals/OnboardingModal.jsx';
import { EAGER_MODALS } from './eager-modals.js';
import { useModalChunk } from '../hooks/useModalChunk.js';
import {
    resolveModalRoute,
    syncModalBackdropClasses,
    handleModalEscapeKey,
    handleFocusTrapEscape,
    handleBackdropEmptyTap,
} from './modal-host-logic.js';
import { trapFocus, setMainAppInert } from '../../shared/ui/focus-trap.js';

/* Every eager modal is bundled with the shell, mark chunks ready so gates/prefetch skip them. */
for (const type of Object.keys(EAGER_MODALS)) markModalChunkLoaded(type);

/** Resolve a modal component: eager (bundled) first, else a loaded lazy chunk. */
function modalComponentFor(type) {
    return EAGER_MODALS[type] || null;
}

function ProfileStackModal({ childType }) {
    const Profile = EAGER_MODALS.profile;
    const { Component: Child } = useModalChunk(childType, childType);
    return (
        <div className="arborito-modal-profile-stack h-full min-h-0 flex flex-col flex-1">
            <div className="arborito-modal-profile-stack__base">
                <Profile />
            </div>
            {Child ? (
                <div className="arborito-modal-profile-stack__overlay">
                    <Child />
                </div>
            ) : null}
        </div>
    );
}

function UnknownModal({ type, ui }) {
    const msg = (ui.modalUnknownType || 'Unknown modal: {type}').replace('{type}', String(type));
    return <div className="p-8 bg-white m-4 rounded">{msg}</div>;
}

function ModalRouteContent({ route, ui }) {
    switch (route.kind) {
        case 'none':
        case 'search-redirect':
            return null;
        case 'eager': {
            if (route.type === 'onboarding') return <ModalOnboarding key={route.suspenseKey} />;
            const Eager = EAGER_MODALS[route.type] || modalComponentFor(route.type);
            return Eager ? <Eager key={route.suspenseKey} /> : null;
        }
        case 'profile-stack':
            return <ProfileStackModal childType={route.childType} />;
        case 'lazy': {
            return <LazyModalRoute type={route.type} suspenseKey={route.suspenseKey} ui={ui} chunkType={route.chunkType} />;
        }
        case 'unknown':
            return <UnknownModal type={route.type} ui={ui} />;
        default:
            return null;
    }
}

function LazyModalRoute({ type, suspenseKey, ui, chunkType }) {
    const pendingInstantRef = useRef(false);
    const { ready, Component, needsChunk } = useModalChunk(type, suspenseKey);
    if (!ready) {
        if (needsChunk) pendingInstantRef.current = true;
        return <ModalChunkFallback chunkType={chunkType || type} ui={ui} />;
    }
    if (!Component) return null;
    const instantReveal = pendingInstantRef.current;
    pendingInstantRef.current = false;
    return <Component key={suspenseKey} instantReveal={instantReveal} />;
}

/** Modal router, pure React replacement for ArboritoModals. */
export function ModalHost() {
    const state = useModalHostRouteState();
    const { setModal } = useShellModalActions();
    const shellStore = useShellStore();
    const hostRef = useRef(null);
    const focusTrapReleaseRef = useRef(null);
    const route = resolveModalRoute(state);
    const routedType = state.modal ? state.modal.type || state.modal : null;

    useEffect(() => {
        if (routedType !== 'game-player') clearArboritoGameImmersiveOpen();
    }, [routedType]);

    useEffect(() => {
        if (route.kind !== 'search-redirect') return;
        window.dispatchEvent(new CustomEvent('arborito-desktop-search-open'));
        setModal(null);
    }, [route.kind, setModal]);

    useEffect(() => {
        const onEscape = (e) => {
            if (e.key !== 'Escape') return;
            handleModalEscapeKey(shellStore.value, shellStore);
        };
        document.addEventListener('keydown', onEscape);
        return () => document.removeEventListener('keydown', onEscape);
    }, [shellStore]);

    useEffect(() => {
        const syncBackdrop = () => {
            const backdrop = hostRef.current?.querySelector('#modal-backdrop');
            if (backdrop) syncModalBackdropClasses(backdrop, shellStore.value);
        };
        syncBackdrop();
        const onViewport = () => syncBackdrop();
        window.addEventListener('arborito-viewport', onViewport);
        return () => window.removeEventListener('arborito-viewport', onViewport);
    }, [state.modal, state.viewMode, route.kind, route.suspenseKey, shellStore]);

    useEffect(() => {
        if (route.kind === 'none' || route.kind === 'search-redirect') {
            if (focusTrapReleaseRef.current) {
                focusTrapReleaseRef.current();
                focusTrapReleaseRef.current = null;
            }
            setMainAppInert(false);
            return undefined;
        }

        let cancelled = false;
        let boundBackdrop = null;

        const releaseBoundTrap = () => {
            if (focusTrapReleaseRef.current) {
                focusTrapReleaseRef.current();
                focusTrapReleaseRef.current = null;
            }
            boundBackdrop = null;
        };

        const bindModalTrap = () => {
            if (cancelled) return;
            const host = hostRef.current;
            if (!host) return;

            const backdrop = host.querySelector('#modal-backdrop');
            if (!backdrop || backdrop === boundBackdrop) return;

            releaseBoundTrap();

            const focusable = host.querySelector(
                '[autofocus], input:not([type="hidden"]), button, a[href]'
            );
            if (focusable) focusable.focus();

            backdrop.classList.add('arborito-modal-root');
            syncModalBackdropClasses(backdrop, shellStore.value);

            setMainAppInert(true);
            focusTrapReleaseRef.current = trapFocus(backdrop, {
                onEscape: () => handleFocusTrapEscape(shellStore),
            });
            boundBackdrop = backdrop;

            if (!backdrop.dataset.dismissBound) {
                backdrop.dataset.dismissBound = '1';
                backdrop.addEventListener('click', (e) => {
                    if (!isModalBackdropEmptyTap(backdrop, e)) return;
                    handleBackdropEmptyTap(shellStore);
                });
            }
        };

        const timer = setTimeout(bindModalTrap, 50);

        const host = hostRef.current;
        const observer =
            host &&
            new MutationObserver(() => {
                bindModalTrap();
            });
        if (observer && host) {
            observer.observe(host, { childList: true, subtree: true });
        }

        return () => {
            cancelled = true;
            clearTimeout(timer);
            observer?.disconnect();
            releaseBoundTrap();
            setMainAppInert(false);
        };
    }, [route.kind, route.suspenseKey, shellStore]);

    useEffect(
        () => () => {
            if (focusTrapReleaseRef.current) {
                focusTrapReleaseRef.current();
                focusTrapReleaseRef.current = null;
            }
            setMainAppInert(false);
        },
        []
    );

    const showContent = route.kind !== 'none' && route.kind !== 'search-redirect';

    return (
        <div ref={hostRef} data-arborito-panel="modals">
            {showContent ? <ModalRouteContent route={route} ui={state.ui} /> : null}
        </div>
    );
}
