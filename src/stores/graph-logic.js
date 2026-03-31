
import { TreeUtils } from '../utils/tree-utils.js';
import { fileSystem } from '../services/filesystem.js';
import { DataProcessor } from '../utils/data-processor.js';
import { schedulePersistTreeUiState } from '../utils/tree-ui-persist.js';

export class GraphLogic {
    constructor(store) {
        this.store = store;
    }

    findNode(id) { 
        return TreeUtils.findNode(id, this.store.state.data); 
    }

    _namesRoughlyEqual(a, b) {
        const na = TreeUtils.cleanString(String(a ?? ''));
        const nb = TreeUtils.cleanString(String(b ?? ''));
        return na.length > 0 && na === nb;
    }

    /**
     * Índice de búsqueda referencia nodos que aún no están en memoria (árbol perezoso).
     * El campo `path` del shard coincide con `node.path` en los JSON cargados.
     */
    async _materializeNodeByBreadcrumb(nodeId, pathStr) {
        const root = this.store.state.data;
        if (!root || !pathStr || typeof pathStr !== 'string') return;
        const parts = pathStr.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
        if (parts.length < 2) return;

        let cur = root;
        for (let pi = 1; pi < parts.length; pi++) {
            if (String(cur.id) === String(nodeId)) return;
            if (cur.hasUnloadedChildren) await this.loadNodeChildren(cur);
            const acc = parts.slice(0, pi + 1).join(' / ');
            const kids = cur.children || [];
            const wantName = parts[pi];
            const next =
                kids.find((ch) => ch.path && ch.path === acc) ||
                kids.find((ch) => String(ch.name).trim() === wantName) ||
                kids.find((ch) => this._namesRoughlyEqual(ch.name, wantName));
            if (!next) {
                if (TreeUtils.findNode(nodeId, cur)) return;
                return;
            }
            cur = next;
        }
        if (String(cur.id) === String(nodeId)) return;
        if (cur.hasUnloadedChildren) await this.loadNodeChildren(cur);
    }

    /** Reserva: ramas con `leafIds` que incluyen el id objetivo. */
    async _materializeByLeafIdIndex(nodeId) {
        const want = String(nodeId);
        const walk = async (node) => {
            if (String(node.id) === want) return true;
            const lids = node.leafIds;
            const mightHold = lids && lids.some((id) => String(id) === want);
            if (node.hasUnloadedChildren && mightHold) {
                await this.loadNodeChildren(node);
                if (this.findNode(nodeId)) return true;
                for (const c of node.children || []) {
                    if (await walk(c)) return true;
                }
                return false;
            }
            if (node.children) {
                for (const c of node.children) {
                    if (await walk(c)) return true;
                }
            }
            return false;
        };
        await walk(this.store.state.data);
    }

    /**
     * Camino root → nodo por recorrido en árbol. Necesario cuando los hijos del JSON inicial
     * no tienen `parentId` (solo se asigna al cargar hijos vía API en `loadNodeChildren`).
     */
    _chainFromRootToTarget(root, targetId) {
        if (!root || targetId === undefined || targetId === null) return null;
        const want = String(targetId);
        let found = null;
        const walk = (node, prefix) => {
            const chain = prefix.concat(node);
            if (String(node.id) === want) {
                found = chain;
                return true;
            }
            const kids = node.children;
            if (!kids || kids.length === 0) return false;
            for (let i = 0; i < kids.length; i++) {
                if (walk(kids[i], chain)) return true;
            }
            return false;
        };
        walk(root, []);
        return found;
    }
    
