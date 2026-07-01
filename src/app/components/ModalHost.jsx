import { Suspense, useEffect, useRef, useState } from 'react';
import { useModalHostRouteState } from '../hooks/useModalHostRouteState.js';
import { useShell, useShellStore } from '../hooks/useShell.js';
import {
    MODAL_EXPORT_NAMES,
    EAGER_MODAL_TYPES,
    chunkIsReady,
    ensureModalChunk,
} from '../modal-chunk-loaders.js';
import { ModalOnboarding } from '../../features/identity-auth/modals/OnboardingModal.jsx';
import { markModalChunkLoaded } from '../../shared/ui/modal-chunk-cache.js';
import { clearArboritoGameImmersiveOpen } from '../../shared/ui/breakpoints.js';
import { isModalBackdropEmptyTap } from '../../shared/ui/mobile-tap.js';
import { ModalChunkFallback } from './ModalChunkFallback.jsx';
import { ModalShell } from './ModalShell.jsx';
import { EAGER_MODALS } from './eager-modals.js';
import {
    resolveModalRoute,
    syncModalBackdropClasses,
    handleModalEscapeKey,
    handleFocusTrapEscape,
    handleBackdropEmptyTap,
} from './modal-host-logic.js';
import { trapFocus, setMainAppInert } from '../../shared/ui/focus-trap.js';

/* Every eager modal is bundled with the shell — mark chunks ready so gates/prefetch skip them. */
for (const type of Object.keys(EAGER_MODALS)) markModalChunkLoaded(type);

/** Resolve a modal component: eager (bundled) first, else the lazy chunk wrapper. */
function modalComponentFor(type) {
    return EAGER_MODALS[type] || null;
}

function LazyModal({ type }) {
    const Component = modalComponentFor(type);
    if (!Component) return null;
    return <Component />;
}

function ProfileStackModal({ childType }) {
    const Profile = EAGER_MODALS.profile;
    const Child = modalComponentFor(childType);
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

function ContributorModalBridge() {
    const AdminPanel = modalComponentFor('contributor');
    if (!AdminPanel) return null;
    return (
        <ModalShell layout="dock" panelClass="arborito-contributor-modal-shell">
            <AdminPanel embed />
        </ModalShell>
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
            if (route.type === 'onboarding') return <ModalOnboarding />;
            const Eager = EAGER_MODALS[route.type];
            return Eager ? <Eager /> : null;
        }
        case 'profile-stack':
            return <ProfileStackModal childType={route.childType} />;
        case 'contributor':
            return <ContributorModalBridge />;
        case 'lazy':
            return <LazyModal type={route.type} />;
        case 'unknown':
            return <UnknownModal type={route.type} ui={ui} />;
        default:
            return null;
    }
}

function resolveChunkGateType(route) {
    if (route.kind === 'none' || route.kind === 'search-redirect' || route.kind === 'eager') {
        return null;
    }
    if (route.kind === 'profile-stack') return route.childType || 'profile';
    return route.chunkType || route.type || null;
}

/** Wait for the shared chunk cache before mounting lazy modals (no duplicate fetch). */
function ModalChunkGate({ route, ui, children }) {
    const gateType = resolveChunkGateType(route);
    const needsChunk =
        gateType && MODAL_EXPORT_NAMES[gateType] && !EAGER_MODAL_TYPES.has(gateType);
    const [ready, setReady] = useState(() => !needsChunk || chunkIsReady(gateType));

    useEffect(() => {
        if (!needsChunk) {
            setReady(true);
            return undefined;
        }
        if (chunkIsReady(gateType)) {
            setReady(true);
            return undefined;
        }

        let cancelled = false;
        setReady(false);
        void (async () => {
            if (cancelled) return;
            try {
                await ensureModalChunk(gateType);
            } catch {
                /* lazy/Suspense surfaces load errors */
            }
            if (!cancelled) setReady(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [route.suspenseKey, gateType, needsChunk]);

    if (!ready) {
        return <ModalChunkFallback chunkType={gateType || route.chunkType} ui={ui} />;
    }
    return children;
}

/** Modal router — pure React replacement for ArboritoModals. */
export function ModalHost() {
    const state = useModalHostRouteState();
    const { setModal } = useShell();
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
        const timer = setTimeout(() => {
            if (cancelled) return;
            const host = hostRef.current;
            if (!host) return;

            const focusable = host.querySelector(
                '[autofocus], input:not([type="hidden"]), button, a[href]'
            );
            if (focusable) focusable.focus();

            const backdrop = host.querySelector('#modal-backdrop');
            if (!backdrop) return;

            backdrop.classList.add('arborito-modal-root');
            syncModalBackdropClasses(backdrop, shellStore.value);

            if (focusTrapReleaseRef.current) {
                focusTrapReleaseRef.current();
            }
            setMainAppInert(true);
            focusTrapReleaseRef.current = trapFocus(backdrop, {
                onEscape: () => handleFocusTrapEscape(shellStore),
            });

            if (!backdrop.dataset.dismissBound) {
                backdrop.dataset.dismissBound = '1';
                backdrop.addEventListener('click', (e) => {
                    if (!isModalBackdropEmptyTap(backdrop, e)) return;
                    handleBackdropEmptyTap(shellStore);
                });
            }
        }, 50);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            if (focusTrapReleaseRef.current) {
                focusTrapReleaseRef.current();
                focusTrapReleaseRef.current = null;
            }
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
            {showContent ? (
                <ModalChunkGate route={route} ui={state.ui}>
                    <Suspense
                        key={route.suspenseKey}
                        fallback={<ModalChunkFallback chunkType={route.chunkType} ui={state.ui} />}
                    >
                        <ModalRouteContent route={route} ui={state.ui} />
                    </Suspense>
                </ModalChunkGate>
            ) : null}
        </div>
    );
}
