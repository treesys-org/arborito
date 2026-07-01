import { useBackupExport } from '../hooks/useBackupExport.js';
import { useRef } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

export function ModalBackup() {
    const { ui, dismissModal, confirm, alert, importProgress, isSignedIn, userStore, downloadProgressFile } =
        useBackupExport();
const fileRef = useRef(null);
    const mobile = shouldShowMobileUI();

    const signedIn = isSignedIn();
    const cloudProgressOn = !!(userStore?.state?.cloudProgressSync);
    const title = ui.profileBackupGroupLabel || ui.backpackTitle || 'Respaldo';
    const hint =
        signedIn && cloudProgressOn
            ? ui.profileBackpackDescCloudOn || ui.backpackDesc || ''
            : ui.profileBackpackDescLocalOnly || ui.backpackDesc || '';

    const exportLbl = ui.backupBtn || 'Guardar en archivo';
    const importLbl = ui.profileImportBackupButton || ui.restoreBtn || 'Importar archivo';

    const close = () => dismissModal();

    const onImportClick = () => fileRef.current?.click();

    const onFileChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const ok = await confirm(
            ui.profileImportReplaceBody ||
                'Replace current progress and profile data on this device with the contents of this file?',
            ui.profileImportReplaceTitle || 'Replace with imported file?',
            true
        );
        if (!ok) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (importProgress(event.target.result)) {
                alert(ui.importSuccess);
                close();
            } else {
                alert(ui.importError);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div data-arborito-panel="modal-backup">
            <DockModalShell
                mobile={mobile}
                sizeTier="COMPACT"
                onBackdropClick={close}
                hero={
                    <ModalHubHero
                        ui={ui}
                        mobile={mobile}
                        title={title}
                        titleTruncate
                        leadingIcon={<ChromeEmoji emoji="💾" size={24} />}
                        tagClass="btn-close"
                        onClose={close}
                    />
                }
            >
                {hint ? (
                    <p className="m-0 mb-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {hint}
                    </p>
                ) : null}
                <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".json,application/json"
                    onChange={onFileChange}
                />
                <div className="flex flex-col gap-3">
                    <button
                        type="button"
                        className="arborito-cta-emerald flex items-center justify-center gap-2 min-h-[52px] w-full px-4 py-3 rounded-2xl text-sm font-extrabold tracking-wide shadow-sm transition-colors"
                        aria-label={exportLbl}
                        onClick={() => downloadProgressFile()}
                    >
                        <span className="text-lg leading-none shrink-0" aria-hidden="true">
                            💾
                        </span>
                        <span className="truncate">{exportLbl}</span>
                    </button>
                    <button
                        type="button"
                        className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2 min-h-[52px] w-full px-4 py-3 rounded-2xl text-sm font-extrabold tracking-wide shadow-sm transition-colors"
                        aria-label={importLbl}
                        onClick={onImportClick}
                    >
                        <span className="text-lg leading-none shrink-0" aria-hidden="true">
                            📥
                        </span>
                        <span className="truncate">{importLbl}</span>
                    </button>
                </div>
            </DockModalShell>
        </div>
    );
}
