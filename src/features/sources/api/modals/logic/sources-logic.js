import { getArboritoStore as store } from '../../../../../core/store-singleton.js';
import { finishSourcesLoadSession, isSourcesWelcomeLoadClose, captureHadCurriculumBeforeLoad } from '../../sources-session.js';
import { runPlantNewTree } from '../../plant-flow.js';
import { readArboritoArchive } from '../../../../../shared/lib/arborito-archive.js';
import { pickLocalFile } from '../../../../../shared/lib/pick-local-file.js';
import { analyzeArboritoImport } from '../../../../forest/api/arborito-tree-archive.js';
import { confirmArboritoImport, formatArboritoImportSummary } from '../../../../forest/api/arborito-import-preview.js';
import { importComposedTreeFromArchive } from '../../../../forest/api/import-composed-tree-bundle.js';
import { writeComposedTreeArchive } from '../../../../forest/api/arborito-tree-archive.js';
import { buildComposedTreeExportAttribution } from '../../../../../shared/lib/arborito-attribution.js';
import { yieldToPaint } from '../../../../../shared/lib/yield-to-paint.js';
import { saveExportFile, EXPORT_FILTERS, sanitizeExportFileName } from '../../../../backup-export/api/export/save-export-file.js';
import { notifyExportSaved } from '../../../../backup-export/api/export/export-result-ui.js';
import {
    buildBranchExportArchiveBytes,
    buildComposedTreeExportArchiveBytes,
} from '../../../../backup-export/api/export-curriculum-archive.js';
export { shareActiveTree, shareTreeLink, shareComposedTree } from '../../share-tree-link.js';

/** Load overlay CE + paint before heavy import / mount work (avoids blocked main thread with no UI). */
async function beginBlockingTreeOverlay() {
    const { ensureTreeGrowingOverlayReady } = await import('../../../../tree-graph/api/tree-growing-overlay.js');
    await ensureTreeGrowingOverlayReady();
    store.update({ treeGrowingOverlay: true });
    await yieldToPaint();
    /* Extra yield so the blocking overlay paints before sync zip work monopolizes the main thread. */
    await new Promise((resolve) => setTimeout(resolve, 0));
    await yieldToPaint();
}

async function endBlockingTreeOverlay() {
    store.update({ treeGrowingOverlay: false });
    await yieldToPaint();
}

export function handleSwitch(modal) {
    if (modal.selectedVersionUrl) {
        const releases = store.value.availableReleases || [];
        const target = releases.find((r) => r.url === modal.selectedVersionUrl);
        if (target) {
            const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
            const active = store.value.activeSource;
            const newSource = {
                ...active,
                id: target.id || `release-${Date.now()}`,
                url: target.url,
                type: target.type,
                name: target.name || active.name
            };
            store.loadData(newSource);
            finishSourcesLoadSession(modal, { hadCurriculumBeforeLoad });
        }
    }
}

export async function plantNewTree(modal, name, skeleton = null) {
    await runPlantNewTree(store, name, modal, skeleton);
}

async function notifyImportCareSummary(jsonData) {
    const sum = jsonData.meta && jsonData.meta.importSummary;
    if (!sum || typeof sum !== 'object') return '';
    const { countCareDue } = await import('../../../../garden-progress/api/care-reminders.js');
    const due = countCareDue(store);
    const ui = store.ui;
    const tpl =
        ui.importCareDone ||
        '{notes} lessons imported · {scheduled} with care schedule · {due} due today.';
    return String(tpl)
        .replace(/\{notes\}/g, String(sum.noteCount ?? ''))
        .replace(/\{scheduled\}/g, String(sum.noteCount ?? ''))
        .replace(/\{due\}/g, String(due));
}

function importDoneName(treeName, fallbackKey, fallbackLabel) {
    const ui = store.ui;
    return String(treeName || ui[fallbackKey] || fallbackLabel).trim();
}

function importDoneBody(template, name) {
    return String(template || '“{name}” is ready on this device.').replace(/\{name\}/g, name);
}

