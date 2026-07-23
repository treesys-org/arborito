import { readmeAsString } from '../../features/learning/api/course-intro-markdown.js';
import { randomUUIDSafe } from '../../shared/lib/secure-web-crypto.js';
import { buildDefaultLessonMarkdown } from '../../features/learning/api/default-lesson-markdown.js';
import { writeArboritoArchive, buildTranslationIndex } from '../../shared/lib/arborito-archive.js';
import { getAuthorFormatGuide, getExportGuideTxt } from '../../shared/lib/author-format-guide.js';
import { removeBranchFromCatalog } from '../../shared/lib/arborito-catalog-store.js';
import { applyAttributionToTreeData } from '../../shared/lib/arborito-attribution.js';
import { clearSearchIndexForTreeId } from '../../features/search/api/search-index-service.js';
import { clearLessonCacheForSource } from '../../features/learning/api/lesson-content-cache.js';
import {
    computeBranchContentHash,
    findLocalBranchDuplicate,
} from '../../features/forest/api/branch-dedup.js';
import {
    collectLocalMediaFilenamesFromTree,
    getLessonMediaFile,
} from '../../features/learning/api/lesson-local-media-store.js';

import { isCurriculumPresetCode } from '../../features/sources/api/curriculum-locale-presets.js';
import { getArboritoStore } from '../store-singleton.js';

/** Curriculum language folder key from app UI locale (EN / ES / …). Never i18n labels. */
function curriculumLangKeyFromStore(storeLike) {
    let mainLang = '';
    try {
        mainLang = String(getArboritoStore()?.state?.lang || '').trim();
    } catch {
        /* ignore */
    }
    const raw = String(mainLang || storeLike?.state?.lang || storeLike?.getUi?.()?.lang || 'EN')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
    if (!raw) return 'EN';
    if (isCurriculumPresetCode(raw)) return raw;
    if (raw.startsWith('EN')) return 'EN';
    if (raw.startsWith('ES')) return 'ES';
    const two = raw.slice(0, 2);
    if (/^[A-Z]{2}$/.test(two) && isCurriculumPresetCode(two)) return two;
    /* "Language" / "Idioma" and other UI strings must never become LA / ID. */
    return 'EN';
}

