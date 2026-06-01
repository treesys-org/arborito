import { store } from '../../../core/store.js';
import { parseNostrTreeUrl } from '../../nostr/nostr-refs.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { TreeUtils } from '../../tree-graph/tree-utils.js';
import { bindMobileTap, bindCloseTaps } from '../../../shared/ui/mobile-tap.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';

class ArboritoModalEmptyModule extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.dismissModal();
    }

    render() {
        const ui = store.ui;
        const node = store.value.modal.node;

        const emptyBody = `
                ${modalHeroHtml(ui, { title: ui.emptyModuleTitle, titleTruncate: true, titleClass: 'arborito-mmenu-subtitle m-0 text-left text-base', tagClass: 'btn-close', extraWrapClass: 'mb-4' })}

                <!-- Decorative Balloon Tail (Pointing down to the node) -->
                <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-white dark:bg-slate-900 rotate-45 transform border-r border-b border-slate-200 dark:border-slate-800"></div>

                <div class="px-8 pb-8 pt-2 text-center flex flex-col">
                    <div class="text-6xl mb-4 animate-bounce" style="animation-duration: 2s;">🍂</div>

                    <p class="text-slate-500 dark:text-slate-400 mb-2 text-sm font-medium leading-relaxed">
                        ${ui.emptyModuleDesc}
                    </p>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                        ${ui.emptyModuleConstructHint || 'En construccion, este punto es una carpeta vacia: crea una leccion para que la gente tenga algo que abrir.'}
                    </p>

                    <div class="space-y-3 relative z-10">
                        <button type="button" class="btn-empty-open-sources w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl shadow-lg hover:opacity-90 active:scale-95 transition-all text-sm">
                            ${ui.emptyModuleOpenSources || ui.noTreesBtnSources || 'Trees & libraries'}
                        </button>

                        ${store.value.constructionMode && store.value.activeSource && (store.value.activeSource.type === 'local' || (store.value.activeSource.url && store.value.activeSource.url.startsWith('local://')) || parseNostrTreeUrl(store.value.activeSource.url || ''))
                            ? `<button type="button" class="btn-create-lesson w-full py-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-bold rounded-xl border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors text-sm">
                                + ${ui.emptyModuleCreateLesson || ui.adminNewFile || 'Crear primera leccion'}
                               </button>`
                            : ''}
                    </div>
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml: emptyBody,
            layout: 'centered',
            enter: 'fade',
            panelSize: 'narrow',
            panelClass: 'arborito-float-modal-card--auto-h transform transition-all hover:scale-[1.02] overflow-visible',
        });

        bindCloseTaps(this, () => this.close());
        const openSrc = this.querySelector('.btn-empty-open-sources');
        if (openSrc) {
            bindMobileTap(openSrc, () => {
                this.close();
                store.setModal('sources');
            });
        }
        const btnCreate = this.querySelector('.btn-create-lesson');
        if (btnCreate) {
            bindMobileTap(btnCreate, async () => {
                this.close();

                const activeTreeRef =
                    (store.value.activeSource && store.value.activeSource.url) &&
                    parseNostrTreeUrl(store.value.activeSource.url);
                if (activeTreeRef && fileSystem.isNostrTreeSource()) {
                    const dirPath = TreeUtils.directoryPathForNewChild(node, (id) => store.findNode(id));
                    if (!dirPath) {
                        store.alert(store.ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
                        return;
                    }
                    const label = ui.emptyModuleFirstLessonName || ui.adminNewFile || 'New Lesson';
                    const newId = store.nostrCreateChild(dirPath, label, 'file', node.id);
                    const created = newId ? store.findNode(newId) : null;
                    if (created) {
                        await store.navigateTo(created.id);
                    } else {
                        store.alert(store.ui.graphErrorWithMessage || 'Error: {message}'.replace('{message}', 'Could not create lesson.'));
                    }
                    return;
                }

                const dirPath = TreeUtils.directoryPathForNewChild(node, (id) => store.findNode(id));
                if (!dirPath) {
                    store.alert(store.ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
                    return;
                }
                const label = ui.emptyModuleFirstLessonName || ui.adminNewFile || 'New Lesson';
                try {
                    await fileSystem.createNode(dirPath, label, 'file', node.id);
                } catch (e) {
                    store.alert(
                        (store.ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', e.message || 'Could not create lesson.')
                    );
                    return;
                }
                const parent = store.findNode(node.id);
                const matches = ((parent && parent.children) || []).filter(
                    (c) => c.name === label && (c.type === 'leaf' || c.type === 'exam')
                );
                const created = matches[matches.length - 1];
                if (created) {
                    await store.navigateTo(created.id);
                } else {
                    store.alert(store.ui.graphErrorWithMessage || 'Error: {message}'.replace('{message}', 'Could not create lesson.'));
                }
            });
        }
    }
}
customElements.define('arborito-modal-empty-module', ArboritoModalEmptyModule);
