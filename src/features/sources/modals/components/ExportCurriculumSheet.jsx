import { useMemo, useState } from 'react';
import { FormNestedSheet } from '../../../../shared/ui/FormNestedSheet.jsx';
import { getArboritoStore } from '../../../../core/store-singleton.js';
import {
    collectBranchExportOptions,
    collectComposedTreeExportOptions,
} from '../../../backup-export/api/export-curriculum-archive.js';

/**
 * Consolidated export sheet: language + edition scope before writing `.arborito`.
 * @param {{ ui: Record<string, string>, target: { kind: 'branch'|'tree', id: string, name?: string }, onCancel: () => void, onConfirm: (opts: { lang: string, scope: 'current'|'all' }) => void, busy?: boolean }} props
 */
export function ExportCurriculumSheet({ ui, target, onCancel, onConfirm, busy = false }) {
    const store = getArboritoStore();
    const options = useMemo(() => {
        if (!target?.id) return null;
        if (target.kind === 'tree') return collectComposedTreeExportOptions(store, target.id);
        return collectBranchExportOptions(store, target.id);
    }, [store, target]);

    const langs = options?.languages?.length ? options.languages : ['EN'];
    const multiLang = langs.length > 1;
    const hasVersions = (options?.snapshotCount || 0) > 0;

    const [lang, setLang] = useState(() => (multiLang ? '*' : langs[0]));
    const [scope, setScope] = useState(() => (hasVersions ? 'current' : 'current'));

    const title =
        target?.kind === 'tree'
            ? ui.sourcesExportTreeSheetTitle || ui.sourcesExportTree || 'Export tree'
            : ui.sourcesExportBranchSheetTitle || ui.sourceExport || 'Export branch';

    const hint = String(ui.sourcesExportSheetHint || '')
        .replace(/\{name\}/g, String(options?.name || target?.name || '').trim())
        .trim();

    return (
        <FormNestedSheet
            panelId="sources-export-curriculum-card"
            headingId="sources-export-curriculum-heading"
            kicker={ui.sourcesExportSheetKicker || ui.sourcesTabBranches || 'Library'}
            title={title}
            hint={hint || undefined}
            closeLabel={ui.close || 'Close'}
            cancelLabel={ui.cancel || 'Cancel'}
            submitLabel={ui.sourcesExportSheetSubmit || ui.sourceExport || 'Export'}
            submitDisabled={busy || !options}
            submitBusy={busy}
            panelSizeTier="STANDARD"
            onCancel={onCancel}
            onSubmit={() => onConfirm({ lang, scope })}
        >
            <div className="arborito-sources-export-sheet-body space-y-4">
            {multiLang ? (
                <div>
                    <label className="arborito-eyebrow block mb-2" htmlFor="sources-export-lang">
                        {ui.sourcesExportLangLabel || 'Language'}
                    </label>
                    <select
                        id="sources-export-lang"
                        className="arborito-input w-full text-sm font-semibold"
                        value={lang}
                        onChange={(e) => setLang(e.target.value)}
                    >
                        <option value="*">{ui.sourcesExportLangAll || 'All languages'}</option>
                        {langs.map((code) => (
                            <option key={code} value={code}>
                                {code}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}

            {hasVersions ? (
                <fieldset className="arborito-sources-export-scope">
                    <legend className="arborito-eyebrow mb-2 block w-full">
                        {ui.sourcesExportScopeLabel || 'Versions'}
                    </legend>
                    <label className="arborito-sources-export-scope__option">
                        <input
                            type="radio"
                            name="sources-export-scope"
                            className="mt-0.5 shrink-0"
                            checked={scope === 'current'}
                            onChange={() => setScope('current')}
                        />
                        <span className="min-w-0">
                            <span className="block text-sm font-bold text-slate-900 dark:text-white">
                                {ui.sourcesExportScopeCurrent || 'Current edition only'}
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                                {options?.viewingArchive && options?.activeSnapshotId
                                    ? String(ui.sourcesExportScopeCurrentSnapshot || 'Exports snapshot {id}.').replace(
                                          /\{id\}/g,
                                          options.activeSnapshotId
                                      )
                                    : ui.sourcesExportScopeCurrentDraft ||
                                      'Exports the live draft (lessons/ at the root of the file).'}
                            </span>
                        </span>
                    </label>
                    <label className="arborito-sources-export-scope__option">
                        <input
                            type="radio"
                            name="sources-export-scope"
                            className="mt-0.5 shrink-0"
                            checked={scope === 'all'}
                            onChange={() => setScope('all')}
                        />
                        <span className="min-w-0">
                            <span className="block text-sm font-bold text-slate-900 dark:text-white">
                                {String(ui.sourcesExportScopeAll || 'All saved versions ({n})').replace(
                                    /\{n\}/g,
                                    String(options?.snapshotCount || 0)
                                )}
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                                {ui.sourcesExportScopeAllHint ||
                                    'Adds each snapshot under versions/ in the same .arborito file.'}
                            </span>
                        </span>
                    </label>
                </fieldset>
            ) : null}
            </div>
        </FormNestedSheet>
    );
}
