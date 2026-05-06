import { readmeAsString } from '../utils/course-intro-markdown.js';
import { randomUUIDSafe } from '../utils/secure-web-crypto.js';
import { buildDefaultLessonMarkdown } from '../utils/default-lesson-markdown.js';

// BOTANICAL SEEDS: More universal concept for knowledge trees
const SEED_TYPES = ['🌲', '🌰', '🌾', '🍁', '🥥', '🥜', '🌰', '🫘', '🍄', '🌱'];

const MAX_BOOKMARKS = 50;

/** Default catalog (manifest JSON) — repo https://github.com/treesys-org/arborito-games */
const DEFAULT_ARCADE_GAME_CATALOG = {
    id: 'treesys-arborito-games-main',
    name: 'Arborito Games',
    url: 'https://raw.githubusercontent.com/treesys-org/arborito-games/main/manifest.json',
    isOfficial: true
}; 

export class UserStore {
    constructor(uiStringsGetter, onPersistCallback = null) {
        this.getUi = uiStringsGetter; 
        this.onPersist = onPersistCallback;
        this.state = {
            completedNodes: new Set(),
            bookmarks: {},
            installedGames: [], 
            gameRepos: [], 
            gameData: {}, 
            localTrees: [], 
            cloudProgressSync: false,
            memory: {}, // Arborito memory core (SRS state)
            gamification: {
                username: '',
                avatar: '👤',
                xp: 0,
                dailyXP: 0,
                streak: 0,
                lastLoginDate: null,
                seeds: []
            }
        };
        this.load();
    }

    get dailyXpGoal() { return 50; }

    /** Compat: store and UI use `userStore.settings.method()`; logic lives on this class. */
    get settings() {
        return this;
    }

    load() {
        this.loadProgress();
        this.loadBookmarks();
        this.checkStreak();
    }

    loadProgress() {
        try {
            const saved = localStorage.getItem('arborito-progress');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    this.state.completedNodes = new Set(parsed);
                } else if (parsed.progress) {
                    this.state.completedNodes = new Set(parsed.progress);
                    if (typeof parsed.cloudProgressSync === 'boolean') {
                        this.state.cloudProgressSync = parsed.cloudProgressSync;
                    }
                    if (parsed.gamification) {
                        this.state.gamification = { ...this.state.gamification, ...parsed.gamification };
                        if (parsed.gamification.fruits && !parsed.gamification.seeds) {
                            this.state.gamification.seeds = parsed.gamification.fruits.map(f => ({
                                ...f,
                                ...parsed.gamification.seeds
                            }));
                        }
                    }
                    if (parsed.installedGames) this.state.installedGames = parsed.installedGames;
                    if (parsed.gameRepos) this.state.gameRepos = parsed.gameRepos;
                    if (parsed.gameData) this.state.gameData = parsed.gameData;
                    if (parsed.localTrees) this.state.localTrees = parsed.localTrees;
                    
                    // Memory Core Load
                    if (parsed.memory) this.state.memory = parsed.memory;
                }
            }
            
