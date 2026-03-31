


// BOTANICAL SEEDS: More universal concept for knowledge trees
const SEED_TYPES = ['🌲', '🌰', '🌾', '🍁', '🥥', '🥜', '🌰', '🫘', '🍄', '🌱'];

const MAX_BOOKMARKS = 50; 

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

    /** Compat: el store y la UI usan `userStore.settings.método()`; la lógica vive en esta clase. */
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
            this.state.gameRepos.unshift({
                id: 'official',
                name: 'Arborito Official',
                url: 'https://raw.githubusercontent.com/treesys-org/arborito-games/main/manifest.json',
                isOfficial: true
            });

        } catch(e) {}
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
            d: this.state.gameData, t: this.state.localTrees, m: this.state.memory 
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
        const id = 'local-' + crypto.randomUUID();
        const now = new Date().toISOString();
        const ui = this.getUi();
        const defaultName = ui.defaultGardenName || "My Private Garden";
        const lessonName = ui.defaultLessonName || "First Lesson";
        const lessonContent = ui.defaultLessonContent || "Your very first lesson.";
        const helloTitle = ui.defaultHello || "Hello World";

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
                        description: lessonContent,
                        content: `# ${helloTitle}\n\nClick Edit to change.`
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
        const id = 'local-' + crypto.randomUUID();
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
        const id = 'local-' + crypto.randomUUID();
        
        const newTree = { id, name: treeData.universeName, updated: Date.now(), data: treeData };
        this.state.localTrees.push(newTree);
        this.persist();
        return newTree;
    }
    
    // Export logic: creates .arborito archive
    getArboritoArchive(treeId) {
        const treeEntry = this.state.localTrees.find(t => t.id === treeId);
        if (!treeEntry) return null;
        
        // Create the standardized archive format
        const archive = {
            magic: "ARBORITO_ARCHIVE",
            version: 1,
            meta: {
                id: treeEntry.id,
                name: treeEntry.name,
                exportedAt: new Date().toISOString()
            },
            tree: treeEntry.data // This contains the full recursive structure including node content
        };
        
        return JSON.stringify(archive, null, 2);
    }

    deleteLocalTree(id) {
        this.state.localTrees = this.state.localTrees.filter(t => t.id !== id);
        this.persist();
    }

    getLocalTreeData(id) {
        return this.state.localTrees.find(t => t.id === id)?.data;
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
    
    createLocalNode(treeId, parentPath, name, type) {
        const treeEntry = this.state.localTrees.find(t => t.id === treeId);
        if (!treeEntry) return false;
        const parentName = parentPath.split('/').pop();
        const ui = this.getUi();
        let created = false;
        const traverseAndAdd = (node) => {
            if (created) return;
            if (node.name === parentName) {
                const newId = `local-${Date.now()}`;
                const defaultContent = ui.defaultLessonContent || "New content.";
                const defaultHello = ui.defaultHello || "New Lesson";
                
                const newNode = {
                    id: newId, parentId: node.id, name: name,
                    type: type === 'folder' ? 'branch' : 'leaf',
                    icon: type === 'folder' ? '📁' : '📄',
                    path: `${node.path} / ${name}`, order: "99",
                    children: type === 'folder' ? [] : undefined,
                    content: type === 'folder' ? undefined : `# ${name}\n\n${defaultContent}`
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
    loadGameData(gameId, key) { return this.state.gameData[gameId]?.[key] || null; }
    addGame(name, url, icon) {
        const newGame = { id: crypto.randomUUID(), name, url, icon: icon || '🎮' };
        this.state.installedGames = [...this.state.installedGames, newGame];
        this.persist();
    }
    removeGame(id) {
        this.state.installedGames = this.state.installedGames.filter(g => g.id !== id);
        this.persist();
    }
    addGameRepo(url) {
        let name = "Custom Repository";
        try { name = new URL(url).hostname; } catch(e){}
        const newRepo = { id: crypto.randomUUID(), name, url, isOfficial: false };
        this.state.gameRepos.push(newRepo);
        this.persist();
    }
    removeGameRepo(id) {
        this.state.gameRepos = this.state.gameRepos.filter(r => r.id !== id);
        this.persist();
    }
}