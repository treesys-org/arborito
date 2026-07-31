import { useEffect, useState } from 'react';
import { ModalHubHero } from '../../../../app/components/ModalHero.jsx';
import { NestedSheetShell } from '../../../../shared/ui/NestedSheetShell.jsx';
import { ModalBinaryFooter } from '../../../../shared/ui/ModalBinaryFooter.jsx';
import { modalCtaConfirm } from '../../../../shared/ui/modal-action-chrome.js';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';

/**
 * Create sheet: name field + consolidated 2 CTAs (Playlist brown / Course emerald).
 */
export function SourcesCreateKindOverlay({ ui, onCancel, onCourse, onPlaylist }) {
    const mobile = shouldShowMobileUI();
    const title = ui.sourcesCreateKindTitle || 'Create a course or playlist';
    const [name, setName] = useState('');
    const trimmed = name.trim();
    const canSubmit = trimmed.length > 0;

    useEffect(() => {
        document.getElementById('inp-sources-create-name')?.focus();
    }, []);

    return (
        <NestedSheetShell
            variant="form"
            onBackdropClick={onCancel}
            zIndex={200}
            ariaLabel={title}
        >
            <div className="arborito-nested-form-shell flex flex-col min-h-0 w-full">
                <ModalHubHero
                    mobile={mobile}
                    title={title}
                    leadingIcon="📚"
                    showClose={!mobile}
                    showBack={!!mobile}
                    onClose={onCancel}
                />
                <div className="arborito-nested-form-body flex flex-col min-h-0 flex-1 px-3 sm:px-4 pb-2">
                    <label
                        htmlFor="inp-sources-create-name"
                        className="m-0 mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                        {ui.sourcesCreateKindNameLabel || ui.treeNamePlaceholder || 'Name'}
                    </label>
                    <input
                        id="inp-sources-create-name"
                        type="text"
                        autoComplete="off"
                        value={name}
                        placeholder={
                            ui.sourcesCreateKindNamePh ||
                            ui.treeNamePlaceholder ||
                            'Name…'
                        }
                        className="arborito-input w-full"
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter' || !canSubmit) return;
                            e.preventDefault();
                            onCourse?.(trimmed);
                        }}
                    />
                </div>
                <ModalBinaryFooter footerVariant="blend">
                    <div className="arborito-action-row w-full">
                        <button
                            type="button"
                            className={modalCtaConfirm('brown')}
                            disabled={!canSubmit}
                            onClick={() => onPlaylist?.(trimmed)}
                        >
                            {ui.sourcesCreateKindPlaylist || 'Playlist'}
                        </button>
                        <button
                            type="button"
                            className={modalCtaConfirm('emerald')}
                            disabled={!canSubmit}
                            onClick={() => onCourse?.(trimmed)}
                        >
                            {ui.sourcesCreateKindCourse || 'Course'}
                        </button>
                    </div>
                </ModalBinaryFooter>
            </div>
        </NestedSheetShell>
    );
}
