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
export function useSourcesLifecycle({ embed, bump, setMainTab, setActiveTab, setOverlay, setTreeEditor }) {
    const store = useSourcesStore();
    useEffect(() => {
        setOverlay(null);
        setTreeEditor(null);

        const m = store.value.modal;
        if (m && typeof m === 'object' && m.focusTab === 'branch') {
            setActiveTab('branch');
            setMainTab('branches');
        } else if (m && typeof m === 'object' && (m.focusTab === 'trees' || m.focusTab === 'tree')) {
            setActiveTab('trees');
            setMainTab('trees');
        }

        bump();

        const fromOnboarding = !!(m && typeof m === 'object' && m.fromOnboarding);
        if (fromOnboarding) {
            setMainTab('branches');
            setActiveTab('branch');
            void warmNostrRelayConnections(store, { probe: true }).catch((e) => {
                console.warn('[Arborito] sources onboarding nostr prewarm', e);
            });
        }

        void store.userStore?.ensureBranchesHydrated?.().then(() => {
            bump();
            if (!fromOnboarding || sourcesPickerTourAlreadyDone()) return;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => fireOnboardingSourcesTour());
            });
        });

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
    }, [embed, bump, setMainTab, setActiveTab, setOverlay, setTreeEditor]);
}
