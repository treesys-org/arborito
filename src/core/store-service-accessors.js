import { storageManager } from '../features/backup-export/api/storage-manager.js';
import {
    getForumStoreClass,
    getGraphLogicClass,
    getSourceManagerClass,
    getWebTorrentServiceClass,
} from './store-lazy-modules.js';

/** Lazy service instances + derived store accessors (descriptor map for applyPrototypeAccessors). */
export const storeServiceAccessorDescriptors = {
    sourceManager: {
        get() {
            if (!this._sourceManager) {
                const SourceManager = getSourceManagerClass();
                this._sourceManager = new SourceManager(
                    (updates) => this.update(updates),
                    () => this.ui
                );
            }
            return this._sourceManager;
        },
    },

    forumStore: {
        get() {
            if (!this._forumStore) {
                const ForumStore = getForumStoreClass();
                this._forumStore = new ForumStore();
            }
            return this._forumStore;
        },
    },

    graphLogic: {
        get() {
            if (!this._graphLogic) {
                const GraphLogic = getGraphLogicClass();
                this._graphLogic = new GraphLogic(this);
            }
            return this._graphLogic;
        },
    },

    webtorrent: {
        get() {
            if (!this._webtorrent) {
                const WebTorrentService = getWebTorrentServiceClass();
                this._webtorrent = new WebTorrentService();
            }
            return this._webtorrent;
        },
    },

    dailyXpGoal: {
        get() {
            return this.userStore.dailyXpGoal;
        },
    },

    storage: {
        get() {
            return storageManager;
        },
    },

    authSession: {
        get() {
            return this._authSession;
        },
    },

    nostr: {
        get() {
            return this._nostr;
        },
    },

    aiLogic: {
        get() {
            if (!this._aiLogic) {
                void this.ensureAILogic();
            }
            return this._aiLogic;
        },
    },

    value: {
        get() {
            return {
                ...this.state,
                completedNodes: this.userStore.state.completedNodes,
                bookmarks: this.userStore.state.bookmarks,
                gamification: this.userStore.state.gamification,
            };
        },
    },
};
