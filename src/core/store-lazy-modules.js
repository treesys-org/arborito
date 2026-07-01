import { isFirstVisitOnboarding } from '../shared/lib/onboarding-boot-gate.js';

/** @type {import('../features/backup-export/api/filesystem.js').fileSystem|null} */
let _fileSystem = null;
let _fileSystemPromise = null;

/** @type {Promise<void>|null} */
let _coreMixinsPromise = null;
/** @type {typeof import('../features/sources/api/source-manager.js').SourceManager|null} */
let SourceManager = null;
/** @type {typeof import('../features/forum/api/forum-store.js').ForumStore|null} */
let ForumStore = null;
/** @type {typeof import('../features/tree-graph/api/graph-logic.js').GraphLogic|null} */
let GraphLogic = null;
/** @type {typeof import('../features/p2p-webtorrent/api/webtorrent-service.js').WebTorrentService|null} */
let WebTorrentService = null;
/** @type {Promise<void>|null} */
let _bootServicesPromise = null;
/** @type {Promise<void>|null} */
let _forumStorePromise = null;
/** @type {Promise<void>|null} */
let _webtorrentServicePromise = null;

export function getFileSystemSync() {
    return _fileSystem;
}

export function ensureFileSystemModule() {
    if (_fileSystem) return Promise.resolve(_fileSystem);
    if (!_fileSystemPromise) {
        _fileSystemPromise = import('../features/backup-export/api/filesystem.js').then((m) => {
            _fileSystem = m.fileSystem;
            return _fileSystem;
        });
    }
    return _fileSystemPromise;
}

function ensureBootServices() {
    if (!_bootServicesPromise) {
        _bootServicesPromise = Promise.all([
            import('../features/sources/api/source-manager.js').then((m) => {
                SourceManager = m.SourceManager;
            }),
            import('../features/tree-graph/api/graph-logic.js').then((m) => {
                GraphLogic = m.GraphLogic;
            }),
        ]).then(() => undefined);
    }
    return _bootServicesPromise;
}

export function ensureForumStoreModule() {
    if (ForumStore) return Promise.resolve();
    if (!_forumStorePromise) {
        _forumStorePromise = import('../features/forum/api/forum-store.js').then((m) => {
            ForumStore = m.ForumStore;
        });
    }
    return _forumStorePromise;
}

export function ensureWebTorrentServiceModule() {
    if (WebTorrentService) return Promise.resolve();
    if (!_webtorrentServicePromise) {
        _webtorrentServicePromise = import('../features/p2p-webtorrent/api/webtorrent-service.js').then((m) => {
            WebTorrentService = m.WebTorrentService;
        });
    }
    return _webtorrentServicePromise;
}

/** First visit on onboarding step 1 — defer heavy modules until GDPR consent. */
export function shouldDeferHeavyBoot() {
    return isFirstVisitOnboarding();
}

function ensureCoreStoreMixins() {
    if (!_coreMixinsPromise) {
        _coreMixinsPromise = Promise.resolve();
    }
    return _coreMixinsPromise;
}

/** @type {Promise<void>|null} */
let _appCoreReadyPromise = null;

/** Mixins + sourceManager must exist before loadData / import / tour. */
export function ensureAppCoreReady() {
    if (!_appCoreReadyPromise) {
        _appCoreReadyPromise = Promise.all([
            ensureCoreStoreMixins(),
            ensureBootServices(),
            ensureFileSystemModule(),
        ]).then(() => undefined);
    }
    return _appCoreReadyPromise;
}

export function getSourceManagerClass() {
    if (!SourceManager) throw new Error('[Arborito] sourceManager used before lazy module load');
    return SourceManager;
}

export function getForumStoreClass() {
    if (!ForumStore) throw new Error('[Arborito] forumStore used before lazy module load');
    return ForumStore;
}

export function getGraphLogicClass() {
    if (!GraphLogic) throw new Error('[Arborito] graphLogic used before lazy module load');
    return GraphLogic;
}

export function getWebTorrentServiceClass() {
    if (!WebTorrentService) throw new Error('[Arborito] webtorrent used before lazy module load');
    return WebTorrentService;
}

/** Idle prefetch: forum + WebTorrent are not needed for first paint or tree load. */
export function prefetchSecondaryServices() {
    void ensureForumStoreModule();
    void ensureWebTorrentServiceModule();
}
