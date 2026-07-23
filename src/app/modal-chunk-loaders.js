import { isModalChunkLoaded, markModalChunkLoaded } from '../shared/ui/modal-chunk-cache.js';
import { EAGER_MODAL_TYPE_KEYS, EAGER_MODAL_TYPE_SET } from './components/eager-modal-types.js';

/** Lazy modal chunk export names (React panels). Eager modals live in eager-modals.js. */
export const MODAL_EXPORT_NAMES = {
    sources: 'ModalSources',
    search: 'ModalSearch',
    certificates: 'ModalCertificates',
    'export-pdf': 'ModalExportPdf',
    backup: 'ModalBackup',
    arcade: 'ModalArcade',
    'game-player': 'ModalGamePlayer',
    'node-properties': 'ModalNodeProperties',
    'construction-curriculum-lang': 'ModalConstructionCurriculumLang',
    forum: 'ModalForum',
    'construction-history': 'ModalConstructionHistory',
    'construction-edit-pick': 'ModalConstructionEditPick',
    contributor: 'ModalContributor',
};

/** @type {Record<string, () => Promise<Record<string, unknown>>>} */
export const MODAL_CHUNK_LOADERS = {
    sources: async () => {
        void import('../features/sources/styles/sources.css');
        return import('../features/sources/modals/SourcesModal.jsx');
    },
    search: () => import('../features/search/modals/SearchModal.jsx'),
    certificates: () => import('../features/garden-progress/modals/CertificatesModal.jsx'),
    'export-pdf': () => import('../features/backup-export/modals/ExportPdfModal.jsx'),
    backup: () => import('../features/backup-export/modals/BackupModal.jsx'),
    arcade: () => import('../features/arcade/modals/ArcadeModal.jsx'),
    'game-player': () => import('../features/arcade/modals/GamePlayerModal.jsx'),
    'node-properties': () => import('../features/tree-graph/modals/NodePropertiesModal.jsx'),
    'construction-curriculum-lang': () =>
        import('../features/editor/modals/ConstructionCurriculumLangModal.jsx'),
    forum: () => import('../features/forum/modals/ForumModal.jsx'),
    'construction-history': () => import('../features/editor/modals/ConstructionHistoryModal.jsx'),
    'construction-edit-pick': () => import('../features/editor/modals/ConstructionEditPickModal.jsx'),
    contributor: async () => {
        void import('../features/sources/styles/share-code.css');
        return import('../features/nostr/modals/ContributorModal.jsx');
    },
};

/** Modals bundled with the shell (see `components/eager-modals.js`). */
export const EAGER_MODAL_TYPES = new Set(['onboarding', ...EAGER_MODAL_TYPE_KEYS]);

const modalChunksLoaded = new Set();
/** @type {Map<string, Promise<{ default: import('react').ComponentType<unknown> }>>} */
const modalChunkModules = new Map();
/** @type {Map<string, import('react').ComponentType<unknown>>} */
const modalChunkComponents = new Map();

/** Resolved lazy modal component after `ensureModalChunk` (used by ModalHost). */
export function resolveModalChunkComponent(type) {
    const key = String(type || '');
    return modalChunkComponents.get(key) || null;
}

export function chunkIsReady(type) {
    const key = String(type || '');
    if (EAGER_MODAL_TYPE_SET.has(key)) return true;
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
            modalChunkComponents.set(key, Component);
            return { default: Component };
        })
        .catch((e) => {
            modalChunkModules.delete(key);
            modalChunkComponents.delete(key);
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