            this.state.gameRepos = this.state.gameRepos.filter(r => r.id !== 'official');
            if (this.ensureDefaultArcadeGameCatalog()) {
                this.persist();
            }
        } catch(e) {}
    }

    /**
     * Set oficial de cartuchos (treesys-org/arborito-games): siempre presente y al frente.
     * Quita duplicados por URL y reordena si hace falta.
     */
    ensureDefaultArcadeGameCatalog() {
        const def = DEFAULT_ARCADE_GAME_CATALOG;
        let repos = this.state.gameRepos.filter((r) => !(r.url === def.url && r.id !== def.id));
        const idx = repos.findIndex((r) => r.id === def.id);
        let changed = repos.length !== this.state.gameRepos.length;
        if (idx === -1) {
            repos = [{ ...def }, ...repos];
            changed = true;
        } else if (idx > 0) {
            const row = repos.splice(idx, 1)[0];
            repos = [row, ...repos];
            changed = true;
        }
        if (changed) this.state.gameRepos = repos;
        return changed;
    }

    getPersistenceData() {
        return {
            progress: Array.from(this.state.completedNodes),
            gamification: this.state.gamification,
            bookmarks: this.state.bookmarks, 
            installedGames: this.state.installedGames,
            gameRepos: this.state.gameRepos,
            gameData: this.state.gameData,
            localTrees: this.state.localTrees,
            cloudProgressSync: !!this.state.cloudProgressSync,
            memory: this.state.memory, // Memory Core Persist
            timestamp: Date.now()
        };
    }

    persist() {
        try {
            const payload = this.getPersistenceData();
            localStorage.setItem('arborito-progress', JSON.stringify(payload));
            if (this.onPersist) this.onPersist(payload);
        } catch (e) { console.warn("Storage Error", e); }
    }
    
    getExportJson() {
        const data = { 
            v: 3, ts: Date.now(), p: Array.from(this.state.completedNodes), 
            g: this.state.gamification, b: this.state.bookmarks,
            games: this.state.installedGames, repos: this.state.gameRepos,
            d: this.state.gameData, t: this.state.localTrees, m: this.state.memory,
            // Optional: writer keypair for encrypted Nostr progress sync (export/import together).
            nostrPair: (() => {
                try {
                    const raw = localStorage.getItem('arborito-nostr-user-pair');
                    return raw ? JSON.parse(raw) : null;
                } catch {
                    return null;
                }
            })()
        };
        return JSON.stringify(data, null, 2);
    }

    // --- MEMORY CORE (SRS LOGIC / SM-2) ---

    // Quality: 0 (Forgot) to 5 (Perfect)
    reportMemory(nodeId, quality) {
        if (!nodeId) return;
        
        // Initialize if new or missing
        let item = this.state.memory[nodeId] || {
            lvl: 0,         // Streak/Interval Level
            ease: 2.5,      // Easiness Factor
            interval: 0,    // Days until next review
            lastReview: 0,  // Timestamp
            dueDate: 0      // Timestamp
        };

        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        if (quality < 3) {
            // Failed: Reset interval, keep ease relatively same but lower
            item.lvl = 0;
            item.interval = 1;
        } else {
            // Success
            if (item.lvl === 0) {
                item.interval = 1;
            } else if (item.lvl === 1) {
                item.interval = 6; // Standard SM-2 jump
            } else {
                item.interval = Math.round(item.interval * item.ease);
            }
            item.lvl++;
            
            // Adjust Ease
            // standard SM-2 formula: EF' = EF + (0.1 - (5-q)*(0.08+(5-q)*0.02))
            item.ease = item.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            if (item.ease < 1.3) item.ease = 1.3; // Minimum ease cap
        }

        item.lastReview = now;
        item.dueDate = now + (item.interval * oneDay);

        this.state.memory[nodeId] = item;
        this.persist();
        
        return item;
    }

    getMemoryStatus(nodeId) {
        const item = this.state.memory[nodeId];
        // If completed but no memory data, assume fresh/legacy (Health 1.0)
        if (!item) return { health: 1.0, isDue: false, interval: 0 };

        const now = Date.now();
        if (now >= item.dueDate) {
            return { health: 0, isDue: true, interval: item.interval };
        }

        // Calculate linear decay for visualization
        // Health goes from 1.0 (Review Date) to 0.0 (Due Date)
        const totalDuration = item.dueDate - item.lastReview;
        const elapsed = now - item.lastReview;
        let health = 1.0 - (elapsed / totalDuration);
        if (health < 0) health = 0;
        
        return { health, isDue: false, interval: item.interval };
    }

    getDueNodes() {
        const dueIds = [];
        const now = Date.now();
        for (const [id, item] of Object.entries(this.state.memory)) {
            if (now >= item.dueDate) {
                dueIds.push(id);
            }
        }
        return dueIds;
    }

    plantTree(name) {
        const id = 'local-' + randomUUIDSafe();
        const now = new Date().toISOString();
        const ui = this.getUi();
        const defaultName = ui.defaultGardenName || "My Private Garden";
        const lessonName = ui.defaultLessonName || "First Lesson";
        const lessonMarkdown = buildDefaultLessonMarkdown(ui);
        const lessonDescription =
            (String(ui.defaultLessonContent || '').trim().split('\n')[0] || '').slice(0, 220) ||
            (String(ui.defaultLessonFirstHeading || '').trim() || lessonName);

        const skeleton = {
            generatedAt: now,
            universeId: id,
            universeName: name,
            languages: {
                "EN": {
                    id: `${id}-en-root`, name: name, type: "root", expanded: true,
                    icon: "🌱", description: defaultName, path: name,
                    children: [{
                        id: `${id}-leaf-1`, parentId: `${id}-en-root`,
                        name: lessonName, type: "leaf", icon: "📝",
                        path: `${name} / ${lessonName}`, order: "1",
                        description: lessonDescription,
                        content: lessonMarkdown
                    }]
                }
            }
        };
        const newTree = { id: id, name: name, updated: Date.now(), data: skeleton };
        this.state.localTrees.push(newTree);
        this.persist();
        return newTree;
    }

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
                            content: `@title: ${les.title}\n\n# ${les.title}\n\n${les.description}\n\n${les.outline}`
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
    }

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
    }
    
    applyBlueprintToTree(treeId, schema) {
        const treeEntry = this.state.localTrees.find(t => t.id === treeId);
        if (!treeEntry) return false;

        const id = treeEntry.id; 
        const rootId = `${id}-en-root`;
        
        // Find Root Node
        const langData = treeEntry.data.languages['EN'] || Object.values(treeEntry.data.languages)[0];
        if (!langData) return false;

        // Generate Nodes from Schema
        const children = [];
        if (schema.modules) {
            schema.modules.forEach((mod, mIdx) => {
                const modId = `${id}-mod-${Date.now()}-${mIdx}`;
                const modPath = `${treeEntry.name} / ${mod.title}`;
                
                const modNode = {
                    id: modId, 
                    parentId: rootId, 
                    name: mod.title, 
                    type: "branch", 
                    icon: "📁",
                    description: mod.description || "", 
                    path: modPath, 
                    order: String(mIdx + 1), 
                    expanded: false, 
                    children: []
                };

                if (mod.lessons) {
                    mod.lessons.forEach((les, lIdx) => {
                        const lesId = `${id}-les-${Date.now()}-${mIdx}-${lIdx}`;
                        const lesNode = {
                            id: lesId, 
                            parentId: modId, 
                            name: les.title, 
                            type: "leaf", 
                            icon: "📄",
                            path: `${modPath} / ${les.title}`, 
                            order: String(lIdx + 1), 
                            description: les.description || "",
                            content: `@title: ${les.title}\n\n# ${les.title}\n\n${les.description}\n\n${les.outline || "Content pending..."}`
                        };
                        modNode.children.push(lesNode);
                    });
                }
                children.push(modNode);
            });
        }

        // Replace children
        langData.children = children;
        
        treeEntry.updated = Date.now();
        this.persist();
        return true;
    }
    
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
        this.persist();
        if (jsonData.searchIndex && typeof jsonData.searchIndex === 'object') {
            import('../utils/search-index-service.js').then((m) =>
                m.hydrateSearchIndexFromArchive(id, jsonData.searchIndex)
            );
        }
        return newTree;
    }
    
    /**
     * Serializes a local garden to `.arborito` JSON (curriculum only; no embedded index or forum).
     * Adds `files`: INTRO.md / README.md / EXPORT-GUIDE.txt when appropriate.
     * @param {string} id
     * @param {string} name
     * @param {object} treeData — already synced (e.g. readme from universePresentation)
     */
    serializeArboritoArchive(id, name, treeData) {
        const md = readmeAsString(treeData).trim();
        const archive = {
            magic: 'ARBORITO_ARCHIVE',
            version: 1,
            meta: {
                id,
                name,
                exportedAt: new Date().toISOString()
            },
            tree: treeData
        };
        const ui = typeof this.getUi === 'function' ? this.getUi() : null;
        const guideTxt =
            ui && typeof ui.exportArchiveGuideTxt === 'string' && ui.exportArchiveGuideTxt.trim()
                ? ui.exportArchiveGuideTxt.trim()
                : [
                      'Arborito .arborito export',
                      '',
                      'This archive is JSON (pretty-printed). Open it in any text editor.',
                      '',
                      'Structure:',
                      '- magic / version: format id.',
                      '- meta: export time and garden name.',
                      '- tree: curriculum; lesson bodies are Markdown in each leaf node "content". Optional saved versions may appear under tree.releaseSnapshots if you included them when exporting.',
                      '- files (optional): INTRO.md and README.md mirror the course intro; EXPORT-GUIDE.txt is this note.',
                      '',
                      'Search index is not included; it rebuilds after import. Forum data is not included.',
                      '',
                      'Import: Arborito → Trees → Import (.arborito).'
                  ].join('\n');
        const files = { 'EXPORT-GUIDE.txt': guideTxt };
        if (md) {
            files['INTRO.md'] = md;
            files['README.md'] = md;
        }
        archive.files = files;
        return JSON.stringify(archive, null, 2);
    }

    deleteLocalTree(id) {
        this.state.localTrees = this.state.localTrees.filter((t) => t.id !== id);
        this.persist();
        import('../utils/search-index-service.js').then((m) => m.clearSearchIndexForTreeId(id)).catch(() => {});
        import('../utils/lesson-content-cache.js').then((m) => m.clearLessonCacheForSource(id)).catch(() => {});
    }

    /**
     * After publishing a local garden to Nostr, the active source may stay `local://…`;
     * we keep the public tree URL on the tree entry for governance copy and hints.
     */
    setLocalTreePublishedNetworkUrl(treeId, treeUrl) {
        const id = String(treeId || '').trim();
        const url = String(treeUrl || '').trim();
        if (!id || !url) return false;
        const treeEntry = this.state.localTrees.find((t) => t.id === id);
        if (!treeEntry) return false;
        treeEntry.publishedNetworkUrl = url;
        treeEntry.publishedAt = Date.now();
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    }

    getLocalTreePublishedNetworkUrl(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return null;
        const treeEntry = this.state.localTrees.find((t) => t.id === id);
        const url = (treeEntry && treeEntry.publishedNetworkUrl) || null;
        return url ? String(url) : null;
    }

    clearLocalTreePublishedNetworkUrl(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const treeEntry = this.state.localTrees.find((t) => t.id === id);
        if (!treeEntry || !treeEntry.publishedNetworkUrl) return false;
        delete treeEntry.publishedNetworkUrl;
        delete treeEntry.publishedAt;
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    }

    setLocalTreePublishedSnapshot(treeId, treeData) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const treeEntry = this.state.localTrees.find((t) => t.id === id);
        if (!treeEntry) return false;
        try {
            treeEntry.publishedSnapshot = JSON.parse(JSON.stringify(treeData || null));
        } catch {
            treeEntry.publishedSnapshot = treeData || null;
        }
        treeEntry.publishedSnapshotHash = this.hashJson(treeEntry.publishedSnapshot);
        treeEntry.publishedSnapshotAt = Date.now();
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    }

    getLocalTreeData(id) {
        return (this.state.localTrees.find(t => t.id === id) ? this.state.localTrees.find(t => t.id === id).data : undefined);
    }

    updateLocalNode(treeId, nodeId, newContent, newMeta) {
        const treeEntry = this.state.localTrees.find(t => t.id === treeId);
        if (!treeEntry) return false;
        let found = false;
        const updateRecursive = (node) => {
            if (found) return; 
            if (node.id === nodeId) {
                if (newContent !== null) node.content = newContent;
                if (newMeta) {
                    if (newMeta.title) node.name = newMeta.title;
                    if (newMeta.icon) node.icon = newMeta.icon;
                    if (newMeta.description) node.description = newMeta.description;
                    if (newMeta.order) node.order = newMeta.order;
                }
                found = true;
                return;
            }
            if (node.children) for (const child of node.children) updateRecursive(child);
        };
        for (const langKey in treeEntry.data.languages) {
            updateRecursive(treeEntry.data.languages[langKey]);
            if(found) break;
        }
        if (found) {
            treeEntry.updated = Date.now();
            this.state.localTrees = [...this.state.localTrees]; 
            this.persist();
        }
        return found;
    }
    
    // RENAMING LOGIC (With Propagation)
    renameLocalNode(treeId, path, newName) {
        const treeEntry = this.state.localTrees.find(t => t.id === treeId);
        if (!treeEntry) return false;
        
        const pathParts = path.split('/');
        const oldName = pathParts.pop(); // Remove old name to get parent
        const parentPathStr = pathParts.join('/'); // Rebuild parent path (e.g. "My Tree / Module")
        
        let foundNode = null;
        
        const findNode = (node, currentPath) => {
            const myPath = currentPath ? `${currentPath}/${node.name}` : node.name;
            if (myPath === path) return node;
            if (node.children) {
                for(const c of node.children) {
                    const res = findNode(c, myPath);
                    if(res) return res;
                }
            }
            return null;
        };
        
        for (const langKey in treeEntry.data.languages) {
            foundNode = findNode(treeEntry.data.languages[langKey], '');
            if(foundNode) break;
        }
        
        if (!foundNode) return false;
        
        foundNode.name = newName;
        
        const updatePaths = (node, currentPath) => {
            const newPath = currentPath ? `${currentPath} / ${node.name}` : node.name;
            node.path = newPath;
            if (node.children) {
                node.children.forEach(child => updatePaths(child, newPath));
            }
        };
        
        for (const langKey in treeEntry.data.languages) {
            updatePaths(treeEntry.data.languages[langKey]);
        }
        
        treeEntry.updated = Date.now();
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    }

    deleteLocalNodeByPath(treeId, pathName) {
        const treeEntry = this.state.localTrees.find(t => t.id === treeId);
        if (!treeEntry) return false;
        const names = pathName.split('/');
        const targetName = names[names.length - 1];
        let deleted = false;
        const traverseAndDelete = (node) => {
            if (deleted) return;
            if (node.children) {
                const idx = node.children.findIndex(c => c.name === targetName); // Simple Name Match
                if (idx !== -1) {
                    node.children.splice(idx, 1);
                    deleted = true;
                    return;
                }
                node.children.forEach(traverseAndDelete);
            }
        };
        for (const langKey in treeEntry.data.languages) {
            traverseAndDelete(treeEntry.data.languages[langKey]);
        }
        if (deleted) {
            treeEntry.updated = Date.now();
            this.state.localTrees = [...this.state.localTrees]; 
            this.persist();
        }
        return deleted;
    }
    
    /**
     * @param {string} treeId
     * @param {string} parentPath
     * @param {string} name
     * @param {'folder'|'file'} type
     * @param {string | null | undefined} [parentId] — when set, insert under that node (avoids name-collision in tree).
     */
    createLocalNode(treeId, parentPath, name, type, parentId = null) {
        const treeEntry = this.state.localTrees.find(t => t.id === treeId);
        if (!treeEntry) return false;
        const pathSegs = String(parentPath || '')
            .split('/')
            .map((s) => s.trim())
            .filter(Boolean);
        const parentName = pathSegs.length ? pathSegs[pathSegs.length - 1] : '';
        const ui = this.getUi();
        let created = false;
        const traverseAndAdd = (node) => {
            if (created) return;
            const matchParent =
                parentId != null && parentId !== ''
                    ? String(node.id) === String(parentId)
                    : node.name === parentName;
            if (matchParent) {
                // Date-based ids can collide when creating multiple nodes quickly (same ms),
                // which breaks deep nesting (findNode/path/materialization). Use a UUID instead.
                const newId = `local-${randomUUIDSafe()}`;
                const newNode = {
                    id: newId, parentId: node.id, name: name,
                    type: type === 'folder' ? 'branch' : 'leaf',
                    icon: type === 'folder' ? '📁' : '📄',
                    path: `${node.path} / ${name}`, order: "99",
                    children: type === 'folder' ? [] : undefined,
                    content: type === 'folder' ? undefined : buildDefaultLessonMarkdown(ui)
                };
                if (!node.children) node.children = [];
                node.children.push(newNode);
                created = true;
                return;
            }
            if (node.children) node.children.forEach(traverseAndAdd);
        };
        for (const langKey in treeEntry.data.languages) {
            traverseAndAdd(treeEntry.data.languages[langKey]);
        }
        if (created) {
            treeEntry.updated = Date.now();
            this.state.localTrees = [...this.state.localTrees]; 
            this.persist();
        }
        return created;
    }

    /**
     * Archived curriculum snapshot keyed by version label (e.g. copy when creating a release).
     * @param {string} treeId
     * @param {string} versionId
     * @param {object} snapshot — typically `treeEntry.data` or raw clone without `releaseSnapshots`
     */
    saveReleaseSnapshotForVersion(treeId, versionId, snapshot) {
        const treeEntry = this.state.localTrees.find((t) => t.id === treeId);
        if (!treeEntry || !snapshot || !String(versionId || '').trim()) return false;
        if (!treeEntry.releaseSnapshots) treeEntry.releaseSnapshots = {};
        treeEntry.releaseSnapshots[String(versionId)] = JSON.parse(JSON.stringify(snapshot));
        treeEntry.updated = Date.now();
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    }

    // --- Bookmarks, Gamification, etc ---
    computeHash(str) {
        if (!str) return "0";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(16);
    }

    hashJson(obj) {
        try {
            return this.computeHash(JSON.stringify(obj || null));
        } catch {
            return this.computeHash(String(Date.now()));
        }
    }
    loadBookmarks() {
        try {
            const saved = localStorage.getItem('arborito-bookmarks');
            if (saved) this.state.bookmarks = JSON.parse(saved);
        } catch (e) {}
    }
    saveBookmark(nodeId, contentRaw, index, visitedSet) {
        if (!nodeId || !contentRaw) return;
        const currentHash = this.computeHash(contentRaw);
        const keys = Object.keys(this.state.bookmarks);
        if (keys.length >= MAX_BOOKMARKS && !this.state.bookmarks[nodeId]) {
            let oldestKey = null; let oldestTime = Infinity;
            keys.forEach(k => {
                const ts = this.state.bookmarks[k].timestamp || 0;
                if (ts < oldestTime) { oldestTime = ts; oldestKey = k; }
            });
            if (oldestKey) delete this.state.bookmarks[oldestKey];
        }
        this.state.bookmarks[nodeId] = { hash: currentHash, index: index || 0, visited: Array.from(visitedSet || []), timestamp: Date.now() };
        localStorage.setItem('arborito-bookmarks', JSON.stringify(this.state.bookmarks));
        this.persist();
    }
    removeBookmark(nodeId) {
        if (!nodeId) return;
        if (this.state.bookmarks[nodeId]) {
            delete this.state.bookmarks[nodeId];
            localStorage.setItem('arborito-bookmarks', JSON.stringify(this.state.bookmarks));
            this.persist();
        }
    }
    getBookmark(nodeId, contentRaw) {
        if (!nodeId) return null;
        const bookmark = this.state.bookmarks[nodeId];
        if (!bookmark) return null;
        if (contentRaw) {
            const currentHash = this.computeHash(contentRaw);
            if (bookmark.hash !== currentHash) {
                delete this.state.bookmarks[nodeId];
                localStorage.setItem('arborito-bookmarks', JSON.stringify(this.state.bookmarks));
                return null;
            }
        }
        return bookmark;
    }
    getRecentBookmarks() {
        const entries = Object.entries(this.state.bookmarks);
        entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
        return entries.map(([id, data]) => ({ id, ...data }));
    }
    checkStreak() {
        const today = new Date().toISOString().slice(0, 10);
        const { lastLoginDate, streak } = this.state.gamification;
        let result = null;
        if (lastLoginDate === today) {} 
        else if (lastLoginDate) {
            const last = new Date(lastLoginDate);
            const now = new Date(today);
            const diffTime = Math.abs(now - last);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            if (diffDays === 1) {
                this.updateGamification({ streak: streak + 1, lastLoginDate: today, dailyXP: 0 });
                result = this.getUi().streakKept;
            } else {
                this.updateGamification({ streak: 1, lastLoginDate: today, dailyXP: 0 });
            }
        } else {
            this.updateGamification({ streak: 1, lastLoginDate: today });
        }
        return result;
    }
    addXP(amount) {
        const { gamification } = this.state;
        const newDaily = gamification.dailyXP + amount;
        const newTotal = gamification.xp + amount;
        let msg = `+${amount} ${this.getUi().xpUnit}`;
        if (gamification.dailyXP < this.dailyXpGoal && newDaily >= this.dailyXpGoal) msg = this.getUi().goalReached + " ☀️";
        this.updateGamification({ xp: newTotal, dailyXP: newDaily });
        return msg;
    }
    harvestSeed(moduleId) {
        const { gamification } = this.state;
        if (gamification.seeds.find(f => f.id === moduleId)) return null;
        const charSum = moduleId.split('').reduce((a,b) => a + b.charCodeAt(0), 0);
        const seedIcon = SEED_TYPES[charSum % SEED_TYPES.length];
        const newSeed = { id: moduleId, icon: seedIcon, date: Date.now() };
        this.updateGamification({ seeds: [...gamification.seeds, newSeed] });
        return `${this.getUi().seedCollected} ${seedIcon}`;
    }
    updateGamification(updates) {
        this.state.gamification = { ...this.state.gamification, ...updates };
        this.persist();
    }
    markComplete(nodeId, forceState = null) {
        let isComplete = this.state.completedNodes.has(nodeId);
        let shouldAdd = forceState !== null ? forceState : !isComplete;
        let xpMsg = null;
        if (shouldAdd) {
             if (!isComplete) {
                 this.state.completedNodes.add(nodeId);
                 xpMsg = this.addXP(10);
                 
                 // Memory Core Integration: Initialize SRS
                 // If never reviewed, start the forgetting curve now.
                 if (!this.state.memory[nodeId]) {
                     this.reportMemory(nodeId, 4); // Default "Good" rating for first completion
                 }
             }
        } else {
             this.state.completedNodes.delete(nodeId);
        }
        this.persist();
        return xpMsg;
    }
    isCompleted(id) { return this.state.completedNodes.has(id); }
    saveGameData(gameId, key, value) {
        if (!this.state.gameData[gameId]) this.state.gameData[gameId] = {};
        this.state.gameData[gameId][key] = value;
        this.persist();
    }
    loadGameData(gameId, key) { return (this.state.gameData[gameId] ? this.state.gameData[gameId][key] : undefined) || null; }
    addGame(name, url, icon) {
        const newGame = { id: randomUUIDSafe(), name, url, icon: icon || '🎮' };
        this.state.installedGames = [...this.state.installedGames, newGame];
        this.persist();
    }
    removeGame(id) {
        this.state.installedGames = this.state.installedGames.filter(g => g.id !== id);
        this.persist();
    }
    addGameRepo(url) {
        const u = String(url || '').trim();
        if (!u) return;
        if (u === DEFAULT_ARCADE_GAME_CATALOG.url) return;
        let name = "Custom Repository";
        try { name = new URL(u).hostname; } catch(e){}
        const newRepo = { id: randomUUIDSafe(), name, url: u, isOfficial: false };
        this.state.gameRepos.push(newRepo);
        this.persist();
    }
    removeGameRepo(id) {
        if (id === DEFAULT_ARCADE_GAME_CATALOG.id) return;
        this.state.gameRepos = this.state.gameRepos.filter(r => r.id !== id);
        this.persist();
    }
}