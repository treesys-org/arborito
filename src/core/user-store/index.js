import { normalizeGamification } from './_helpers.js';
import { progressMixin } from './progress.js';
import { bookmarksMixin } from './bookmarks.js';
import { streakMixin } from './streak.js';
import { gamificationMixin } from './gamification.js';
import { inventoryMixin } from './inventory.js';
import { branchesMixin } from './branches.js';
import { branchNodesMixin } from './branch-nodes.js';
import { branchPublishMixin } from './branch-publish.js';
import { treesMixin } from './trees.js';
import { installedGamesMixin } from './installed-games.js';
import { frozenTreesMixin } from './frozen-trees.js';
import { srsMemoryMixin } from './srs-memory.js';
import { applyPrototypeMethods } from '../apply-prototype-methods.js';

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
            frozenTrees: {},
            gameData: {}, 
            branches: [],
            trees: [],
            cloudProgressSync: false,
            memory: {},
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

    get settings() {
        return this;
    }

    load() {
        this.loadProgress();
        this.loadBookmarks();
        this.checkStreak();
    }
}

applyPrototypeMethods(
    UserStore.prototype,
    progressMixin,
    bookmarksMixin,
    streakMixin,
    gamificationMixin,
    inventoryMixin,
    branchesMixin,
    branchNodesMixin,
    branchPublishMixin,
    treesMixin,
    installedGamesMixin,
    frozenTreesMixin,
    srsMemoryMixin
);