/** Toast on a clean import; dialog only when sync, care summary, or author notes need attention. */
async function resolveImportedBranchFollowUp(treeName, careLine, authorWarnings = []) {
    const ui = store.ui;
    const signedIn = !!(store.isSignedIn && store.isSignedIn());
    const name = importDoneName(treeName, 'sourcesActiveBranchHeading', 'Branch');
    const hasWarnings = authorWarnings.length > 0;
    const needsDialog = signedIn || hasWarnings;

    if (!needsDialog) {
        const toastParts = [importDoneBody(ui.importBranchDoneBody, name)];
        if (careLine) toastParts.push(careLine);
        store.notify(toastParts.join(' · '), false);
        return { confirmed: true, sync: false };
    }

    const bodyParts = [importDoneBody(ui.importBranchDoneBody, name)];
    if (careLine) bodyParts.push(careLine);
    if (hasWarnings) {
        const head = ui.importAuthorWarningsHead || 'Authoring notes:';
        const list = authorWarnings.map((w) => `• ${w}`).join('\n');
        bodyParts.push(`${head}\n\n${list}`);
    }
    if (!signedIn) {
        bodyParts.push(
            ui.importBranchDoneGuestSyncHint ||
                'Sign in from Profile to sync branches across devices.'
        );
    }

    const result = await store.acknowledge({
        title: ui.importBranchDoneTitle || 'Branch imported',
        body: bodyParts.join('\n\n'),
        dialogIcon: '🌿',
        confirmText: ui.importTreeDoneOk || ui.dialogConfirmTitle || 'OK',
        switchLabel: signedIn
            ? (ui.importBranchSyncCheckbox ||
                  'Sync encrypted copy to my account (other devices)')
            : undefined,
        switchDefault: true,
    });
    if (!result) return { confirmed: false, sync: false };
    if (result === true) return { confirmed: true, sync: signedIn };
    if (typeof result === 'object' && result.confirmed) {
        return { confirmed: true, sync: !!(signedIn && result.checked) };
    }
    return { confirmed: false, sync: false };
}

function notifyImportedTree(treeName) {
    const ui = store.ui;
    const name = importDoneName(treeName, 'sourcesActiveTreeHeading', 'Tree');
    store.notify(importDoneBody(ui.importTreeDoneBody, name), false);
}

async function importBranchFromAnalysis(modal, analysis) {
    const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
    await store.ensureCoreReady();
    await beginBlockingTreeOverlay();
    try {
        await store.userStore?.ensureBranchesHydrated?.();
        const archive = analysis.archive || (await readArboritoArchive(analysis._buffer));
        const { entry: newTree, reused } = store.userStore.importBranch(archive);
        const source = {
            id: newTree.id,
            name: newTree.name,
            url: `branch://${newTree.id}`,
            type: 'branch',
        };
        finishImportModal(modal, { hadCurriculumBeforeLoad });
        const loaded = await store.loadData(source);
        if (!loaded) {
            throw new Error(store.state.error || 'Could not open imported branch.');
        }
        store._curriculumLoadedAt = Date.now();
        modal._sourcesMainTab = 'branches';
        modal.activeTab = 'branch';
        if (isSourcesWelcomeLoadClose()) {
            return;
        }
        if (reused) {
            return;
        }
        const careLine = await notifyImportCareSummary(archive);
        const authorWarnings = Array.isArray(analysis.authorWarnings)
            ? analysis.authorWarnings
            : Array.isArray(archive.authorWarnings)
              ? archive.authorWarnings
              : [];
        const { confirmed, sync } = await resolveImportedBranchFollowUp(newTree.name, careLine, authorWarnings);
        if (sync && confirmed) {
            try {
                await store.publishActiveBranchAsPrivate();
            } catch (err) {
                const ui = store.ui;
                store.notify(
                    (ui.importTreeSyncFailed || 'Import OK, but account sync failed: {message}').replace(
                        '{message}',
                        err && err.message ? err.message : String(err)
                    ),
                    true
                );
            }
        }
        modal._sourcesMainTab = 'branches';
        modal.activeTab = 'branch';
    } catch (err) {
        store.update({ treeGrowingOverlay: false, treeHydrating: false });
        throw err;
    } finally {
        await endBlockingTreeOverlay();
    }
}

async function importComposedTreeFromAnalysis(modal, buffer) {
    const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
    await store.ensureCoreReady();
    await beginBlockingTreeOverlay();
    try {
        const entry = await importComposedTreeFromArchive(store, buffer);
        if (!entry) throw new Error('Import failed.');
        modal._sourcesMainTab = 'trees';
        modal.activeTab = 'trees';
        finishImportModal(modal, { hadCurriculumBeforeLoad });
        const ok = await store.loadComposedTree(entry.id);
        if (!ok) throw new Error('Could not open imported tree.');
        store._curriculumLoadedAt = Date.now();
        if (isSourcesWelcomeLoadClose()) {
            return;
        }
        notifyImportedTree(entry.name);
    } catch (err) {
        store.update({ treeGrowingOverlay: false, treeHydrating: false });
        throw err;
    } finally {
        await endBlockingTreeOverlay();
    }
}