    async navigateTo(nodeId, nodeData = null) {
        let target = this.findNode(nodeId);
        if (!target) {
            const hint = nodeData && (nodeData.path || nodeData.p);
            if (hint) await this._materializeNodeByBreadcrumb(nodeId, hint);
            target = this.findNode(nodeId);
        }
        if (!target) {
            await this._materializeByLeafIdIndex(nodeId);
            target = this.findNode(nodeId);
        }
        if (!target) return;

        let chain = [];
        let cur = target;
        while (cur) {
            chain.unshift(cur);
            cur = cur.parentId ? this.findNode(cur.parentId) : null;
        }

        const root = this.store.state.data;
        if (!root) return;

        if (chain.length === 0 || String(chain[0].id) !== String(root.id)) {
            const walked = this._chainFromRootToTarget(root, target.id);
            if (walked && walked.length > 0) {
                chain = walked;
            }
        }

        if (chain.length === 0 || String(chain[0].id) !== String(root.id)) {
            return;
        }

        for (let i = 0; i < chain.length; i++) {
            const n = chain[i];
            if (n.hasUnloadedChildren) await this.loadNodeChildren(n);
            if (n.type === 'branch' || n.type === 'root') {
                n.expanded = true;
            }
            if (i < chain.length - 1) {
                const nextInChain = chain[i + 1];
                if (n.children) {
                    n.children.forEach((sibling) => {
                        if (String(sibling.id) !== String(nextInChain.id) && sibling.expanded) {
                            this.collapseRecursively(sibling);
                        }
                    });
                }
            }
        }

        const pathIds = chain.map((n) => n.id);
        let mobileIds =
            target.type === 'leaf' || target.type === 'exam' ? pathIds.slice(0, -1) : pathIds;
        // `slice(0, -1)` con un solo nodo (p. ej. árbol mínimo) deja [] y el listener ignoraba el evento.
        if (mobileIds.length === 0 && root) {
            mobileIds = [root.id];
        }
        this.store.dispatchEvent(new CustomEvent('arborito-set-mobile-path', { detail: { ids: mobileIds } }));

        if (target.type === 'leaf' || target.type === 'exam') {
            if (!target.content && target.contentPath) await this.loadNodeContent(target);
            this.store.update({ selectedNode: target, previewNode: null, modal: null });
        } else {
            this.store.update({ path: chain });
            target.expanded = true;
        }

        this.store.dispatchEvent(new CustomEvent('graph-update'));
        schedulePersistTreeUiState(this.store);
        setTimeout(() => {
            this.store.dispatchEvent(new CustomEvent('focus-node', { detail: nodeId }));
        }, 100);
    }

    async navigateToNextLeaf() {
        if (!this.store.state.selectedNode || !this.store.state.data) return;
        const leaves = [];
        const traverse = (node) => {
            if (node.type === 'leaf' || node.type === 'exam') leaves.push(node);
            if (node.children) node.children.forEach(traverse);
        };
        traverse(this.store.state.data);
        const currentIndex = leaves.findIndex(n => n.id === this.store.state.selectedNode.id);
        if (currentIndex !== -1 && currentIndex < leaves.length - 1) {
            const nextNode = leaves[currentIndex + 1];
            if (!nextNode.content && nextNode.contentPath) await this.loadNodeContent(nextNode);
            await this.navigateTo(nextNode.id, nextNode);
            this.store.update({ selectedNode: nextNode, previewNode: null });
        } else {
            this.store.closeContent();
        }
    }

    async toggleNode(nodeId) {
        const node = this.findNode(nodeId);
        if (!node) return;
        
        try {
            let path = [];
            let curr = node;
            while(curr) {
                path.unshift(curr);
                curr = curr.parentId ? this.findNode(curr.parentId) : null;
            }
            this.store.update({ path });

            if (!node.expanded) {
                if (node.parentId) {
                    const parent = this.findNode(node.parentId);
                    if (parent && parent.children) {
                        parent.children.forEach(sibling => {
                            if (sibling.id !== nodeId && sibling.expanded) this.collapseRecursively(sibling);
                        });
                    }
                }
            }

            if (node.type === 'leaf' || node.type === 'exam') {
                this.store.update({ previewNode: node, selectedNode: null });
            } else {
                this.store.update({ selectedNode: null, previewNode: null });
                if (!node.expanded) {
                    if (node.hasUnloadedChildren) await this.loadNodeChildren(node);
                    if (!node.children || node.children.length === 0) {
                        node.isEmpty = true; // Mark as empty state
                        this.store.setModal({ type: 'emptyModule', node: node });
                    }
                    node.expanded = true;
                } else {
                    this.collapseRecursively(node);
                }
            }
            this.store.dispatchEvent(new CustomEvent('graph-update'));
            schedulePersistTreeUiState(this.store);

        } catch (e) {
            console.error(e);
            this.store.update({ lastErrorMessage: "Error interacting with node: " + e.message });
            setTimeout(() => this.store.update({ lastErrorMessage: null }), 5000);
        }
    }

