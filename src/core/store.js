import { UserStore } from './user-store/index.js';
import { ShellStore } from '../stores/shell-store.js';
import { syncReactSnapshot } from '../stores/react-state.js';
import { syncCatalogStoreFromUserStore } from '../stores/catalog-store.js';
import { bindArboritoStore } from './store-singleton.js';
import { createDefaultGraphUi } from '../features/tree-graph/api/graph-ui-state.js';
import { initStoreInstanceFields } from './store-boot-sequence.js';
import { wireStorePrototype } from './store-wiring.js';
import { DEMO_BRANCH_ID } from './demo/arborito-demo-ids.js';
import { bundledDemoBootSource } from './demo/seed-arborito-demo.js';

export { ensureAppCoreReady, prefetchSecondaryServices } from './store-lazy-modules.js';

class Store extends ShellStore {
    constructor() {
        super();

        this.userStore = new UserStore(
            () => this.ui,
            (payload) => {
                this.maybeSyncNetworkProgress?.(payload);
                this.maybeSyncPrivateAccountBranches?.();
            },
            (revision) => {
                syncCatalogStoreFromUserStore(this.userStore);
                this.update({ catalogRevision: revision });
            }
        );
        void this.userStore.ensureBranchesHydrated().then(async () => {
            syncCatalogStoreFromUserStore(this.userStore);
            this.update({ catalogRevision: this.userStore._catalogRevision || 0 });
            /* Seed may replace IDB while an older demo graph is already in memory. */
            if (this.userStore._demoReseededAt) {
                const url = String(this.state.activeSource?.url || '');
                const onDemo =
                    url === `branch://${DEMO_BRANCH_ID}` ||
                    (this.state.activeSource?.type === 'branch' &&
                        String(this.state.activeSource?.id || '') === DEMO_BRANCH_ID);
                if (onDemo) {
                    const src = bundledDemoBootSource(this.userStore);
                    if (src && typeof this.loadData === 'function') {
                        try {
                            /*
                             * Boot owns the first paint. Remounting here while boot is still
                             * mounting (or right after it painted) blanks the canvas and
                             * shows “Cargando árbol de conocimiento…”.
                             */
                            if (!this._sourceBootFinished) return;
                            const sameId =
                                String(this.state.activeSource?.id || '') === String(src.id || '');
                            if (sameId && (this.state.data || this.state.treeHydrating)) return;
                            await this.loadData(src, false, { skipConstructionLoadConfirm: true });
                        } catch (e) {
                            console.warn('[Arborito] remount demo after seed failed', e);
                        }
                    }
                }
            }
        });

        this.state.graphUi = createDefaultGraphUi();
        initStoreInstanceFields(this);
    }
}

wireStorePrototype(Store);

export const store = new Store();
bindArboritoStore(store);
syncReactSnapshot(store);
