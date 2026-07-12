import { readZipArchive, writeZipArchive } from '../../../shared/lib/arborito-archive.js';
import { sanitizeCurriculumForArboritoArchive } from '../../publishing/api/arborito-bundle.js';
import { buildBranchExportAttribution } from '../../../shared/lib/arborito-attribution.js';
import { syncReadmeFromUniversePresentation } from '../../learning/api/course-intro-markdown.js';

/** @param {object|null} treeData */
export function listCurriculumLanguageKeys(treeData) {
    if (!treeData?.languages || typeof treeData.languages !== 'object') return [];
    return Object.keys(treeData.languages).filter((k) => treeData.languages[k]);
}

/** @param {object|null} treeData @param {string} lang `*` keeps all languages */
export function filterTreeToExportLanguage(treeData, lang) {
    const copy = JSON.parse(JSON.stringify(treeData || {}));
    const key = String(lang || '*').trim();
    if (!key || key === '*' || key === 'all') return copy;
    if (copy.languages && typeof copy.languages === 'object') {
        const picked = copy.languages[key];
        copy.languages = picked ? { [key]: picked } : copy.languages;
    }
    return copy;
}

async function embedVersionArchives(mainBytes, versionZips, meta = {}) {
    const enc = new TextEncoder();
    const entries = await readZipArchive(mainBytes);
    const list = [];
    for (const [name, data] of entries) {
        list.push({ name, data });
    }
    const versionIds = Object.keys(versionZips || {}).sort();
    list.push({
        name: 'versions/manifest.json',
        data: enc.encode(
            JSON.stringify(
                {
                    format: 'nested-arborito',
                    ids: versionIds,
                    exportLang: meta.lang || '*',
                    exportedAt: new Date().toISOString(),
                },
                null,
                2
            ) + '\n'
        ),
    });
    for (const [id, zipBytes] of Object.entries(versionZips || {})) {
        if (!id || !zipBytes) continue;
        list.push({ name: `versions/${id}.arborito`, data: zipBytes });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return writeZipArchive(list);
}

/**
 * @param {import('../../../core/store-singleton.js').getArboritoStore extends Function ? ReturnType<import('../../../core/store-singleton.js').getArboritoStore> : never} store
 * @param {{ branchId: string, lang?: string, scope?: 'current'|'all' }} opts
 */
export async function buildBranchExportArchiveBytes(store, { branchId, lang = '*', scope = 'current' }) {
    const entry = store.userStore.state.branches.find((t) => String(t.id) === String(branchId));
    if (!entry) return null;

    const active = store.state.activeSource;
    const viewingThisBranch =
        active &&
        (String(active.id || '').split('-')[0] === String(branchId) ||
            String(active.url || '') === `branch://${branchId}`);
    const activeSnapId =
        viewingThisBranch && active.type === 'archive' && active.localArchiveReleaseId != null
            ? String(active.localArchiveReleaseId)
            : null;

    let mainTree = entry.data;
    if (scope === 'current' && activeSnapId && entry.releaseSnapshots?.[activeSnapId]) {
        mainTree = entry.releaseSnapshots[activeSnapId];
    }

    const filtered = filterTreeToExportLanguage(mainTree, lang);
    syncReadmeFromUniversePresentation(filtered, store.ui);
    const curriculumOnly = sanitizeCurriculumForArboritoArchive(filtered);
    const attribution = buildBranchExportAttribution(store, {
        treeData: curriculumOnly,
        branchId: entry.id,
    });
    let bytes = await store.userStore.serializeArboritoArchive(entry.id, entry.name, curriculumOnly, {
        attribution,
    });

    if (scope === 'all' && entry.releaseSnapshots && Object.keys(entry.releaseSnapshots).length) {
        const versionZips = {};
        for (const [vid, snap] of Object.entries(entry.releaseSnapshots)) {
            const vFiltered = filterTreeToExportLanguage(snap, lang);
            syncReadmeFromUniversePresentation(vFiltered, store.ui);
            const vCurriculum = sanitizeCurriculumForArboritoArchive(vFiltered);
            versionZips[vid] = await store.userStore.serializeArboritoArchive(
                entry.id,
                `${entry.name} (${vid})`,
                vCurriculum,
                { attribution }
            );
        }
        bytes = await embedVersionArchives(bytes, versionZips, { lang });
    }

    return bytes;
}

/** Gather export options for the consolidated Biblioteca export sheet. */
export function collectBranchExportOptions(store, branchId) {
    const entry = store.userStore.state.branches.find((t) => String(t.id) === String(branchId));
    if (!entry) return null;
    const langs = listCurriculumLanguageKeys(entry.data);
    const snapIds = entry.releaseSnapshots ? Object.keys(entry.releaseSnapshots) : [];
    const active = store.state.activeSource;
    const viewingArchive =
        active &&
        (String(active.id || '').startsWith(String(branchId)) ||
            String(active.url || '') === `branch://${branchId}`) &&
        active.type === 'archive' &&
        active.localArchiveReleaseId != null;
    return {
        kind: 'branch',
        id: entry.id,
        name: entry.name,
        languages: langs,
        snapshotCount: snapIds.length,
        viewingArchive,
        activeSnapshotId: viewingArchive ? String(active.localArchiveReleaseId) : null,
    };
}

/** @param {ReturnType<import('../../../core/store-singleton.js').getArboritoStore>} store */
export function collectComposedTreeExportOptions(store, treeId) {
    const entry = store.userStore.getTree?.(treeId);
    if (!entry) return null;
    const refs = entry.branchRefs || [];
    const langs = new Set();
    let totalSnaps = 0;
    for (const ref of refs) {
        const bid = String(ref.branchId || ref.refId || '').trim();
        if (!bid) continue;
        const branch = store.userStore.state.branches.find((b) => String(b.id) === bid);
        if (!branch) continue;
        listCurriculumLanguageKeys(branch.data).forEach((l) => langs.add(l));
        totalSnaps += branch.releaseSnapshots ? Object.keys(branch.releaseSnapshots).length : 0;
    }
    return {
        kind: 'tree',
        id: entry.id,
        name: entry.name,
        languages: [...langs].sort(),
        snapshotCount: totalSnaps,
        branchRefs: refs,
    };
}

/**
 * @param {ReturnType<import('../../../core/store-singleton.js').getArboritoStore>} store
 * @param {{ treeId: string, lang?: string, scope?: 'current'|'all' }} opts
 */
export async function buildComposedTreeExportArchiveBytes(store, { treeId, lang = '*', scope = 'current' }) {
    const { writeComposedTreeArchive } = await import('../../forest/api/arborito-tree-archive.js');
    const { buildComposedTreeExportAttribution } = await import('../../../shared/lib/arborito-attribution.js');
    const entry = store.userStore.getTree?.(treeId);
    if (!entry) return null;

    await store.userStore.ensureBranchesHydrated();
    const embedded = {};
    for (const ref of entry.branchRefs || []) {
        const bid = String(ref.branchId || ref.refId || '').trim();
        if (!bid) continue;
        const bytes = await buildBranchExportArchiveBytes(store, { branchId: bid, lang, scope });
        if (bytes) embedded[bid] = bytes;
    }

    return writeComposedTreeArchive(entry, embedded, buildComposedTreeExportAttribution(store, entry));
}