    collapseRecursively(node) {
        node.expanded = false;
        if (node.children) node.children.forEach(c => this.collapseRecursively(c));
    }

    /**
     * @param {{ silent?: boolean }} [opts] — silent: no modal for empty branch (e.g. background prefetch).
     */
    async loadNodeChildren(node, opts = {}) {
        if (!node.apiPath) return;
        node.status = 'loading';
        this.store.dispatchEvent(new CustomEvent('graph-update'));
        
        try {
            const sourceUrl = this.store.state.activeSource.url;
            const baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
            const url = `${baseDir}nodes/${node.apiPath}.json`;
            
            const res = await fetch(url);
            if (res.ok) {
                let text = await res.text();
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                const children = JSON.parse(text.trim());
                
                if (children.length === 0) {
                    node.children = [];
                    node.isEmpty = true; // Mark as empty state
                    if (!opts.silent) {
                        this.store.setModal({ type: 'emptyModule', node: node });
                    }
                } else {
                    children.forEach(child => child.parentId = node.id);
                    node.children = children;
                    const examPrefix = this.store.ui.examLabelPrefix || "Exam: ";
                    if (examPrefix) {
                        node.children.forEach(child => {
                            if (child.type === 'exam' && !child.name.startsWith(examPrefix)) child.name = examPrefix + child.name;
                        });
                    }
                }
                node.hasUnloadedChildren = false;
                
                // HYDRATION CHECK: Using the DataProcessor utility
                DataProcessor.hydrateCompletionState(this.store, node);
                
            } else {
                throw new Error(`Failed to load children: ${node.apiPath}.json`);
            }
        } catch(e) { 
            console.error(e);
            this.store.update({ lastErrorMessage: e.message });
        } finally {
            node.status = 'available';
            this.store.dispatchEvent(new CustomEvent('graph-update'));
        }
    }
    
    async loadNodeContent(node) {
        if (node.content) return;
        if (!node.contentPath) return; 
        
        this.store.update({ loading: true }); 
        
        try {
            const sourceUrl = this.store.state.activeSource.url;
            const baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
            const url = `${baseDir}content/${node.contentPath}`;
            
            const res = await fetch(url);
            if(res.ok) {
                const json = await res.json();
                node.content = json.content;
            } else {
                throw new Error(`Content missing for ${node.name}`);
            }
        } catch(e) {
            console.error("Content fetch failed", e);
            node.content = "Error loading content. Please check internet connection.";
        } finally {
            this.store.update({ loading: false });
        }
    }
    
    async moveNode(node, newParentId) {
        this.store.update({ loading: true });
        try {
            const newParent = this.findNode(newParentId);
            if(!newParent) throw new Error("Target parent not found");
            
            const oldPath = node.sourcePath;
            const parentPath = newParent.sourcePath;
            
            await fileSystem.moveNode(oldPath, parentPath);
            
            const source = this.store.state.activeSource;
            await this.store.loadData(source, false);
            
            this.store.notify(this.store.ui.nodeMoved || "Node moved successfully!");
            
        } catch(e) {
            console.error(e);
            this.store.update({ error: (this.store.ui.moveFailed || "Move failed: ") + e.message });
            setTimeout(() => this.store.update({ error: null }), 3000);
        } finally {
            this.store.update({ loading: false });
        }
    }
}
