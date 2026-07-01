/**
 * All modals bundled with the shell — no lazy chunks.
 *
 * Opening a modal never waits on a fetch/compile (especially painful in Vite dev).
 * Route keys live in `eager-modal-types.js` (shared with modal-chunk-loaders for Node CI).
 */
import { ModalDialog } from '../../shared/ui/DialogModal.jsx';
import '../../features/sources/styles/sources.css';
import { ModalSources } from '../../features/sources/modals/SourcesModal.jsx';
import { ModalSecurityWarning } from '../../features/sources/modals/SecurityWarningModal.jsx';
import { ModalLoadWarning } from '../../features/sources/modals/LoadWarningModal.jsx';
import { ModalSearch } from '../../features/search/modals/SearchModal.jsx';
import { ModalProfile } from '../../features/identity-auth/modals/ProfileModal.jsx';
import { ModalCertificates } from '../../features/garden-progress/modals/CertificatesModal.jsx';
import { ModalPreview } from '../../features/tree-graph/modals/PreviewModal.jsx';
import { ModalAbout } from '../../features/shell-chrome/modals/AboutModal.jsx';
import { ModalLanguage } from '../../features/shell-chrome/modals/LanguageModal.jsx';
import { ModalExportPdf } from '../../features/backup-export/modals/ExportPdfModal.jsx';
import { ModalCertificateView } from '../../features/garden-progress/modals/CertificateViewModal.jsx';
import { ModalEmptyModule } from '../../features/learning/modals/EmptyModuleModal.jsx';
import { ModalPrivacy } from '../../features/privacy-gdpr/modals/PrivacyModal.jsx';
import { ModalCelebrationPrefs } from '../../features/garden-progress/modals/CelebrationPrefsModal.jsx';
import { ModalDownloadApp } from '../../features/version-updates/modals/DownloadAppModal.jsx';
import { ModalAccessibilityPrefs } from '../../features/garden-progress/modals/AccessibilityPrefsModal.jsx';
import { ModalBackup } from '../../features/backup-export/modals/BackupModal.jsx';
import { ModalArcade } from '../../features/arcade/modals/ArcadeModal.jsx';
import { ModalGamePlayer } from '../../features/arcade/modals/GamePlayerModal.jsx';
import { ModalNodeProperties } from '../../features/tree-graph/modals/NodePropertiesModal.jsx';
import { ModalMoveNode } from '../../features/tree-graph/modals/MoveNodeModal.jsx';
import { ModalTreeInfo } from '../../features/tree-graph/modals/TreeInfoModal.jsx';
import { ModalPickCurriculumLang } from '../../features/sources/modals/PickCurriculumLangModal.jsx';
import { ModalConstructionCurriculumLang } from '../../features/editor/modals/ConstructionCurriculumLangModal.jsx';
import { ModalForum } from '../../features/forum/modals/ForumModal.jsx';
import { ModalConstructionHistory } from '../../features/editor/modals/ConstructionHistoryModal.jsx';
import { ModalConstructionEditPick } from '../../features/editor/modals/ConstructionEditPickModal.jsx';
import { ModalConstructionAbout } from '../../features/editor/modals/ConstructionAboutModal.jsx';
import { ModalSyncLoginQrScanner } from '../../features/identity-auth/modals/SyncLoginQrScannerModal.jsx';
import { AdminPanel } from '../../features/nostr/modals/AdminPanel.jsx';

/** @type {Record<string, import('react').ComponentType<Record<string, unknown>>>} */
export const EAGER_MODALS = {
    dialog: ModalDialog,
    sources: ModalSources,
    'security-warning': ModalSecurityWarning,
    'load-warning': ModalLoadWarning,
    search: ModalSearch,
    profile: ModalProfile,
    certificates: ModalCertificates,
    preview: ModalPreview,
    about: ModalAbout,
    language: ModalLanguage,
    'export-pdf': ModalExportPdf,
    certificate: ModalCertificateView,
    emptyModule: ModalEmptyModule,
    privacy: ModalPrivacy,
    'celebration-prefs': ModalCelebrationPrefs,
    'download-app': ModalDownloadApp,
    'accessibility-prefs': ModalAccessibilityPrefs,
    backup: ModalBackup,
    arcade: ModalArcade,
    'game-player': ModalGamePlayer,
    'node-properties': ModalNodeProperties,
    'move-node': ModalMoveNode,
    'tree-info': ModalTreeInfo,
    'pick-curriculum-lang': ModalPickCurriculumLang,
    'construction-curriculum-lang': ModalConstructionCurriculumLang,
    forum: ModalForum,
    'publish-diff': ModalConstructionAbout,
    'construction-history': ModalConstructionHistory,
    'construction-edit-pick': ModalConstructionEditPick,
    'construction-about': ModalConstructionAbout,
    'sync-login-qr-scanner': ModalSyncLoginQrScanner,
    contributor: AdminPanel,
};