export const branchesMixin = {
    plantBranch(name, skeletonOpts = null) {
        const id = 'branch-' + randomUUIDSafe();
        const now = new Date().toISOString();
        const ui = this.getUi();
        const langKey = curriculumLangKeyFromStore(this);
        const rootId = `${id}-${langKey.toLowerCase()}-root`;
        const parentCount = skeletonOpts && Number(skeletonOpts.parentCount) > 0
            ? Math.min(50, Math.max(1, Math.round(Number(skeletonOpts.parentCount))))
            : 0;
        const childrenPerParent = skeletonOpts && Number(skeletonOpts.childrenPerParent) > 0
            ? Math.min(50, Math.max(1, Math.round(Number(skeletonOpts.childrenPerParent))))
            : 0;

        let skeleton;
        if (parentCount > 0 && childrenPerParent > 0) {
            skeleton = this._buildVolumeSkeleton(id, name, parentCount, childrenPerParent, ui, now, langKey);
        } else {
            const defaultName = ui.defaultGardenName || 'My Private Garden';
            const lessonName = ui.defaultLessonName || 'First Lesson';
            const lessonMarkdown = buildDefaultLessonMarkdown(ui);
            const lessonDescription =
                (String(ui.defaultLessonContent || '').trim().split('\n')[0] || '').slice(0, 220) ||
                (String(ui.defaultLessonFirstHeading || '').trim() || lessonName);

            skeleton = {
                generatedAt: now,
                universeId: id,
                universeName: name,
                languages: {
                    [langKey]: {
                        id: rootId,
                        name,
                        type: 'root',
                        expanded: true,
                        icon: '🌱',
                        description: defaultName,
                        path: name,
                        children: [
                            {
                                id: `${id}-leaf-1`,
                                parentId: rootId,
                                name: lessonName,
                                type: 'leaf',
                                icon: '📝',
                                path: `${name} / ${lessonName}`,
                                order: '1',
                                description: lessonDescription,
                                content: lessonMarkdown
                            }
                        ]
                    }
                }
            };
        }

        const newTree = { id, name, updated: Date.now(), data: skeleton };
        this.state.branches.push(newTree);
        this.markBranchDirty(id);
        this.notifyCatalogChanged?.();
        this.persist();
        return newTree;
    },

    _buildVolumeSkeleton(id, treeName, parentCount, childrenPerParent, ui, now, langKey = 'EN') {
        const rootId = `${id}-${String(langKey).toLowerCase()}-root`;
        const topicLabel = ui.skeletonTopicName || 'Topic';
        const lessonLabel = ui.skeletonLessonName || 'Lesson';
        const children = [];

        for (let t = 0; t < parentCount; t++) {
            const modId = `${id}-mod-${t}`;
            const modTitle = `${topicLabel} ${t + 1}`;
            const modPath = `${treeName} / ${modTitle}`;
            const modNode = {
                id: modId,
                parentId: rootId,
                name: modTitle,
                type: 'branch',
                icon: '📁',
                description: '',
                path: modPath,
                order: String(t + 1),
                expanded: t === 0,
                children: []
            };
            for (let l = 0; l < childrenPerParent; l++) {
                const lesId = `${id}-les-${t}-${l}`;
                const lesTitle = `${lessonLabel} ${l + 1}`;
                modNode.children.push({
                    id: lesId,
                    parentId: modId,
                    name: lesTitle,
                    type: 'leaf',
                    icon: '📄',
                    path: `${modPath} / ${lesTitle}`,
                    order: String(l + 1),
                    description: '',
                    content: `# ${lesTitle}\n\n`
                });
            }
            children.push(modNode);
        }

        return {
            generatedAt: now,
            universeId: id,
            universeName: treeName,
            languages: {
                [langKey]: {
                    id: rootId,
                    name: treeName,
                    type: 'root',
                    expanded: true,
                    icon: '🌱',
                    path: treeName,
                    description: '',
                    children
                }
            }
        };
    },

    plantBranchFromAI(schema) {
        if (!schema || !schema.title) throw new Error("Invalid AI Schema");
        const id = 'branch-' + randomUUIDSafe();
        const now = new Date().toISOString();
        const langKey = curriculumLangKeyFromStore(this);
        const rootId = `${id}-${langKey.toLowerCase()}-root`;
        const treeName = schema.title;
        const children = [];
        if (Array.isArray(schema.modules)) {
            schema.modules.forEach((mod, mIdx) => {
                const modId = `${id}-mod-${mIdx}`;
                const modPath = `${treeName} / ${mod.title}`;
                const modNode = {
                    id: modId, parentId: rootId, name: mod.title, type: "branch", icon: "📁",
                    description: mod.description || "", path: modPath, order: String(mIdx + 1), expanded: false, children: []
                };
                if (Array.isArray(mod.lessons)) {
                    mod.lessons.forEach((les, lIdx) => {
                        const lesId = `${id}-les-${mIdx}-${lIdx}`;
                        const lesNode = {
                            id: lesId, parentId: modId, name: les.title, type: "leaf", icon: "📄",
                            path: `${modPath} / ${les.title}`, order: String(lIdx + 1), description: les.description || "",
                            content: `# ${les.title}\n\n${les.description}\n\n${les.outline}`
                        };
                        modNode.children.push(lesNode);
                    });
                }
                children.push(modNode);
            });
        }
        const skeleton = {
            generatedAt: now, universeId: id, universeName: treeName,
            languages: { [langKey]: { id: rootId, name: treeName, type: "root", expanded: true, icon: "🧠", path: treeName, children: children } }
        };
        const newTree = { id, name: treeName, updated: Date.now(), data: skeleton };
        this.state.branches.push(newTree);
        this.markBranchDirty(id);
        this.notifyCatalogChanged?.();
        this.persist();
        return newTree;
    },

    /**
     * Deep-clone an in-memory curriculum (e.g. from a public Nostr tree) into a new local garden entry.
     * @param {string} displayName
     * @param {object} rawGraph
     */
    plantBranchFromCurriculumClone(displayName, rawGraph, { sourceUrl = '' } = {}) {
        if (!rawGraph || typeof rawGraph !== 'object' || !rawGraph.languages) {
            throw new Error(this.getUi().forkNetworkTreeInvalidData || 'Invalid tree data to copy.');
        }
        const id = 'branch-' + randomUUIDSafe();
        const name = String(displayName || '').trim() || (this.getUi().defaultGardenName || 'My tree');
        const data = JSON.parse(JSON.stringify(rawGraph));
        data.universeId = id;
        data.universeName = name;
        const src = String(sourceUrl || '').trim();
        if (src) {
            const pres =
                data.universePresentation && typeof data.universePresentation === 'object'
                    ? { ...data.universePresentation }
                    : {};
            data.universePresentation = {
                ...pres,
                forkOf: {
                    treeUrl: src,
                    name: String(rawGraph.universeName || displayName || '').trim() || undefined,
                },
                license: pres.license || 'CC-BY-SA-4.0',
                licenseUrl: pres.licenseUrl || 'https://creativecommons.org/licenses/by-sa/4.0/',
            };
        }
        if (data.meta && typeof data.meta === 'object') {
            const m = { ...data.meta };
            delete m.publishedNetworkUrl;
            delete m.nostrBundleFormat;
            delete m.demo;
            delete m.arboritoBundled;
            delete m.universeId;
            delete m.shareCode;
            if (Object.keys(m).length) data.meta = m;
            else delete data.meta;
        }
        /* Local gardens are not Nostr-lazy: drop network chunk markers only when content exists. */
        const clearLazy = (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'leaf' || node.type === 'exam') {
                if (node.content) {
                    delete node.treeLazyContent;
                    delete node.treeContentKey;
                }
            }
            if (Array.isArray(node.children)) node.children.forEach(clearLazy);
        };
        for (const lang of Object.keys(data.languages || {})) clearLazy(data.languages[lang]);
        const newTree = { id, name, updated: Date.now(), data };
        this.state.branches.push(newTree);
        this.markBranchDirty(id);
        this.notifyCatalogChanged?.();
        this.persist();
        return newTree;
    },

    /**
     * Import the parsed shape produced by `readArboritoArchive` (ZIP → tree).
     * Only `.arborito` archives are accepted; raw JSON trees are not. The
     * search index is rebuilt lazily from the tree, and progress never travels
     * inside the archive (it is device-local).
     * @returns {{ entry: object, reused: boolean }}
     */
    importBranch(jsonData) {
        if (jsonData.format !== "arborito" || !jsonData.tree) {
            throw new Error("Invalid format. File must be a valid .arborito archive (ZIP with manifest.json). Raw JSON is not supported.");
        }

        const treeData = jsonData.tree;
        if (jsonData.attribution || jsonData.meta?.attribution) {
            applyAttributionToTreeData(treeData, jsonData.attribution || jsonData.meta.attribution);
        }

        if (!treeData.universeName || !treeData.languages) {
            throw new Error("Corrupt archive: Missing universe definition.");
        }

        const contentHash = computeBranchContentHash(treeData, (obj) => this.hashJson(obj));
        const publishedNetworkUrl = String(
            jsonData.meta?.publishedNetworkUrl || treeData.meta?.publishedNetworkUrl || ''
        ).trim();
        const sourceUniverseId = String(treeData.universeId || jsonData.meta?.id || '').trim();
        const existing = findLocalBranchDuplicate(this.state.branches, {
            contentHash,
            publishedNetworkUrl,
            sourceUniverseId,
            hashJson: (obj) => this.hashJson(obj),
        });
        if (existing) {
            return { entry: existing, reused: true };
        }

        const id = 'branch-' + randomUUIDSafe();

        const newTree = { id, name: treeData.universeName, updated: Date.now(), data: treeData };
        if (contentHash) newTree.contentHash = contentHash;
        if (!treeData.translationIndex) {
            treeData.translationIndex = buildTranslationIndex(treeData);
        }
        this.state.branches.push(newTree);
        this.markBranchDirty(id);
        this.notifyCatalogChanged?.();
        this.persist();
        return { entry: newTree, reused: false };
    },

    /**
     * Serialise a local garden to a `.arborito` ZIP buffer.
     *
     * The archive's folder layout IS the tree: each lesson becomes a real .md
     * under `lessons/<LANG>/<NN folder>/…/<NN leaf>.md`, optional `README.md`
     * per module, and `manifest.json` only holds course-level info. For bilingual
     * courses, mirror `lessons/ES/…` and `lessons/EN/…`, same numbers link lessons.
     * @param {string} id
     * @param {string} name
     * @param {object} treeData
     * @returns {Promise<Uint8Array>}
     */
    async serializeArboritoArchive(id, name, treeData, { attribution } = {}) {
        const md = readmeAsString(treeData).trim();
        const ui = typeof this.getUi === 'function' ? this.getUi() : null;
        const uiLang = String(ui?.lang || 'ES');
        const guideTxt = getExportGuideTxt(uiLang);
        const authorGuide = getAuthorFormatGuide(uiLang);
        const authorFile = String(uiLang).toUpperCase().startsWith('EN') ? 'AUTHOR-GUIDE.md' : 'AUTORIA.md';

        const bundledFiles = {
            'EXPORT-GUIDE.txt': guideTxt,
            [authorFile]: authorGuide
        };
        if (md) {
            bundledFiles['INTRO.md'] = md;
            bundledFiles['README.md'] = md;
        }
        const mediaFiles = {};
        try {
            const names = collectLocalMediaFilenamesFromTree(treeData);
            for (const filename of names) {
                const row = await getLessonMediaFile(id, filename);
                if (!row?.blob) continue;
                const buf = new Uint8Array(await row.blob.arrayBuffer());
                if (buf.byteLength) mediaFiles[filename] = buf;
            }
        } catch (e) {
            console.warn('[Arborito] packing local media skipped', e);
        }
        return writeArboritoArchive({ id, name }, treeData, bundledFiles, { attribution, mediaFiles });
    },

    /** Bump branch to top of Biblioteca after the learner opens it. */
    touchBranchRecency(branchId) {
        const id = String(branchId || '').trim();
        if (!id) return false;
        const entry = this.state.branches.find((b) => String(b.id) === id);
        if (!entry) return false;
        entry.updated = Date.now();
        this.state.branches = [...this.state.branches];
        this.markBranchDirty(id);
        this.persist();
        return true;
    },

    deleteBranch(id) {
        const bid = String(id || '').trim();
        if (!bid) return Promise.resolve(false);
        this.unlinkBranchFromTrees?.(bid);
        this.state.branches = this.state.branches.filter((t) => String(t.id) !== bid);
        this._branchesDirty?.delete(bid);
        this._rememberCatalogTombstone('branches', bid);
        this.notifyCatalogChanged?.();
        this.persist();
        clearSearchIndexForTreeId(bid);
        clearLessonCacheForSource(bid);
        return removeBranchFromCatalog(bid).catch((e) => {
            console.warn('[Arborito] removeBranchFromCatalog failed', bid, e);
            return false;
        });
    },

    getBranchData(id) {
        return (this.state.branches.find(t => t.id === id) ? this.state.branches.find(t => t.id === id).data : undefined);
    }
};
