import { useBackupExport } from '../hooks/useBackupExport.js';
import { useRef } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';

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

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            titleTruncate
            titleId="backup-modal-title"
            leadingIcon="💾"
            tagClass="btn-close"
            onClose={close}
        />
    );

    const footer = (
        <div className="arborito-modal-footer arborito-modal-footer--blend">
            <div className="arborito-action-row arborito-action-row--stack-mobile">
                <button
                    type="button"
                    className={`${modalCtaConfirmFull('emerald')} flex items-center justify-center gap-2`}
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
                    className={`${modalCtaConfirmFull('slate')} flex items-center justify-center gap-2`}
                    aria-label={importLbl}
                    onClick={onImportClick}
                >
                    <span className="text-lg leading-none shrink-0" aria-hidden="true">
                        📥
                    </span>
                    <span className="truncate">{importLbl}</span>
                </button>
            </div>
        </div>
    );

    const body = (
        <div className="px-4 pb-4 pt-2 flex flex-col min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            {hint ? (
                <p className="m-0 mb-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{hint}</p>
            ) : null}
            <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".json,application/json"
                onChange={onFileChange}
            />
        </div>
    );

    if (mobile) {
        return (
            <div data-arborito-panel="modal-backup">
                <DockModalShell
                    mobile
                    sizeTier="COMPACT"
                    layout="dock-bottom"
                    onBackdropClick={close}
                    shellOpts={{ rootFlags: 'arborito-modal--backup', scrim: 'translucent' }}
                    panelClass="arborito-modal-dock-panel w-full max-h-[85vh]"
                    hero={hero}
                    footer={footer}
                >
                    {body}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-backup">
            <ModalCenteredShell
                mobile={false}
                layout="centered"
                sizeTier="COMPACT"
                hero={hero}
                footer={footer}
                panelRadius="2xl"
                shellOpts={{ rootFlags: 'arborito-modal--backup', enter: 'fade-fast', scrim: 'translucent' }}
                onBackdropClick={close}
            >
                {body}
            </ModalCenteredShell>
        </div>
    );
}
