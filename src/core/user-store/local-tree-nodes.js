import { randomUUIDSafe } from '../../shared/lib/secure-web-crypto.js';
import { buildDefaultLessonMarkdown } from '../../features/learning/default-lesson-markdown.js';
import { buildDefaultExamMarkdown } from '../../features/learning/default-exam-markdown.js';

export const localTreeNodesMixin = {
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
                            content: `# ${les.title}\n\n${les.description}\n\n${les.outline || "Content pending..."}`
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
    },

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
    },

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
            
            let sp = node.sourcePath || '';
            if (sp.endsWith('/meta.json')) sp = sp.replace('/meta.json', '');
            if (sp === path || node.id === path || node.path === path) return node;
            
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
        
        let oldPrefix = '';
        if (foundNode.sourcePath) {
            let sp = foundNode.sourcePath;
            if (sp.endsWith('/meta.json')) sp = sp.replace('/meta.json', '');
            else if (sp.endsWith('.md')) sp = sp.replace('.md', '');
            oldPrefix = sp;
        }

        foundNode.name = newName;
        
        let newPrefix = '';
        if (oldPrefix) {
            const parts = oldPrefix.split('/');
            parts.pop();
            parts.push(newName);
            newPrefix = parts.join('/');
        }
        
        const updateSourcePaths = (n, currentPrefix) => {
             if (n.sourcePath) {
                 if (n.type === 'leaf') n.sourcePath = `${currentPrefix}.md`;
                 else if (n.sourcePath.endsWith('/meta.json')) n.sourcePath = `${currentPrefix}/meta.json`;
                 else n.sourcePath = currentPrefix;
             }
             if (n.children) {
                 n.children.forEach(c => updateSourcePaths(c, `${currentPrefix}/${c.name}`));
             }
        };
        
        if (newPrefix) {
             updateSourcePaths(foundNode, newPrefix);
        }
        
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
    },

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
    },

    /**
     * @param {string} treeId
     * @param {string} parentPath
     * @param {string} name
     * @param {'folder'|'file'|'exam'} type
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
                const isFolder = type === 'folder';
                const isExam = type === 'exam';
                const newNode = {
                    id: newId,
                    parentId: node.id,
                    name: name,
                    type: isFolder ? 'branch' : isExam ? 'exam' : 'leaf',
                    icon: isFolder ? '📁' : isExam ? '📝' : '📄',
                    path: `${node.path} / ${name}`,
                    order: '99',
                    children: isFolder ? [] : undefined,
                    content: isFolder ? undefined : isExam ? buildDefaultExamMarkdown(ui) : buildDefaultLessonMarkdown(ui)
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
    },

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
};
