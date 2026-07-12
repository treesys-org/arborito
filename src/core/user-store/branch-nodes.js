import { randomUUIDSafe } from '../../shared/lib/secure-web-crypto.js';
import { buildDefaultLessonMarkdown } from '../../features/learning/api/default-lesson-markdown.js';
import { buildDefaultExamMarkdown } from '../../features/learning/api/default-exam-markdown.js';
import { resolveMutableBranchCurriculum } from './branch-curriculum-target.js';

/** @param {string | null | undefined} id */
function stripComposedNodeId(id) {
    const s = String(id || '').trim();
    const sep = s.indexOf('::');
    if (sep < 0) return s;
    const tail = s.slice(sep + 2);
    return tail === 'wrapper' ? '' : tail;
}

/** @param {Record<string, unknown> | null | undefined} languages @param {(root: object) => void} visit */
function forEachLangRoot(languages, visit) {
    if (!languages || typeof languages !== 'object') return;
    for (const langKey of Object.keys(languages)) {
        const root = languages[langKey];
        if (root && typeof root === 'object') visit(root);
    }
}

export const branchNodesMixin = {
    applyBlueprintToBranch(treeId, schema) {
        const treeEntry = this.state.branches.find(t => t.id === treeId);
        if (!treeEntry) return false;

        const id = treeEntry.id; 
        const rootId = `${id}-en-root`;
        
        // Find Root Node
        const langData = treeEntry.data.languages['EN'] || Object.values(treeEntry.data.languages)[0];
        if (!langData) return false;

        // Generate Nodes from Schema
        const children = [];
        if (Array.isArray(schema.modules)) {
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

                if (Array.isArray(mod.lessons)) {
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
        this.markBranchDirty(treeId);
        this.persist();
        return true;
    },

    updateBranchNode(treeId, nodeId, newContent, newMeta) {
        const treeEntry = this.state.branches.find(t => t.id === treeId);
        if (!treeEntry) return false;
        const target = resolveMutableBranchCurriculum(treeEntry);
        if (!target?.languages) return false;
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
                    if ('isCertifiable' in newMeta) node.isCertifiable = !!newMeta.isCertifiable;
                }
                found = true;
                return;
            }
            if (node.children) for (const child of node.children) updateRecursive(child);
        };
        for (const langKey in target.languages) {
            updateRecursive(target.languages[langKey]);
            if(found) break;
        }
        if (found) {
            treeEntry.updated = Date.now();
            this.state.branches = [...this.state.branches]; 
            this.markBranchDirty(treeId);
            this.persist();
        }
        return found;
    },

    // RENAMING LOGIC (With Propagation)
    renameBranchNode(treeId, path, newName) {
        const treeEntry = this.state.branches.find(t => t.id === treeId);
        if (!treeEntry) return false;
        const target = resolveMutableBranchCurriculum(treeEntry);
        if (!target?.languages) return false;
        
        const pathParts = path.split('/');
        const oldName = pathParts.pop(); // Remove old name to get parent
        const parentPathStr = pathParts.join('/'); // Rebuild parent path (e.g. "My Tree / Module")
        
        let foundNode = null;
        
        const findNode = (node, currentPath) => {
            const myPath = currentPath ? `${currentPath}/${node.name}` : node.name;
            if (myPath === path) return node;
            
            let sp = node.sourcePath || '';
            if (sp.endsWith('/README.md')) sp = sp.replace('/README.md', '');
            if (sp === path || node.id === path || node.path === path) return node;
            
            if (node.children) {
                for(const c of node.children) {
                    const res = findNode(c, myPath);
                    if(res) return res;
                }
            }
            return null;
        };
        
        forEachLangRoot(target.languages, (root) => {
            if (foundNode) return;
            foundNode = findNode(root, '');
        });
        
        if (!foundNode) return false;
        
        let oldPrefix = '';
        if (foundNode.sourcePath) {
            let sp = foundNode.sourcePath;
            if (sp.endsWith('/README.md')) sp = sp.replace('/README.md', '');
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
                 else if (n.type === 'branch' || n.type === 'root') n.sourcePath = currentPrefix;
             }
             if (Array.isArray(n.children)) {
                 n.children.forEach((c) => updateSourcePaths(c, `${currentPrefix}/${c.name}`));
             }
        };
        
        if (newPrefix) {
             updateSourcePaths(foundNode, newPrefix);
        }
        
        const updatePaths = (node, currentPath) => {
            const newPath = currentPath ? `${currentPath} / ${node.name}` : node.name;
            node.path = newPath;
            if (Array.isArray(node.children)) {
                node.children.forEach((child) => updatePaths(child, newPath));
            }
        };

        forEachLangRoot(target.languages, (root) => updatePaths(root));
        
        treeEntry.updated = Date.now();
        this.state.branches = [...this.state.branches];
        this.markBranchDirty(treeId);
        this.persist();
        return true;
    },

    deleteBranchNodeById(treeId, nodeId) {
        const treeEntry = this.state.branches.find((t) => t.id === treeId);
        if (!treeEntry || nodeId == null || nodeId === '') return false;
        const target = resolveMutableBranchCurriculum(treeEntry);
        if (!target?.languages) return false;
        const wantId = String(nodeId);
        let deleted = false;
        const walk = (node) => {
            if (deleted || !Array.isArray(node?.children)) return false;
            const idx = node.children.findIndex((c) => String(c?.id) === wantId);
            if (idx !== -1) {
                node.children.splice(idx, 1);
                deleted = true;
                return true;
            }
            for (const child of node.children) {
                if (walk(child)) return true;
            }
            return false;
        };
        forEachLangRoot(target.languages, (root) => {
            if (deleted) return;
            if (String(root?.id) === wantId) return;
            walk(root);
        });
        if (deleted) {
            treeEntry.updated = Date.now();
            this.state.branches = [...this.state.branches];
            this.markBranchDirty(treeId);
            this.persist();
        }
        return deleted;
    },

    deleteBranchNodeByPath(treeId, pathName) {
        const treeEntry = this.state.branches.find(t => t.id === treeId);
        if (!treeEntry) return false;
        const target = resolveMutableBranchCurriculum(treeEntry);
        if (!target?.languages) return false;

        let foundNode = null;
        let parentNode = null;
        const path = String(pathName || '').trim();

        const findNodeAndParent = (node, parent, currentPath) => {
            if (foundNode) return true;
            const myPath = currentPath ? `${currentPath} / ${node.name}` : node.name;
            let sp = node.sourcePath || '';
            if (sp.endsWith('/README.md')) sp = sp.replace('/README.md', '');
            if (sp.endsWith('.md')) sp = sp.replace('.md', '');

            const pathMatch =
                myPath === path ||
                node.path === path ||
                sp === path ||
                String(node.id) === path;
            if (pathMatch) {
                foundNode = node;
                parentNode = parent;
                return true;
            }
            if (Array.isArray(node.children)) {
                for (const child of node.children) {
                    if (findNodeAndParent(child, node, myPath)) return true;
                }
            }
            return false;
        };

        forEachLangRoot(target.languages, (root) => {
            if (foundNode) return;
            findNodeAndParent(root, null, '');
        });

        if (!foundNode || !parentNode || !Array.isArray(parentNode.children)) return false;
        const idx = parentNode.children.findIndex((c) => c === foundNode || String(c?.id) === String(foundNode.id));
        if (idx === -1) return false;
        parentNode.children.splice(idx, 1);
        treeEntry.updated = Date.now();
        this.state.branches = [...this.state.branches];
        this.markBranchDirty(treeId);
        this.persist();
        return true;
    },

    /**
     * @param {string} treeId
     * @param {string} parentPath
     * @param {string} name
     * @param {'folder'|'file'|'exam'} type
     * @param {string | null | undefined} [parentId], when set, insert under that node (avoids name-collision in tree).
     */
    createBranchNode(treeId, parentPath, name, type, parentId = null) {
        const treeEntry = this.state.branches.find((t) => t.id === treeId);
        if (!treeEntry?.data) return false;
        const target = resolveMutableBranchCurriculum(treeEntry);
        if (!target?.languages) return false;
        const pathSegs = String(parentPath || '')
            .split('/')
            .map((s) => s.trim())
            .filter(Boolean);
        const parentName = pathSegs.length ? pathSegs[pathSegs.length - 1] : '';
        const ui = this.getUi();
        let created = false;
        const wantParentId =
            parentId != null && parentId !== '' ? String(parentId) : null;
        const nativeParentId = wantParentId ? stripComposedNodeId(wantParentId) : null;
        const traverseAndAdd = (node) => {
            if (created) return;
            const matchParent = wantParentId
                ? !!nativeParentId &&
                  (String(node.id) === nativeParentId || String(node.id) === wantParentId)
                : !parentName || node.name === parentName;
            if (matchParent) {
                // Date-based ids can collide when creating multiple nodes quickly (same ms),
                // which breaks deep nesting (findNode/path/materialization). Use a UUID instead.
                const newId = `branch-${randomUUIDSafe()}`;
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
                if (!Array.isArray(node.children)) node.children = [];
                node.children.push(newNode);
                created = true;
                return;
            }
            if (Array.isArray(node.children)) node.children.forEach(traverseAndAdd);
        };
        forEachLangRoot(target.languages, traverseAndAdd);
        if (created) {
            treeEntry.updated = Date.now();
            this.state.branches = [...this.state.branches]; 
            this.markBranchDirty(treeId);
            this.persist();
        }
        return created;
    },

    /**
     * Archived curriculum snapshot keyed by version label (e.g. copy when creating a release).
     * @param {string} treeId
     * @param {string} versionId
     * @param {object} snapshot, typically `treeEntry.data` or raw clone without `releaseSnapshots`
     */
    saveReleaseSnapshotForVersion(treeId, versionId, snapshot) {
        const treeEntry = this.state.branches.find((t) => t.id === treeId);
        if (!treeEntry || !snapshot || !String(versionId || '').trim()) return false;
        if (!treeEntry.releaseSnapshots) treeEntry.releaseSnapshots = {};
        treeEntry.releaseSnapshots[String(versionId)] = JSON.parse(JSON.stringify(snapshot));
        treeEntry.updated = Date.now();
        this.state.branches = [...this.state.branches];
        this.markBranchDirty(treeId);
        this.persist();
        return true;
    }
};
