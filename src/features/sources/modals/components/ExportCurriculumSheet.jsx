import { useMemo, useState } from 'react';
import { FormNestedSheet } from '../../../../shared/ui/FormNestedSheet.jsx';
import { LoadingBrand } from '../../../../shared/ui/Loading.jsx';
import { getArboritoStore } from '../../../../core/store-singleton.js';
import {
    collectBranchExportOptions,
    collectComposedTreeExportOptions,
    collectNetworkSourceExportOptions,
} from '../../../backup-export/api/export-curriculum-archive.js';
import { CurriculumLangPicker } from '../../components/CurriculumLangPicker.jsx';

function exportSheetHint(ui, name, multiLang, hasVersions) {
    const fill = (tpl, fallback) =>
        String(tpl || fallback || '')
            .replace(/\{name\}/g, name)
            .trim();
    if (multiLang && hasVersions) {
        return fill(ui.sourcesExportSheetHint, 'Choose language and which editions to include in “{name}”.');
    }
    if (multiLang) {
        return fill(ui.sourcesExportSheetHintLang, 'Choose which language to include in “{name}”.');
    }
    if (hasVersions) {
        return fill(ui.sourcesExportSheetHintEditions, 'Choose which editions to include in “{name}”.');
    }
    return fill(ui.sourcesExportSheetHintSimple, 'Export “{name}” as an .arborito file.');
}

/**
 * Consolidated export sheet: language + edition scope before writing `.arborito`.
 * @param {{ ui: Record<string, string>, target: { kind: 'branch'|'tree'|'network', id: string, name?: string }, onCancel: () => void, onConfirm: (opts: { lang: string, scope: 'current'|'all' }) => void, busy?: boolean }} props
 */
export function ExportCurriculumSheet({ ui, target, onCancel, onConfirm, busy = false }) {
    const store = getArboritoStore();
    const options = useMemo(() => {
        if (!target?.id) return null;
        if (target.kind === 'tree') return collectComposedTreeExportOptions(store, target.id);
        if (target.kind === 'network') return collectNetworkSourceExportOptions(store, target.id);
        return collectBranchExportOptions(store, target.id);
    }, [store, target]);

    const langs = options?.languages?.length ? options.languages : ['EN'];
    const multiLang = langs.length > 1;
    const hasVersions = (options?.snapshotCount || 0) > 0;

    const [lang, setLang] = useState(() => (multiLang ? '*' : langs[0]));
    const [scope, setScope] = useState('current');

    const title =
        target?.kind === 'tree'
            ? ui.sourcesExportTreeSheetTitle || ui.sourcesExportTree || 'Export tree'
            : ui.sourcesExportBranchSheetTitle || ui.sourceExport || 'Export branch';

    const name = String(options?.name || target?.name || '').trim();
    const hint = busy
        ? undefined
        : exportSheetHint(ui, name, multiLang, hasVersions);

    const busyLabel =
        target?.kind === 'network'
            ? ui.sourcesExportBusyNetwork ||
              'Fetching lessons and building the file…'
            : ui.sourcesExportBusy || 'Exporting…';

    const optionsBody =
        multiLang || hasVersions ? (
            <div className="arborito-sources-export-sheet-body space-y-4">
                {multiLang ? (
                    <div>
                        <p className="arborito-eyebrow block mb-2" id="sources-export-lang-label">
                            {ui.sourcesExportLangLabel || 'Language'}
                        </p>
                        <CurriculumLangPicker
                            langKeys={langs}
                            value={lang}
                            onChange={setLang}
                            compact
                            ariaLabel={ui.sourcesExportLangLabel || 'Language'}
                            allOption={{
                                value: '*',
                                label: ui.sourcesExportLangAll || 'All languages',
                                flag: '🌐',
                            }}
                        />
                    </div>
                ) : null}

                {hasVersions ? (
                    <fieldset className="arborito-sources-export-scope" disabled={busy}>
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
                                disabled={busy}
                            />
                            <span className="min-w-0">
                                <span className="block text-sm font-bold text-slate-900 dark:text-white">
                                    {ui.sourcesExportScopeCurrent || 'Current edition only'}
                                </span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                                    {options?.viewingArchive && options?.activeSnapshotId
                                        ? String(
                                              ui.sourcesExportScopeCurrentSnapshot || 'Exports snapshot {id}.'
                                          ).replace(/\{id\}/g, options.activeSnapshotId)
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
                                disabled={busy}
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
        ) : null;

    const body = busy ? (
        <div className="py-4 flex flex-col items-center justify-center min-h-[7rem]">
            <LoadingBrand
                label={busyLabel}
                size="md"
                tone="sage"
                extraClass="arborito-loading-brand--compact"
            />
        </div>
    ) : (
        optionsBody
    );

    return (
        <FormNestedSheet
            panelId="sources-export-curriculum-card"
            headingId="sources-export-curriculum-heading"
            title={title}
            hint={hint || undefined}
            closeLabel={ui.close || 'Close'}
            cancelLabel={ui.cancel || 'Cancel'}
            submitLabel={
                busy
                    ? ui.sourcesExportBusy || 'Exporting…'
                    : ui.sourcesExportSheetSubmit || ui.sourceExport || 'Export'
            }
            submitDisabled={busy || !options}
            submitBusy={busy}
            leadingIcon="📤"
            onCancel={busy ? () => {} : onCancel}
            onSubmit={() => {
                if (busy) return;
                onConfirm({ lang, scope });
            }}
        >
            {body}
        </FormNestedSheet>
    );
}
