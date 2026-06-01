import { normalizeGamification } from './_helpers.js';
import { progressMixin } from './progress.js';
import { bookmarksMixin } from './bookmarks.js';
import { streakMixin } from './streak.js';
import { gamificationMixin } from './gamification.js';
import { inventoryMixin } from './inventory.js';
import { localTreesMixin } from './local-trees.js';
import { localTreeNodesMixin } from './local-tree-nodes.js';
import { localTreePublishMixin } from './local-tree-publish.js';
import { installedGamesMixin } from './installed-games.js';
import { srsMemoryMixin } from './srs-memory.js';

export class UserStore {
    constructor(uiStringsGetter, onPersistCallback = null) {
        this.getUi = uiStringsGetter; 
        this.onPersist = onPersistCallback;
        this.state = {
            completedNodes: new Set(),
            bookmarks: {},
            installedGames: [], 
            gameRepos: [], 
            offlineGames: {},
            gameData: {}, 
            localTrees: [], 
            cloudProgressSync: false,
            memory: {}, // Arborito memory core (SRS state)
            gamification: normalizeGamification({
                username: '',
                avatar: '👤',
                xp: 0,
                dailyXP: 0,
                streak: 0,
                lastLoginDate: null,
                seeds: []
            })
        };
        this.load();
    }

    get dailyXpGoal() { return 50; }

    /** Compat: store and UI use `userStore.settings.method()`; logic lives on this class. */
    get settings() {
        return this;
    }

    load() {
        this.loadProgress();
        this.loadBookmarks();
        this.checkStreak();
    }
}

Object.assign(
    UserStore.prototype,
    progressMixin,
    bookmarksMixin,
    streakMixin,
    gamificationMixin,
    inventoryMixin,
    localTreesMixin,
    localTreeNodesMixin,
    localTreePublishMixin,
    installedGamesMixin,
    srsMemoryMixin
);
