import { UserStore } from './user-store/index.js';
import { ShellStore } from '../stores/shell-store.js';
import { syncReactSnapshot } from '../stores/react-state.js';
import { bindArboritoStore } from './store-singleton.js';
import { createDefaultGraphUi } from '../features/tree-graph/api/graph-ui-state.js';
import { initStoreInstanceFields } from './store-boot-sequence.js';
import { wireStorePrototype } from './store-wiring.js';

export { ensureAppCoreReady, prefetchSecondaryServices } from './store-lazy-modules.js';

class Store extends ShellStore {
    constructor() {
        super();

        this.userStore = new UserStore(
            () => this.ui,
            (payload) => this.maybeSyncNetworkProgress?.(payload)
        );
        void this.userStore.ensureBranchesHydrated().then(() => {
            this.update({});
        });

        this.state.graphUi = createDefaultGraphUi();
        initStoreInstanceFields(this);
    }
}

wireStorePrototype(Store);

export const store = new Store();
bindArboritoStore(store);
syncReactSnapshot(store);
