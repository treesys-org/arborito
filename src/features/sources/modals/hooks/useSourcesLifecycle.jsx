import { useEffect } from 'react';
import { useSourcesStore } from '../../hooks/useSources.js';
import { catalogStore } from '../../../../stores/catalog-store.js';
import { TOUR_DONE_KEY_SOURCES_PICKER } from '../../../tour/api/logic/product-tour-steps.js';
import { warmNostrRelayConnections } from '../../../../shared/lib/connected-services/index.js';

function sourcesPickerTourAlreadyDone() {
    try {
        return localStorage.getItem(TOUR_DONE_KEY_SOURCES_PICKER) === 'true';
    } catch {
        return true;
    }
}

function sourcesRefreshSig(v, catalog) {
    if (!v || typeof v !== 'object') return '';
    const modal = v.modal;
    const modalType = modal && typeof modal === 'object' ? modal.type : modal;
    return [
        v.activeSource?.id,
        v.activeSource?.url,
        v.activeSource?.type,
        v.communitySources?.length,
        v.availableReleases?.length,
        modalType,
        v.loading ? 1 : 0,
        v.data ? 1 : 0,
        v.rawGraphData ? 1 : 0,
        v.treeHydrating ? 1 : 0,
        v.pendingUntrustedSource?.url,
        Array.isArray(catalog?.branches) ? catalog.branches.length : 0,
        Array.isArray(catalog?.trees) ? catalog.trees.length : 0,
        catalog?.revision || 0,
    ].join('|');
}

function fireOnboardingSourcesTour() {
    void import('../../../../shared/lib/lazy-stylesheet.js')
        .then((m) => m.ensureDeferredProductTourStyles?.())
        .catch(() => {});
    window.dispatchEvent(
        new CustomEvent('arborito-start-tour', {
            detail: {
                source: 'onboarding-sources',
                force: true,
                skipDockForOpenTrees: true,
            },
        })
    );
}

/**
 * React lifecycle for the sources modal (hydration, store listener, onboarding tour).
 */
export function useSourcesLifecycle({
    embed,
    bump,
    setMainTab,
    setActiveTab,
    setOverlay,
    setTreeEditor,
    setSourcesScope,
    setTreesScope,
}) {
    const store = useSourcesStore();
    useEffect(() => {
        setOverlay(null);
        setTreeEditor(null);

        const m = store.value.modal;
        if (m && typeof m === 'object' && (m.focusTab === 'branch' || m.focusTab === 'mine' || m.focusTab === 'branches')) {
            setActiveTab('branch');
            setMainTab('mine');
            setSourcesScope?.('branch');
        } else if (m && typeof m === 'object' && (m.focusTab === 'explore' || m.focusTab === 'internet')) {
            setActiveTab('branch');
            setMainTab('explore');
            setSourcesScope?.('internet');
        } else if (m && typeof m === 'object' && (m.focusTab === 'trees' || m.focusTab === 'tree')) {
            setActiveTab('trees');
            setMainTab('trees');
            setTreesScope?.('device');
        }

        bump();

        const fromOnboarding = !!(m && typeof m === 'object' && m.fromOnboarding);
        if (fromOnboarding) {
            setMainTab('explore');
            setActiveTab('branch');
            setSourcesScope?.('internet');
            void warmNostrRelayConnections(store, { probe: true }).catch((e) => {
                console.warn('[Arborito] sources onboarding nostr prewarm', e);
            });
        }

        void store.userStore?.ensureBranchesHydrated?.().then(() => {
            bump();
            if (!fromOnboarding || sourcesPickerTourAlreadyDone()) return;
            /* Wait until demo row is mounted (above spinner) so the spotlight cannot land on another branch. */
            let tries = 0;
            const tryStart = () => {
                const demoEl = document.querySelector('[data-arbor-tour="sources-demo-branch"]');
                if (demoEl || tries >= 40) {
                    fireOnboardingSourcesTour();
                    return;
                }
                tries += 1;
                window.setTimeout(tryStart, 50);
            };
            requestAnimationFrame(() => {
                requestAnimationFrame(tryStart);
            });
        });

        /* Re-pull account-saved network courses when opening Fuentes (branches + trees). */
        const signedInName = String(store._authSession?.username || '').trim();
        if (signedInName) {
            void (async () => {
                try {
                    await warmNostrRelayConnections(store, { probe: false }).catch(() => null);
                    if (typeof store.refreshInstalledSourcesFromAccount === 'function') {
                        await store.refreshInstalledSourcesFromAccount({ forcePublish: true });
                    } else {
                        try {
                            await store.loadInstalledSourcesFromAccount?.(signedInName);
                        } catch (e) {
                            console.warn('[Arborito] Fuentes installed-sources refresh failed', e);
                        }
                        try {
                            await store.loadPrivateTreesFromAccount?.(signedInName, { retry: false });
                        } catch (e) {
                            console.warn('[Arborito] Fuentes private-trees refresh failed', e);
                        }
                        try {
                            await store._loadProgressForInstalledSources?.();
                        } catch (e) {
                            console.warn('[Arborito] Fuentes installed progress refresh failed', e);
                        }
                        try {
                            store.publishInstalledSourcesForAccount?.({ immediate: true });
                        } catch {
                            /* ignore */
                        }
                    }
                    store.ensureInstalledSourcesBackgroundSync?.();
                    bump();
                } catch (e) {
                    console.warn('[Arborito] Fuentes account sources refresh failed', e);
                }
            })();
        }

        let prevSig = sourcesRefreshSig(store.value, catalogStore.getState());
        const storeListener = () => {
            const sig = sourcesRefreshSig(store.value, catalogStore.getState());
            if (sig === prevSig) return;
            prevSig = sig;
            bump();
        };
        store.addEventListener('state-change', storeListener);
        const catalogUnsub = catalogStore.subscribe(storeListener);

        return () => {
            setOverlay(null);
            setTreeEditor(null);
            store.removeEventListener('state-change', storeListener);
            catalogUnsub();
        };
    }, [embed, bump, setMainTab, setActiveTab, setOverlay, setTreeEditor, setSourcesScope, setTreesScope]);
}
