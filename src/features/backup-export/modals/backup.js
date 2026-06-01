import { store } from '../../../core/store.js';
import { bindCloseTaps, bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { escHtml, escAttr } from '../../../shared/lib/html-escape.js';

/**
 * Local backup modal: prompts the user to save progress to a file or import one.
 *
 * Lives outside the Profile sheet so the Profile stays focused on identity / session,
 * but is opened *from* the Profile sheet as a single "Respaldo" row above "Privacidad
 * y datos" (and was previously a top-level "Más" entry — moved back to keep noise low).
 *
 * Layout: fullbleed on mobile (dock layout so the hero hugs the viewport edges and the
 * back chevron is reachable), narrow auto-height card on desktop. Action buttons are
 * self-contained (no profile-modal.css dependency) so they look the same here as in
 * any other small modal.
 */
class ArboritoModalBackup extends HTMLElement {
    connectedCallback() {
        this.render();
        /* Only re-render when the inputs that change the modal change. Re-rendering on every
         * state-change made the body innerHTML get replaced repeatedly, which caused the header
         * background to flicker (the panel briefly went un-painted between renders) so it looked
         * like the hero didn't "fill" the borders. We watch the two pieces of state that drive
         * `hint` text: signed-in status and cloud-sync toggle. */
        this._lastSig = this._currentSig();
        this._storeListener = () => {
            const next = this._currentSig();
            if (next === this._lastSig) return;
            this._lastSig = next;
            this.render();
        };
        store.addEventListener('state-change', this._storeListener);
    }

    disconnectedCallback() {
        if (this._storeListener) store.removeEventListener('state-change', this._storeListener);
    }

    _currentSig() {
        const signedIn = !!(store.isSignedIn && store.isSignedIn());
        const cloudProgressOn = !!(store.userStore?.state?.cloudProgressSync);
        return `${signedIn ? 1 : 0}|${cloudProgressOn ? 1 : 0}|${store.state?.lang || ''}`;
    }

    close() {
        store.dismissModal();
    }

    render() {
        const ui = store.ui;
        const mobile = shouldShowMobileUI();

        const signedIn = !!(store.isSignedIn && store.isSignedIn());
        const cloudProgressOn = !!(store.userStore?.state?.cloudProgressSync);
        const title = ui.profileBackupGroupLabel || ui.backpackTitle || 'Respaldo';
        const hint = signedIn && cloudProgressOn
            ? ui.profileBackpackDescCloudOn || ui.backpackDesc || ''
            : ui.profileBackpackDescLocalOnly || ui.backpackDesc || '';

        const exportLbl = ui.backupBtn || 'Guardar en archivo';
        const importLbl = ui.profileImportBackupButton || ui.restoreBtn || 'Importar archivo';

        const actionBtn = (id, icon, label, variant) => {
            const tone = variant === 'primary'
                ? 'arborito-cta-emerald'
                : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800';
            return `<button type="button" id="${id}" class="${tone} flex items-center justify-center gap-2 min-h-[52px] w-full px-4 py-3 rounded-2xl text-sm font-extrabold tracking-wide shadow-sm transition-colors" aria-label="${escAttr(label)}">
                <span class="text-lg leading-none shrink-0" aria-hidden="true">${icon}</span>
                <span class="truncate">${escHtml(label)}</span>
            </button>`;
        };

        /* `mobile: true` forces the canonical "More sub-pane" hero wrap
         * (`arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero`) on desktop too — same
         * pattern as tree-info / sources / about / language / certificates. That wrap paints
         * the header background edge-to-edge inside the panel; without it desktop falls back
         * to `arborito-float-modal-head` which only sets inner padding and leaves the panel
         * radius visible above the header (looked like the hero didn't "fill" the borders). */
        const body = `
                ${modalHeroHtml(ui, {
                    mobile: true,
                    title,
                    titleTruncate: true,
                    leadingIcon: '<span class="text-2xl shrink-0" aria-hidden="true">💾</span>',
                    tagClass: 'btn-close',
                    trailingSpacer: true,
                    showClose: !mobile,
                })}

                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6 pt-4 pb-6">
                    ${hint ? `<p class="m-0 mb-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">${escHtml(hint)}</p>` : ''}
                    <input type="file" id="backup-file-importer" class="hidden" accept=".json,application/json">
                    <div class="flex flex-col gap-3">
                        ${actionBtn('backup-btn-export', '💾', exportLbl, 'primary')}
                        ${actionBtn('backup-btn-import', '📥', importLbl, 'ghost')}
                    </div>
                </div>`;

        this.innerHTML = modalShellHtml({
            bodyHtml: body,
            mobile,
            layout: 'dock',
            panelRadius: mobile ? 'none' : '2xl',
            panelSize: mobile ? undefined : 'narrow auto-h',
        });

        bindCloseTaps(this, () => this.close());

        const btnExport = this.querySelector('#backup-btn-export');
        if (btnExport) bindMobileTap(btnExport, () => store.downloadProgressFile());

        const btnImport = this.querySelector('#backup-btn-import');
        const fileInput = this.querySelector('#backup-file-importer');
        if (btnImport && fileInput) {
            bindMobileTap(btnImport, () => {
                if (typeof fileInput.click === 'function') fileInput.click();
            });
            fileInput.onchange = async (e) => {
                const file = e.target.files ? e.target.files[0] : undefined;
                fileInput.value = '';
                if (!file) return;
                const ok = await store.confirm(
                    ui.profileImportReplaceBody ||
                        'Replace current progress and profile data on this device with the contents of this file?',
                    ui.profileImportReplaceTitle || 'Replace with imported file?',
                    true
                );
                if (!ok) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (store.importProgress(event.target.result)) {
                        store.alert(store.ui.importSuccess);
                        this.close();
                    } else {
                        store.alert(store.ui.importError);
                    }
                };
                reader.readAsText(file);
            };
        }
    }
}
customElements.define('arborito-modal-backup', ArboritoModalBackup);
