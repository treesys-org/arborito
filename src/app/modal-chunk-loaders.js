import { isModalChunkLoaded, markModalChunkLoaded } from '../shared/ui/modal-chunk-cache.js';
import { EAGER_MODAL_TYPE_KEYS } from './components/eager-modal-types.js';

/** Modal chunk export names (React panels). */
export const MODAL_EXPORT_NAMES = {
    dialog: 'ModalDialog',
    sources: 'ModalSources',
    'security-warning': 'ModalSecurityWarning',
    'load-warning': 'ModalLoadWarning',
    search: 'ModalSearch',
    profile: 'ModalProfile',
    certificates: 'ModalCertificates',
    preview: 'ModalPreview',
    about: 'ModalAbout',
    language: 'ModalLanguage',
    'export-pdf': 'ModalExportPdf',
    certificate: 'ModalCertificateView',
    emptyModule: 'ModalEmptyModule',
    privacy: 'ModalPrivacy',
    'celebration-prefs': 'ModalCelebrationPrefs',
    'download-app': 'ModalDownloadApp',
    'accessibility-prefs': 'ModalAccessibilityPrefs',
    backup: 'ModalBackup',
    arcade: 'ModalArcade',
    'game-player': 'ModalGamePlayer',
    'node-properties': 'ModalNodeProperties',
    'move-node': 'ModalMoveNode',
    'tree-info': 'ModalTreeInfo',
    'pick-curriculum-lang': 'ModalPickCurriculumLang',
    'construction-curriculum-lang': 'ModalConstructionCurriculumLang',
    forum: 'ModalForum',
    'construction-history': 'ModalConstructionHistory',
    'construction-edit-pick': 'ModalConstructionEditPick',
    'construction-about': 'ModalConstructionAbout',
    'sync-login-qr-scanner': 'ModalSyncLoginQrScanner',
    contributor: 'AdminPanel',
};

/** @type {Record<string, () => Promise<Record<string, unknown>>>} */
export const MODAL_CHUNK_LOADERS = {
    dialog: () => import('../shared/ui/dialog.js'),
    sources: async () => {
        void import('../features/sources/styles/sources.css');
        return import('../features/sources/modals/SourcesModal.jsx');
    },
    'security-warning': () => import('../features/sources/modals/SecurityWarningModal.jsx'),
    'load-warning': () => import('../features/sources/modals/LoadWarningModal.jsx'),
    search: () => import('../features/search/modals/SearchModal.jsx'),
    profile: () => import('../features/identity-auth/modals/ProfileModal.jsx'),
    certificates: () => import('../features/garden-progress/modals/CertificatesModal.jsx'),
    preview: () => import('../features/tree-graph/modals/PreviewModal.jsx'),
    about: () => import('../features/shell-chrome/modals/AboutModal.jsx'),
    language: () => import('../features/shell-chrome/modals/LanguageModal.jsx'),
    'export-pdf': () => import('../features/backup-export/modals/ExportPdfModal.jsx'),
    certificate: () => import('../features/garden-progress/modals/CertificateViewModal.jsx'),
    emptyModule: () => import('../features/learning/modals/EmptyModuleModal.jsx'),
    privacy: () => import('../features/privacy-gdpr/modals/PrivacyModal.jsx'),
    'celebration-prefs': () => import('../features/garden-progress/modals/CelebrationPrefsModal.jsx'),
    'download-app': () => import('../features/version-updates/modals/DownloadAppModal.jsx'),
    'accessibility-prefs': () => import('../features/garden-progress/modals/AccessibilityPrefsModal.jsx'),
    backup: () => import('../features/backup-export/modals/BackupModal.jsx'),
    arcade: () => import('../features/arcade/modals/ArcadeModal.jsx'),
    'game-player': () => import('../features/arcade/modals/GamePlayerModal.jsx'),
    'node-properties': () => import('../features/tree-graph/modals/NodePropertiesModal.jsx'),
    'move-node': () => import('../features/tree-graph/modals/MoveNodeModal.jsx'),
    'tree-info': () => import('../features/tree-graph/modals/TreeInfoModal.jsx'),
    'pick-curriculum-lang': () => import('../features/sources/modals/PickCurriculumLangModal.jsx'),
    'construction-curriculum-lang': () =>
        import('../features/editor/modals/ConstructionCurriculumLangModal.jsx'),
    forum: () => import('../features/forum/modals/ForumModal.jsx'),
    'construction-history': () => import('../features/editor/modals/ConstructionHistoryModal.jsx'),
    'construction-edit-pick': () => import('../features/editor/modals/ConstructionEditPickModal.jsx'),
    'construction-about': () => import('../features/editor/modals/ConstructionAboutModal.jsx'),
    'sync-login-qr-scanner': () =>
        import('../features/identity-auth/modals/SyncLoginQrScannerModal.jsx'),
    contributor: () => import('../features/nostr/modals/AdminPanel.jsx'),
};

/** Every modal is bundled with the shell (see `components/eager-modals.js`). */
export const EAGER_MODAL_TYPES = new Set(['onboarding', ...EAGER_MODAL_TYPE_KEYS]);

const modalChunksLoaded = new Set();
/** @type {Map<string, Promise<{ default: import('react').ComponentType<unknown> }>>} */
const modalChunkModules = new Map();

export function chunkIsReady(type) {
    const key = String(type || '');
    return modalChunksLoaded.has(key) || isModalChunkLoaded(key);
}

function markChunkLoaded(type) {
    const key = String(type || '');
    if (!key) return;
    modalChunksLoaded.add(key);
    markModalChunkLoaded(key);
}

function loadModalChunkModule(type) {
    const key = String(type || '');
    const cached = modalChunkModules.get(key);
    if (cached) return cached;

    const exportName = MODAL_EXPORT_NAMES[key];
    const loader = MODAL_CHUNK_LOADERS[key];
    if (!exportName || !loader) {
        return Promise.reject(new Error(`[Arborito] unknown modal chunk ${key}`));
    }

    const p = loader()
        .then((mod) => {
            const Component = mod[exportName];
            if (!Component) {
                throw new Error(`[Arborito] missing modal export ${exportName} for ${key}`);
            }
            markChunkLoaded(key);
            return { default: Component };
        })
        .catch((e) => {
            modalChunkModules.delete(key);
            console.warn('[Arborito] modal chunk load failed', key, e);
            throw e;
        });

    modalChunkModules.set(key, p);
    return p;
}

export async function ensureModalChunk(type) {
    const key = String(type || '');
    if (!key || EAGER_MODAL_TYPES.has(key)) return;
    if (chunkIsReady(key)) {
        modalChunksLoaded.add(key);
        if (!modalChunkModules.has(key)) {
            await loadModalChunkModule(key);
        }
        return;
    }
    await loadModalChunkModule(key);
}
