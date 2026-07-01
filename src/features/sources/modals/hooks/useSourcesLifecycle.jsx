import { useEffect } from 'react';
import { useSourcesStore } from '../../hooks/useSources.js';

function sourcesRefreshSig(v) {
    if (!v || typeof v !== 'object') return '';
    const modal = v.modal;
    const modalType = modal && typeof modal === 'object' ? modal.type : modal;
    return [
        v.activeSource?.id,
        v.activeSource?.url,
        v.communitySources?.length,
        v.availableReleases?.length,
        modalType,
        v.loading ? 1 : 0,
        v.pendingUntrustedSource?.url,
    ].join('|');
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

        void store.userStore?.ensureBranchesHydrated?.().then(() => {
            bump();
        });

        try {
            const modal = store.value?.modal;
            if (modal && typeof modal === 'object' && modal.fromOnboarding) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        window.dispatchEvent(
                            new CustomEvent('arborito-start-tour', {
                                detail: {
                                    source: 'onboarding-sources',
                                    force: true,
                                    skipDockForOpenTrees: true,
                                },
                            })
                        );
                    });
                });
            }
        } catch {
            /* ignore */
        }

        let prevSig = sourcesRefreshSig(store.value);
        const storeListener = () => {
            const sig = sourcesRefreshSig(store.value);
            if (sig === prevSig) return;
            prevSig = sig;
            bump();
        };
        store.addEventListener('state-change', storeListener);

        return () => {
            setOverlay(null);
            setTreeEditor(null);
            store.removeEventListener('state-change', storeListener);
        };
    }, [embed, bump, setMainTab, setActiveTab, setOverlay, setTreeEditor]);
}
