import { useSources } from '../hooks/useSources.js';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { HubStackOverlay } from '../../../shared/ui/HubStackOverlay.jsx';
import { dispatchSourcesAction } from '../api/modals/logic/dispatch-sources-action.js';

const PICK_PAGE = 24;

function BranchPickRow({ branch, ui, mode, onClick }) {
    const isRemove = mode === 'remove';
    return (
        <button
            type="button"
            className={
                isRemove
                    ? 'arborito-tree-editor-selected-row min-h-11 w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-violet-300/70 dark:border-violet-700/50 bg-violet-50/80 dark:bg-violet-950/30 text-left'
                    : 'arborito-tree-editor-add-row min-h-11 w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-left hover:border-violet-400 dark:hover:border-violet-600'
            }
            onClick={onClick}
        >
            <span className="text-base shrink-0" aria-hidden="true">
                🌿
            </span>
            <span className="min-w-0 flex-1 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                {branch.name || branch.id}
            </span>
            <span
                className={`shrink-0 text-xs font-extrabold ${isRemove ? 'text-rose-600 dark:text-rose-400' : 'text-violet-700 dark:text-violet-300'}`}
            >
                {isRemove ? ui.sourcesTreeEditorRemove || 'Remove' : ui.sourcesTreeEditorAdd || 'Add'}
            </span>
        </button>
    );
}

export function SourcesTreeEditor({ treeEditor, setTreeEditor, ui, mobile, onClose }) {
    const sources = useSources();
    const { userStore } = sources;

    const ed = treeEditor;
    if (!ed) return null;

    const isEdit = ed.mode === 'edit';
    const title = isEdit
        ? ui.sourcesEditTreeTitle || ui.sourcesEditTree || 'Edit tree'
        : ui.sourcesCreateTree || 'Create tree';

    const allBranches = userStore?.state?.branches || [];
    const selectedIds = new Set((ed.branchIds || []).map(String));
    const selected = allBranches.filter((b) => selectedIds.has(String(b?.id || '')));
    const q = String(ed.q || '')
        .trim()
        .toLowerCase();
    const available = allBranches.filter((b) => {
        if (selectedIds.has(String(b?.id || ''))) return false;
        if (!q) return true;
        const name = String(b?.name || '').toLowerCase();
        const id = String(b?.id || '').toLowerCase();
        return name.includes(q) || id.includes(q);
    });
    const shown = available.slice(0, Math.max(PICK_PAGE, Number(ed.availShown) || PICK_PAGE));
    const remaining = Math.max(0, available.length - shown.length);
    const countLbl = String(ui.sourcesTreeEditorSelectedCount || '{{n}} selected').replace(
        /\{\{n\}\}/g,
        String(selected.length)
    );

    const onAction = (action, fields) => dispatchSourcesAction(action, fields);

    const save = () => onAction('tree-editor-save');

    const updateEditor = (patch) => setTreeEditor({ ...ed, ...patch });

    return (
        <HubStackOverlay className="arborito-tree-editor" ariaLabel={title}>
            <ModalHubHero
                ui={ui}
                mobile={mobile}
                title={title}
                leadingIcon={isEdit ? '🌳' : '✨'}
                showClose={!mobile}
                tagClass="btn-tree-editor-cancel"
                onClose={onClose}
            />
            <div className="arborito-tree-editor-scroll arborito-mob-scroll-pane custom-scrollbar px-4 pb-3 flex-1 min-h-0 overflow-y-auto">
                <div className="arborito-tree-editor-body flex flex-col gap-3 w-full max-w-lg mx-auto">
                    <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                            {ui.sourcesCreateTreePrompt || 'Tree name'}
                        </span>
                        <input
                            id="inp-tree-editor-name"
                            type="text"
                            autoComplete="off"
                            value={ed.name || ''}
                            className="arborito-input min-h-11 w-full"
                            placeholder={ui.sourcesCreateTreePrompt || 'Name your tree'}
                            onChange={(e) => updateEditor({ name: e.target.value })}
                        />
                    </label>
                    <input
                        id="inp-tree-editor-search"
                        type="search"
                        autoComplete="off"
                        value={ed.q || ''}
                        placeholder={
                            ui.sourcesTreeEditorSearchPh ||
                            ui.sourcesBranchesSearchPlaceholder ||
                            'Search branches…'
                        }
                        className="arborito-input min-h-11 w-full"
                        onChange={(e) =>
                            updateEditor({ q: e.target.value, availShown: PICK_PAGE })
                        }
                    />
                    <section>
                        <p className="m-0 mb-1.5 text-[10px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">
                            {countLbl}
                        </p>
                        <div className="space-y-1.5">
                            {selected.length ? (
                                selected.map((b) => (
                                    <BranchPickRow
                                        key={b.id}
                                        branch={b}
                                        ui={ui}
                                        mode="remove"
                                        onClick={() =>
                                            onAction('tree-editor-remove-branch', { branchId: b.id })
                                        }
                                    />
                                ))
                            ) : (
                                <p className="m-0 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                                    {ui.sourcesTreeEditorEmptySelected || 'Pick at least one branch below.'}
                                </p>
                            )}
                        </div>
                    </section>
                    <section>
                        <p className="m-0 mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {ui.sourcesTreeEditorAvailable || 'Add branches'}
                        </p>
                        <div className="space-y-1.5">
                            {shown.length ? (
                                shown.map((b) => (
                                    <BranchPickRow
                                        key={b.id}
                                        branch={b}
                                        ui={ui}
                                        mode="add"
                                        onClick={() => onAction('tree-editor-add-branch', { branchId: b.id })}
                                    />
                                ))
                            ) : (
                                <p className="m-0 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                                    {ui.sourcesTreeEditorNoMore || 'No more branches to add.'}
                                </p>
                            )}
                            {remaining > 0 ? (
                                <button
                                    type="button"
                                    className="mt-2 w-full min-h-10 rounded-xl text-xs font-extrabold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                    onClick={() => onAction('tree-editor-load-more')}
                                >
                                    {String(ui.sourcesTreeEditorLoadMore || 'Show more ({{n}})').replace(
                                        /\{\{n\}\}/g,
                                        String(remaining)
                                    )}
                                </button>
                            ) : null}
                        </div>
                    </section>
                </div>
            </div>
            <div className="arborito-tree-editor-footer shrink-0 px-4 pb-4 pt-2 border-t border-slate-200/80 dark:border-slate-700/70 backdrop-blur-sm">
                <div className="w-full max-w-lg mx-auto">
                    <button
                        type="button"
                        className="arborito-cta-emerald w-full min-h-12 rounded-2xl font-black text-sm bg-violet-700 dark:bg-violet-500 hover:opacity-90"
                        onClick={save}
                    >
                        {isEdit
                            ? ui.dialogConfirmTitle || ui.sourcesEditTree || 'Save'
                            : ui.sourcesCreateTree || 'Create tree'}
                    </button>
                </div>
            </div>
        </HubStackOverlay>
    );
}
