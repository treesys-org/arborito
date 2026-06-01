import { readmeAsString } from '../../features/learning/course-intro-markdown.js';
import { randomUUIDSafe } from '../../shared/lib/secure-web-crypto.js';
import { buildDefaultLessonMarkdown } from '../../features/learning/default-lesson-markdown.js';
import { writeArboritoArchive } from '../../shared/lib/arborito-archive.js';

export const localTreesMixin = {
    plantTree(name, skeletonOpts = null) {
        const id = 'local-' + randomUUIDSafe();
        const now = new Date().toISOString();
        const ui = this.getUi();
        const parentCount = skeletonOpts && Number(skeletonOpts.parentCount) > 0
            ? Math.min(50, Math.max(1, Math.round(Number(skeletonOpts.parentCount))))
            : 0;
        const childrenPerParent = skeletonOpts && Number(skeletonOpts.childrenPerParent) > 0
            ? Math.min(50, Math.max(1, Math.round(Number(skeletonOpts.childrenPerParent))))
            : 0;

        let skeleton;
        if (parentCount > 0 && childrenPerParent > 0) {
            skeleton = this._buildVolumeSkeleton(id, name, parentCount, childrenPerParent, ui, now);
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
                    EN: {
                        id: `${id}-en-root`,
                        name,
                        type: 'root',
                        expanded: true,
                        icon: '🌱',
                        description: defaultName,
                        path: name,
                        children: [
                            {
                                id: `${id}-leaf-1`,
                                parentId: `${id}-en-root`,
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
        this.state.localTrees.push(newTree);
        this.persist();
        return newTree;
    },

    _buildVolumeSkeleton(id, treeName, parentCount, childrenPerParent, ui, now) {
        const rootId = `${id}-en-root`;
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
                EN: {
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

    plantTreeFromAI(schema) {
        if (!schema || !schema.title) throw new Error("Invalid AI Schema");
        const id = 'local-' + randomUUIDSafe();
        const now = new Date().toISOString();
        const rootId = `${id}-en-root`;
        const treeName = schema.title;
        const children = [];
        if (schema.modules) {
            schema.modules.forEach((mod, mIdx) => {
                const modId = `${id}-mod-${mIdx}`;
                const modPath = `${treeName} / ${mod.title}`;
                const modNode = {
                    id: modId, parentId: rootId, name: mod.title, type: "branch", icon: "📁",
                    description: mod.description || "", path: modPath, order: String(mIdx + 1), expanded: false, children: []
                };
                if (mod.lessons) {
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
            languages: { "EN": { id: rootId, name: treeName, type: "root", expanded: true, icon: "🧠", path: treeName, children: children } }
        };
        const newTree = { id, name: treeName, updated: Date.now(), data: skeleton };
        this.state.localTrees.push(newTree);
        this.persist();
        return newTree;
    },

    /**
     * Deep-clone an in-memory curriculum (e.g. from a public Nostr tree) into a new local garden entry.
     * @param {string} displayName
     * @param {object} rawGraph
     */
    plantLocalTreeFromCurriculumClone(displayName, rawGraph) {
        if (!rawGraph || typeof rawGraph !== 'object' || !rawGraph.languages) {
            throw new Error(this.getUi().forkNetworkTreeInvalidData || 'Invalid tree data to copy.');
        }
        const id = 'local-' + randomUUIDSafe();
        const name = String(displayName || '').trim() || (this.getUi().defaultGardenName || 'My tree');
        const data = JSON.parse(JSON.stringify(rawGraph));
        data.universeId = id;
        data.universeName = name;
        if (data.meta && typeof data.meta === 'object') {
            const m = { ...data.meta };
            delete m.publishedNetworkUrl;
            delete m.nostrBundleFormat;
            data.meta = m;
        }
        const newTree = { id, name, updated: Date.now(), data };
        this.state.localTrees.push(newTree);
        this.persist();
        return newTree;
    },

    // Import logic: .arborito archives only (strict mode)
    importLocalTree(jsonData) {
        // Strict check: must be an Arborito archive
        if (jsonData.magic !== "ARBORITO_ARCHIVE" || !jsonData.tree) {
            throw new Error("Invalid format. File must be a valid .arborito archive (with metadata and signature). Raw JSON is not supported.");
        }
        
        const treeData = jsonData.tree;
        
        // Validate internal structure
        if (!treeData.universeName || !treeData.languages) {
            throw new Error("Corrupt archive: Missing universe definition.");
        }
        
        // Generate new ID to avoid collisions with existing trees
        const id = 'local-' + randomUUIDSafe();
        
        const newTree = { id, name: treeData.universeName, updated: Date.now(), data: treeData };
        this.state.localTrees.push(newTree);
        const progress = jsonData.progress;
        if (progress && typeof progress === 'object' && progress.memory && typeof progress.memory === 'object') {
            for (const [k, v] of Object.entries(progress.memory)) {
                if (v && typeof v === 'object') this.state.memory[k] = v;
            }
        }
        this.persist();
        if (jsonData.searchIndex && typeof jsonData.searchIndex === 'object') {
            import('../../features/search/search-index-service.js').then((m) =>
                m.hydrateSearchIndexFromArchive(id, jsonData.searchIndex)
            );
        }
        return newTree;
    },

    /**
     * Serialise a local garden to a `.arborito` ZIP buffer.
     *
     * The archive's folder layout IS the tree: each lesson becomes a real .md
     * under `lessons/<LANG>/<NN module>/<NN leaf>.md`, optional `_branch.md`
     * carries per-folder metadata, and `manifest.json` only holds course-level
     * info. Add / rename / remove files inside the unzipped archive and rebuild
     * with no extra ceremony.
     * @param {string} id
     * @param {string} name
     * @param {object} treeData
     * @returns {Promise<Uint8Array>}
     */
    async serializeArboritoArchive(id, name, treeData) {
        const md = readmeAsString(treeData).trim();
        const ui = typeof this.getUi === 'function' ? this.getUi() : null;
        const guideTxt =
            ui && typeof ui.exportArchiveGuideTxt === 'string' && ui.exportArchiveGuideTxt.trim()
                ? ui.exportArchiveGuideTxt.trim()
                : [
                      'Arborito .arborito export',
                      '',
                      'This archive is a ZIP. Unzip it with any standard tool — the folder',
                      'structure IS the tree, so feel free to add, rename, or delete files',
                      'and folders directly, then re-zip:',
                      '',
                      '  manifest.json                                Course metadata only.',
                      '  lessons/<LANG>/<NN module>/<NN leaf>.md      One markdown per lesson.',
                      '  lessons/<LANG>/<NN module>/_branch.md        Optional folder metadata.',
                      '  files/                                       Bundled docs.',
                      '',
                      'Numeric `NN -` prefixes set order; the rest is the display name.',
                      'Per-lesson properties (icon, description, exam, …) live in',
                      'an optional `@info … @/info` block at the top of each .md.',
                      'Search index and forum data are not included; the index rebuilds',
                      'after import.',
                      '',
                      'Import: Arborito → Trees → Import (.arborito).'
                  ].join('\n');
        const bundledFiles = { 'EXPORT-GUIDE.txt': guideTxt };
        if (md) {
            bundledFiles['INTRO.md'] = md;
            bundledFiles['README.md'] = md;
        }
        return writeArboritoArchive({ id, name }, treeData, bundledFiles);
    },

    deleteLocalTree(id) {
        this.state.localTrees = this.state.localTrees.filter((t) => t.id !== id);
        this.persist();
        import('../../features/search/search-index-service.js').then((m) => m.clearSearchIndexForTreeId(id)).catch(() => {});
        import('../../features/learning/lesson-content-cache.js').then((m) => m.clearLessonCacheForSource(id)).catch(() => {});
    },

    getLocalTreeData(id) {
        return (this.state.localTrees.find(t => t.id === id) ? this.state.localTrees.find(t => t.id === id).data : undefined);
    }
};
