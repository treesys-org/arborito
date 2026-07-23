/**
 * Lightweight modals bundled with the shell (instant open).
 *
 * Heavy panels (sources, forum, arcade, construction, …) load lazily via
 * `modal-chunk-loaders.js`, first open pays a small fetch/compile cost.
 */
import { ModalDialog } from '../../shared/ui/DialogModal.jsx';
import { ModalProfile } from '../../features/identity-auth/modals/ProfileModal.jsx';
import { ModalAbout } from '../../features/shell-chrome/modals/AboutModal.jsx';
import { ModalLanguage } from '../../features/shell-chrome/modals/LanguageModal.jsx';
import { ModalPreview } from '../../features/tree-graph/modals/PreviewModal.jsx';
import { ModalCertificateView } from '../../features/garden-progress/modals/CertificateViewModal.jsx';
import { ModalEmptyModule } from '../../features/learning/modals/EmptyModuleModal.jsx';
import { ModalPrivacy } from '../../features/privacy-gdpr/modals/PrivacyModal.jsx';
import { ModalCelebrationPrefs } from '../../features/garden-progress/modals/CelebrationPrefsModal.jsx';
import { ModalDownloadApp } from '../../features/version-updates/modals/DownloadAppModal.jsx';
import { ModalAccessibilityPrefs } from '../../features/garden-progress/modals/AccessibilityPrefsModal.jsx';
import { ModalSecurityWarning } from '../../features/sources/modals/SecurityWarningModal.jsx';
import { ModalLoadWarning } from '../../features/sources/modals/LoadWarningModal.jsx';
import { ModalTreeInfo } from '../../features/tree-graph/modals/TreeInfoModal.jsx';
import { ModalMoveNode } from '../../features/tree-graph/modals/MoveNodeModal.jsx';
import { ModalPickCurriculumLang } from '../../features/sources/modals/PickCurriculumLangModal.jsx';
import { ModalSyncLoginQrScanner } from '../../features/identity-auth/modals/SyncLoginQrScannerModal.jsx';
import { ModalRecoverAccount } from '../../features/identity-auth/modals/RecoverAccountModal.jsx';
import { ModalChangePassword } from '../../features/identity-auth/modals/ChangePasswordModal.jsx';
import { ModalConstructionAbout } from '../../features/editor/modals/ConstructionAboutModal.jsx';
import { ModalCreatorModerationAlerts } from '../../features/shell-chrome/modals/CreatorModerationAlertsModal.jsx';
import { ModalArboritoSupport } from '../../features/shell-chrome/modals/ArboritoSupportModal.jsx';

/** @type {Record<string, import('react').ComponentType<Record<string, unknown>>>} */
export const EAGER_MODALS = {
    dialog: ModalDialog,
    profile: ModalProfile,
    about: ModalAbout,
    language: ModalLanguage,
    preview: ModalPreview,
    certificate: ModalCertificateView,
    emptyModule: ModalEmptyModule,
    privacy: ModalPrivacy,
    'celebration-prefs': ModalCelebrationPrefs,
    'download-app': ModalDownloadApp,
    'accessibility-prefs': ModalAccessibilityPrefs,
    'security-warning': ModalSecurityWarning,
    'load-warning': ModalLoadWarning,
    'tree-info': ModalTreeInfo,
    'move-node': ModalMoveNode,
    'pick-curriculum-lang': ModalPickCurriculumLang,
    'sync-login-qr-scanner': ModalSyncLoginQrScanner,
    'account-recovery': ModalRecoverAccount,
    'change-password': ModalChangePassword,
    'construction-about': ModalConstructionAbout,
    'creator-moderation-alerts': ModalCreatorModerationAlerts,
    'arborito-support': ModalArboritoSupport,
};
