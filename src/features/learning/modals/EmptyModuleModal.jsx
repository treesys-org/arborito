import { useLearning } from '../hooks/useLearning.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { TreeUtils } from '../../tree-graph/api/tree-utils.js';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';

function canShowCreateLesson(learning, node) {
    if (!learning.constructionMode || !learning.activeSource) return false;
    const src = learning.activeSource;
    return (
        src.type === 'branch' ||
        (src.url && src.url.startsWith('branch://')) ||
        !!parseNostrTreeUrl(src.url || '')
    );
}

export function ModalEmptyModule() {
    const learning = useLearning();
    const {
        ui,
        dismissModal,
        setModal,
        findNode,
        alert,
        navigateTo,
        nostrCreateChild,
        modal,
        activeSource,
        constructionMode,
    } = learning;

    const node = modal?.node;
    const close = () => dismissModal();
    const showCreate = node ? canShowCreateLesson(learning, node) : false;

    const openSources = () => {
        close();
        setModal('sources');
    };

    const createLesson = async () => {
        if (!node) return;
        close();

        const activeTreeRef = activeSource?.url && parseNostrTreeUrl(activeSource.url);
        if (activeTreeRef && fileSystem.isNostrTreeSource()) {
            const dirPath = TreeUtils.directoryPathForNewChild(node, findNode);
            if (!dirPath) {
                alert(ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
                return;
            }
            const label = ui.emptyModuleFirstLessonName || ui.adminNewFile || 'New Lesson';
            const newId = nostrCreateChild(dirPath, label, 'file', node.id);
            const created = newId ? findNode(newId) : null;
            if (created) {
                await navigateTo(created.id);
            } else {
                alert(
                    ui.graphErrorWithMessage || 'Error: {message}'.replace('{message}', 'Could not create lesson.')
                );
            }
            return;
        }

        const dirPath = TreeUtils.directoryPathForNewChild(node, findNode);
        if (!dirPath) {
            alert(ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
            return;
        }
        const label = ui.emptyModuleFirstLessonName || ui.adminNewFile || 'New Lesson';
        try {
            await fileSystem.createNode(dirPath, label, 'file', node.id);
        } catch (e) {
            alert(
                (ui.graphErrorWithMessage || 'Error: {message}').replace(
                    '{message}',
                    e.message || 'Could not create lesson.'
                )
            );
            return;
        }
        const parent = findNode(node.id);
        const matches = ((parent && parent.children) || []).filter(
            (c) => c.name === label && (c.type === 'leaf' || c.type === 'exam')
        );
        const created = matches[matches.length - 1];
        if (created) {
            await navigateTo(created.id);
        } else {
            alert(ui.graphErrorWithMessage || 'Error: {message}'.replace('{message}', 'Could not create lesson.'));
        }
    };

    return (
        <ModalShell
            layout="centered"
            panelSize="compact auto-h"
            shellOpts={{
                enter: 'fade',
                panelClass: 'transform transition-all hover:scale-[1.02] overflow-visible',
            }}
            onBackdropClick={close}
        >
            <ModalHero
                ui={ui}
                title={ui.emptyModuleTitle}
                titleTruncate
                tagClass="btn-close"
                extraWrapClass="mb-4"
                onClose={close}
            />
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-white dark:bg-slate-900 rotate-45 transform border-r border-b border-slate-200 dark:border-slate-800" />
            <div className="px-8 pb-8 pt-2 text-center flex flex-col">
                <div className="text-6xl mb-4 animate-bounce" style={{ animationDuration: '2s' }}>
                    🍂
                </div>
                <p className="text-slate-500 dark:text-slate-400 mb-2 text-sm font-medium leading-relaxed">
                    {ui.emptyModuleDesc}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                    {ui.emptyModuleConstructHint ||
                        'En construccion, este punto es una carpeta vacia: crea una leccion para que la gente tenga algo que abrir.'}
                </p>
                <div className="space-y-3 relative z-10">
                    <button
                        type="button"
                        className="btn-empty-open-sources w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl shadow-lg hover:opacity-90 active:scale-95 transition-all text-sm"
                        onClick={openSources}
                    >
                        {ui.emptyModuleOpenSources || ui.noTreesBtnSources || 'Trees & libraries'}
                    </button>
                    {showCreate ? (
                        <button
                            type="button"
                            className="btn-create-lesson w-full py-3 text-green-700 dark:text-green-400 font-bold rounded-xl border border-green-200 dark:border-green-800 hover:opacity-90 transition-colors text-sm"
                            onClick={createLesson}
                        >
                            + {ui.emptyModuleCreateLesson || ui.adminNewFile || 'Crear primera leccion'}
                        </button>
                    ) : null}
                </div>
            </div>
        </ModalShell>
    );
}