function finishImportModal(modal, opts = {}) {
    finishSourcesLoadSession(modal, opts);
}

export function importTreeFromFile(modal) {
    void import('../../../../tree-graph/api/tree-growing-overlay.js');
    pickLocalFile({
        accept: '.arborito,application/octet-stream',
        onFile: (file) => {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const buffer = event.target.result;
                    await beginBlockingTreeOverlay();
                    let analysis;
                    try {
                        analysis = await analyzeArboritoImport(buffer);
                    } finally {
                        await endBlockingTreeOverlay();
                    }
                    analysis._buffer = buffer;
                    const ok = await confirmArboritoImport(store, analysis);
                    if (!ok) return;
                    if (analysis.kind === 'composed-tree') {
                        await importComposedTreeFromAnalysis(modal, buffer);
                    } else {
                        await importBranchFromAnalysis(modal, analysis);
                    }
                } catch (err) {
                    store.update({ treeGrowingOverlay: false, treeHydrating: false });
                    const ui = store.ui;
                    store.notify(
                        (ui.sourcesImportError || 'Error importing: {message}').replace(
                            '{message}',
                            err?.message || String(err)
                        ),
                        true
                    );
                }
            };
            reader.onerror = () => {
                const ui = store.ui;
                store.notify(ui.sourcesImportError || 'Could not read the selected file.', true);
            };
            reader.readAsArrayBuffer(file);
        },
    });
}

export async function loadBranch(modal, id, name) {
    await store.ensureCoreReady();
    const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
    const ok = await store.loadData({
        id,
        name,
        url: `branch://${id}`,
        type: 'branch',
        isTrusted: true,
    });
    if (!ok) {
        if (modal?.isConnected && typeof modal.updateContent === 'function') {
            modal.updateContent();
        }
        return false;
    }
    finishSourcesLoadSession(modal, { hadCurriculumBeforeLoad });
    return true;
}

export async function exportBranch(id, name, { lang = '*', scope = 'current' } = {}) {
    const entry = store.userStore.state.branches.find((t) => t.id === id);
    if (!entry) return;

    const archiveBytes = await buildBranchExportArchiveBytes(store, { branchId: id, lang, scope });
    if (!archiveBytes) return;
    await downloadArboritoBlob(archiveBytes, `arborito-branch-${safeFileName(name)}.arborito`);
}

export async function exportComposedTree(treeId, name, { lang = '*', scope = 'current' } = {}) {
    const ui = store.ui;
    const entry = store.userStore.getTree?.(treeId);
    if (!entry) return;

    await store.userStore.ensureBranchesHydrated();
    const refs = entry.branchRefs || [];
    const missing = refs.filter((ref) => {
        const bid = String(ref.branchId || ref.refId || '').trim();
        return bid && !store.userStore.state.branches?.some((b) => b.id === bid);
    });
    if (missing.length) {
        const summary = formatArboritoImportSummary(ui, {
            kind: 'composed-tree',
            title: entry.name,
            branchRefs: refs.map((r) => ({
                displayName: r.displayName || r.branchId,
                embedded: !!store.userStore.state.branches?.some(
                    (b) => b.id === String(r.branchId || r.refId || '')
                ),
            })),
            branchCount: refs.length,
        });
        const ok = await store.confirm(
            `${ui.sourcesExportTreeMissingBody || 'Some branches are not on this device and will be omitted from the file.'}\n\n${summary}`,
            ui.sourcesExportTreeMissingTitle || 'Export tree',
            false
        );
        if (!ok) return;
    }

    const embedded = {};
    for (const ref of refs) {
        const bid = String(ref.branchId || ref.refId || '').trim();
        if (!bid) continue;
        const bytes = await buildBranchExportArchiveBytes(store, { branchId: bid, lang, scope });
        if (bytes) embedded[bid] = bytes;
    }

    const archiveBytes = await writeComposedTreeArchive(
        entry,
        embedded,
        buildComposedTreeExportAttribution(store, entry)
    );
    await downloadArboritoBlob(archiveBytes, `arborito-tree-${safeFileName(name || entry.name)}.arborito`);
}

function safeFileName(name) {
    return String(name || 'export')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
}

async function downloadArboritoBlob(archiveBytes, filename) {
    const result = await saveExportFile({
        data: archiveBytes,
        filename: sanitizeExportFileName(filename, 'export.arborito'),
        mimeType: 'application/zip',
        filters: EXPORT_FILTERS.arborito,
    });
    if (result?.ok) notifyExportSaved(result, store.ui);
    return result;
}
