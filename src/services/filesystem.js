


import { store } from "../store.js";
import { github } from "./github.js";
import { parseArboritoFile, reconstructArboritoFile, markdownToVisualHTML } from "../utils/editor-engine.js";

class FileSystemService {
    
    get activeSource() {
        return store.value.activeSource;
    }

    get isLocal() {
        const src = this.activeSource;
        return src && (src.type === 'local' || (src.url && src.url.startsWith('local://')));
    }

    get features() {
        if (this.isLocal) {
            return {
                canWrite: true,
                hasGovernance: false, 
                canDelete: true,
                canMove: true, 
                isRealtime: true 
            };
        } else {
            // GitHub
            return {
                canWrite: github.currentUser !== null, 
                hasGovernance: true,
                canDelete: github.currentUser !== null,
                canMove: github.currentUser !== null,
                isRealtime: false
            };
        }
    }

    // --- READ OPERATIONS ---

    async getFile(nodeId, sourcePath = null) {
        if (this.isLocal) {
            const node = store.findNode(nodeId);
            if (!node) {
                if (nodeId.startsWith('new-')) return { content: '', meta: {}, sha: null };
                throw new Error(store.ui.fileNotFound || "File not found in local garden.");
            }

            const rawContent = node.content || "";
            // Folder meta check
            if (node.type === 'branch' || node.type === 'root') {
                return {
                    content: JSON.stringify({
                        name: node.name,
                        icon: node.icon,
                        description: node.description,
                        order: node.order
                    }, null, 2),
                    sha: null,
                    isMeta: true
                };
            }

            const parsed = parseArboritoFile(rawContent);
            const meta = {
                title: node.name,
                icon: node.icon,
                description: node.description,
                order: node.order,
                ...parsed.meta
            };

            return { content: rawContent, meta, body: parsed.body, sha: null, isMeta: false };
        } else {
            // GitHub Mode
            if (!sourcePath) throw new Error("Source path required for GitHub");
            
            const isMeta = sourcePath.endsWith('meta.json');
            const { content, sha } = await github.getFileContent(sourcePath);
            
            if (isMeta) {
                return { content, sha, isMeta: true, meta: JSON.parse(content), body: '' };
            } else {
                const parsed = parseArboritoFile(content);
                return { content, sha, isMeta: false, meta: parsed.meta, body: parsed.body };
            }
        }
    }

    async getTree(path = 'content') {
        if (this.isLocal) {
            const treeId = this.activeSource.id;
            const treeData = store.userStore.getLocalTreeData(treeId);
            if (!treeData) return [];

            const flatList = [];
            const traverse = (node, currentPath) => {
                const myPath = currentPath ? `${currentPath}/${node.name}` : node.name;
                flatList.push({
                    path: myPath,
                    type: (node.type === 'branch' || node.type === 'root') ? 'tree' : 'blob',
                    sha: null,
                    id: node.id 
                });
                if (node.children) node.children.forEach(child => traverse(child, myPath));
            };
            Object.values(treeData.languages).forEach(root => traverse(root, ''));
            return flatList;
        } else {
            return await github.getRecursiveTree(path);
        }
    }

    // --- WRITE OPERATIONS ---

    async saveFile(node, content, meta, commitMsg) {
        if (this.isLocal) {
            const treeId = this.activeSource.id;
            const success = store.userStore.updateLocalNode(treeId, node.id, content, meta);
            
            if (success) {
                const updatedSource = store.userStore.getLocalTreeData(treeId);
                store.processLoadedData(updatedSource);
                return { success: true, mode: 'instant' };
            } else {
                throw new Error(store.ui.saveFailedLocal || "Local save failed. Node not found.");
            }
        } else {
            // GitHub
            if (!github.canEdit(node.sourcePath)) return { success: false, mode: 'forbidden' };
            const sha = node.sha || null;
            if (github.isAdmin() || github.canEdit(node.sourcePath)) {
                await github.commitFile(node.sourcePath, content, commitMsg, sha);
                return { success: true, mode: 'commit' };
            } else {
                const prUrl = await github.createPullRequest(node.sourcePath, content, commitMsg);
                return { success: true, mode: 'pr', url: prUrl };
            }
        }
    }

    async createNode(parentPath, name, type) {
        if (this.isLocal) {
            const treeId = this.activeSource.id;
            
            // Logic to calculate proper sourcePath for local nodes so Editor works
            const treeEntry = store.userStore.state.localTrees.find(t => t.id === treeId);
            if(treeEntry) {
                // Find parent node first to get its real path
                const parentName = parentPath.split('/').pop();
                const findNode = (n) => {
                    if(n.name === parentName || n.path === parentPath || n.sourcePath === parentPath) return n;
                    if(n.children) {
                        for(let c of n.children) {
                            let found = findNode(c);
                            if(found) return found;
                        }
                    }
                    return null;
                };
                
                let parentNode = null;
                for (const langKey in treeEntry.data.languages) {
                    parentNode = findNode(treeEntry.data.languages[langKey]);
                    if(parentNode) break;
                }
                
                if(parentNode) {
                    // Reconstruct sourcePath for the new child
                    let basePath = parentNode.sourcePath || parentNode.path;
                    if(basePath && basePath.endsWith('/meta.json')) basePath = basePath.replace('/meta.json', '');
                    
                    const newSourcePath = basePath ? `${basePath}/${name}` + (type === 'folder' ? '/meta.json' : '.md') : `${name}.md`;
                    
                    // Actually create logic (UserStore method doesn't accept extra props yet easily, 
                    // but createLocalNode is in UserStore. Wait, I am in FileSystem calling store.userStore.createLocalNode)
                    
                    store.userStore.createLocalNode(treeId, parentPath, name, type);
                    
                    // Now find the newly created node and patch its sourcePath
                    // We reload data to get fresh state, find the node, patch it.
                    const updatedSource = store.userStore.getLocalTreeData(treeId);
                    
                    // Find the child
                    const findNewChild = (n) => {
                        if(n.name === name && n.parentId === parentNode.id) return n;
                        if(n.children) {
                            for(let c of n.children) {
                                let found = findNewChild(c);
                                if(found) return found;
                            }
                        }
                        return null;
                    };
                    
                    let newChild = null;
                    for (const langKey in updatedSource.languages) {
                        newChild = findNewChild(updatedSource.languages[langKey]);
                        if(newChild) break;
                    }
                    
                    if(newChild) {
                        newChild.sourcePath = newSourcePath;
                        store.userStore.persist(); // Save the patch
                    }
                    
                    store.processLoadedData(updatedSource);
                    return true;
                }
            }
            
            // Fallback if complicated logic fails
            store.userStore.createLocalNode(treeId, parentPath, name, type);
            const updatedSource = store.userStore.getLocalTreeData(treeId);
            store.processLoadedData(updatedSource);
            return true;
        } else {
            // GitHub
            const fullPath = type === 'folder' ? `${parentPath}/${name}/meta.json` : `${parentPath}/${name}`;
            const initialContent = type === 'folder' 
                ? JSON.stringify({ name: name, icon: "📁", order: "99" }, null, 2)
                : `@title: ${store.ui.defaultLessonName || "New Lesson"}\n@icon: 📄\n\n# ${store.ui.defaultLessonName || "New Lesson"}`;
                
            await github.createOrUpdateFileContents(fullPath, initialContent, `feat: Create ${name}`);
            return true;
        }
    }

    async deleteNode(path, type) {
        if (this.isLocal) {
            const treeId = this.activeSource.id;
            store.userStore.deleteLocalNodeByPath(treeId, path);
            const updatedSource = store.userStore.getLocalTreeData(treeId);
            store.processLoadedData(updatedSource);
            return true;
        } else {
            const { sha } = await github.getFileContent(path);
            await github.deleteFile(path, `chore: Delete ${path}`, sha);
            return true;
        }
    }

    async renameNode(oldPath, newName, type) {
        if (this.isLocal) {
            // Local Move (Updates paths recursively)
            const treeId = this.activeSource.id;
            // Get current name to check what changed
            const parts = oldPath.split('/');
            const oldName = parts.pop();
            
            // This requires a smart update in userStore that propagates PATH changes
            const success = store.userStore.renameLocalNode(treeId, oldPath, newName);
            if(success) {
                const updatedSource = store.userStore.getLocalTreeData(treeId);
                store.processLoadedData(updatedSource);
            }
            return success;
        } else {
            // GitHub Move
            // Calculate new path string
            const parts = oldPath.split('/');
            parts.pop(); // Remove old name
            const basePath = parts.join('/');
            const newPath = basePath ? `${basePath}/${newName}` : newName;
            
            await github.moveFile(oldPath, newPath, `chore: Rename ${oldPath} to ${newPath}`);
            return true;
        }
    }
    
    // NEW: Generic Move Node Logic (Drag & Drop)
    async moveNode(oldPath, newParentPath) {
        // Name logic
        const parts = oldPath.split('/');
        const name = parts[parts.length - 1];
        
        // Remove 'meta.json' if present for folder paths logic
        const cleanOldPath = oldPath.endsWith('/meta.json') ? oldPath.replace('/meta.json', '') : oldPath;
        const cleanParentPath = newParentPath.endsWith('/meta.json') ? newParentPath.replace('/meta.json', '') : newParentPath;
        
        // Final destination
        const newPath = `${cleanParentPath}/${name}`;
        
        if (cleanOldPath === newPath) return; // No change

        if (this.isLocal) {
            const treeId = this.activeSource.id;
            throw new Error(store.ui.moveFailed || "Local move not fully supported in this version.");
        } else {
            // GitHub
            await github.moveFile(cleanOldPath, newPath, `chore: Move ${name} to ${cleanParentPath}`);
            return true;
        }
    }
}

export const fileSystem = new FileSystemService();