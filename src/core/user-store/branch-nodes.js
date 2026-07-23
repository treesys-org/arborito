import { randomUUIDSafe } from '../../shared/lib/secure-web-crypto.js';
import { buildDefaultLessonMarkdown } from '../../features/learning/api/default-lesson-markdown.js';
import { buildDefaultExamMarkdown } from '../../features/learning/api/default-exam-markdown.js';
import { resolveMutableBranchCurriculum } from './branch-curriculum-target.js';
import { getArboritoStore } from '../store-singleton.js';
import { findNodeById } from '../../features/tree-graph/api/raw-graph-mutations.js';

/** Prefer main-store curriculum/UI lang — UserStore has no getCurrentContentLangKey. */
function preferredCurriculumLangKey(langKeys) {
    if (!langKeys?.length) return null;
    try {
        const main = getArboritoStore();
        if (main && typeof main.getCurrentContentLangKey === 'function') {
            const k = main.getCurrentContentLangKey();
            if (k && langKeys.includes(k)) return k;
        }
        const edit = main?.state?.curriculumEditLang;
        if (edit && langKeys.includes(edit)) return edit;
        const uiLang = main?.state?.lang;
        if (uiLang && langKeys.includes(uiLang)) return uiLang;
    } catch {
        /* ignore */
    }
    return langKeys[0];
}

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

/** Normalize curriculum paths for rename/delete lookup (sourcePath, display path, or id). */
function normalizeBranchLookupPath(s) {
    if (s == null || s === '') return '';
    let x = String(s).trim();
    if (x.endsWith('/README.md')) x = x.slice(0, -'/README.md'.length);
    else if (x.endsWith('.md')) x = x.slice(0, -'.md'.length);
    return x
        .replace(/\s*\/\s*/g, '/')
        .replace(/\/+/g, '/')
        .replace(/\/+$/, '')
        .toLowerCase();
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
        const langKeys = Object.keys(target.languages);
        if (!langKeys.length) return false;
        /* Content is per-language; prefer the curriculum edit / UI language from main store. */
        const preferred = preferredCurriculumLangKey(langKeys) || langKeys[0];
        const order =
            preferred && target.languages[preferred]
                ? [preferred, ...langKeys.filter((k) => k !== preferred)]
                : langKeys;
        let found = false;
        let contentLang = null;
        for (const lang of order) {
            const root = target.languages[lang];
            if (!root) continue;
            const hit = findNodeById(root, nodeId);
            if (!hit) continue;
            found = true;
            if (newContent !== null && contentLang == null) {
                hit.content = newContent;
                contentLang = lang;
            }
            if (newMeta) {
                /* Structural fields mirror across every language that has this id. */
                if (newMeta.title) hit.name = newMeta.title;
                if (newMeta.icon) hit.icon = newMeta.icon;
                if (newMeta.description != null) hit.description = newMeta.description;
                if (newMeta.order) hit.order = newMeta.order;
                if ('isCertifiable' in newMeta) hit.isCertifiable = !!newMeta.isCertifiable;
            }
        }
        if (found) {
            treeEntry.updated = Date.now();
            this.state.branches = [...this.state.branches];
            this.markBranchDirty(treeId);
            this.persist();
        }
        return found;
    },

    // RENAMING LOGIC (With Propagation across all languages by shared id)
    renameBranchNode(treeId, path, newName) {
        const treeEntry = this.state.branches.find(t => t.id === treeId);
        if (!treeEntry) return false;
        const target = resolveMutableBranchCurriculum(treeEntry);
        if (!target?.languages) return false;

        let foundId = null;
        const want = normalizeBranchLookupPath(path);

        const findNode = (node, currentPath) => {
            const myPath = currentPath ? `${currentPath}/${node.name}` : node.name;
            const candidates = [
                myPath,
                node.sourcePath || '',
                node.path || '',
                String(node.id || ''),
            ];
            if (want && candidates.some((c) => normalizeBranchLookupPath(c) === want)) return node;
            if (String(node.id) === String(path)) return node;

            if (node.children) {
                for (const c of node.children) {
                    const res = findNode(c, myPath);
                    if (res) return res;
                }
            }
            return null;
        };

        forEachLangRoot(target.languages, (root) => {
            if (foundId) return;
            const hit = findNode(root, '');
            if (hit?.id) foundId = hit.id;
        });

        if (!foundId) return false;

        let any = false;
        forEachLangRoot(target.languages, (root) => {
            const applyRename = (n) => {
                if (String(n.id) !== String(foundId)) {
                    if (Array.isArray(n.children)) n.children.forEach(applyRename);
                    return;
                }
                let oldPrefix = '';
                if (n.sourcePath) {
                    let sp = n.sourcePath;
                    if (sp.endsWith('/README.md')) sp = sp.replace('/README.md', '');
                    else if (sp.endsWith('.md')) sp = sp.replace('.md', '');
                    oldPrefix = sp;
                }
                n.name = newName;
                let newPrefix = '';
                if (oldPrefix) {
                    const parts = oldPrefix.split('/');
                    parts.pop();
                    parts.push(newName);
                    newPrefix = parts.join('/');
                }
                const updateSourcePaths = (node, currentPrefix) => {
                    if (node.sourcePath) {
                        if (node.type === 'leaf' || node.type === 'exam') node.sourcePath = `${currentPrefix}.md`;
                        else if (node.type === 'branch' || node.type === 'root') node.sourcePath = currentPrefix;
                    }
                    if (Array.isArray(node.children)) {
                        node.children.forEach((c) => updateSourcePaths(c, `${currentPrefix}/${c.name}`));
                    }
                };
                if (newPrefix) updateSourcePaths(n, newPrefix);
                any = true;
            };
            applyRename(root);
        });

        const updatePaths = (node, currentPath) => {
            const newPath = currentPath ? `${currentPath} / ${node.name}` : node.name;
            node.path = newPath;
            if (Array.isArray(node.children)) {
                node.children.forEach((child) => updatePaths(child, newPath));
            }
        };
        forEachLangRoot(target.languages, (root) => updatePaths(root));

        if (!any) return false;
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
        const wantId = stripComposedNodeId(nodeId) || String(nodeId);
        let deleted = false;
        const idMatches = (cid) => {
            const cur = String(cid || '');
            return cur === wantId || cur.endsWith(`::${wantId}`);
        };
        const walk = (node) => {
            if (!Array.isArray(node?.children)) return false;
            const idx = node.children.findIndex((c) => idMatches(c?.id));
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
        /* Remove from every language tree (shared ids). */
        forEachLangRoot(target.languages, (root) => {
            if (idMatches(root?.id)) return;
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

        let foundId = null;
        const path = String(pathName || '').trim();
        const want = normalizeBranchLookupPath(path);

        const findNodeId = (node, currentPath) => {
            if (foundId) return true;
            const myPath = currentPath ? `${currentPath}/${node.name}` : node.name;
            const candidates = [
                myPath,
                node.sourcePath || '',
                node.path || '',
                String(node.id || ''),
            ];
            const pathMatch =
                (want && candidates.some((c) => normalizeBranchLookupPath(c) === want)) ||
                String(node.id) === path;
            if (pathMatch) {
                foundId = node.id;
                return true;
            }
            if (Array.isArray(node.children)) {
                for (const child of node.children) {
                    if (findNodeId(child, myPath)) return true;
                }
            }
            return false;
        };

        forEachLangRoot(target.languages, (root) => {
            if (foundId) return;
            findNodeId(root, '');
        });

        if (!foundId) return false;
        return this.deleteBranchNodeById(treeId, foundId);
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
        const wantParentId =
            parentId != null && parentId !== '' ? String(parentId) : null;
        const nativeParentId = wantParentId ? stripComposedNodeId(wantParentId) : null;
        const newId = `branch-${randomUUIDSafe()}`;
        const isFolder = type === 'folder';
        const isExam = type === 'exam';
        let created = false;

        /* Resolve parent by id first (shared across langs). Name match only to discover that id. */
        let resolvedParentId = nativeParentId || wantParentId || null;
        if (resolvedParentId) {
            /* Leaf/exam cannot hold children — climb to folder/root. */
            let climbGuard = 0;
            while (resolvedParentId && climbGuard++ < 32) {
                let hit = null;
                forEachLangRoot(target.languages, (root) => {
                    if (hit) return;
                    hit = findNodeById(root, resolvedParentId);
                });
                if (!hit) break;
                if (hit.type === 'branch' || hit.type === 'root') break;
                if ((hit.type === 'leaf' || hit.type === 'exam') && hit.parentId) {
                    resolvedParentId = stripComposedNodeId(hit.parentId) || String(hit.parentId);
                    continue;
                }
                resolvedParentId = null;
                break;
            }
        }
        if (!resolvedParentId && parentName) {
            const langKeys = Object.keys(target.languages);
            const preferred = preferredCurriculumLangKey(langKeys) || langKeys[0];
            const roots = preferred
                ? [target.languages[preferred], ...langKeys.filter((k) => k !== preferred).map((k) => target.languages[k])]
                : langKeys.map((k) => target.languages[k]);
            const findByName = (node) => {
                if (!node) return null;
                if (node.name === parentName && (node.type === 'branch' || node.type === 'root')) {
                    return String(node.id);
                }
                for (const ch of node.children || []) {
                    const hit = findByName(ch);
                    if (hit) return hit;
                }
                return null;
            };
            for (const root of roots) {
                resolvedParentId = findByName(root);
                if (resolvedParentId) break;
            }
        }

        if (resolvedParentId) {
            const langKeys = Object.keys(target.languages);
            const present = langKeys.filter((lang) => {
                const parent = findNodeById(target.languages[lang], resolvedParentId);
                return parent && (parent.type === 'branch' || parent.type === 'root');
            });
            /* Allow create when at least one language has the folder (partial bilingual trees). */
            if (!present.length) return false;
        }

        const addUnder = (node) => {
            const matchParent = resolvedParentId
                ? String(node.id) === String(resolvedParentId)
                : !parentName;
            if (!matchParent) {
                if (Array.isArray(node.children)) node.children.forEach(addUnder);
                return;
            }
            const newNode = {
                id: newId,
                parentId: node.id,
                name: name,
                type: isFolder ? 'branch' : isExam ? 'exam' : 'leaf',
                icon: isFolder ? '📁' : isExam ? '📝' : '📄',
                path: `${node.path} / ${name}`,
                order: '99',
                children: isFolder ? [] : undefined,
                content: isFolder
                    ? undefined
                    : isExam
                      ? buildDefaultExamMarkdown(ui)
                      : buildDefaultLessonMarkdown(ui)
            };
            /* Prefer filesystem-style parent path; never copy spaced display paths. */
            let parentFs = String(node.sourcePath || '').trim();
            if (parentFs.endsWith('/README.md')) parentFs = parentFs.slice(0, -'/README.md'.length);
            else if (parentFs.endsWith('.md')) {
                const i = parentFs.lastIndexOf('/');
                parentFs = i >= 0 ? parentFs.slice(0, i) : '';
            }
            if (!parentFs && parentPath && !String(parentPath).includes(' / ')) {
                parentFs = String(parentPath)
                    .replace(/\/README\.md$/i, '')
                    .replace(/\/+$/, '');
            }
            if (parentFs) {
                newNode.sourcePath = isFolder ? `${parentFs}/${name}` : `${parentFs}/${name}.md`;
            }
            if (!Array.isArray(node.children)) node.children = [];
            node.children.push(newNode);
            created = true;
        };

        /* Same id in every language so structure stays bilingual-ready. */
        forEachLangRoot(target.languages, (root) => {
            addUnder(root);
        });
        if (created) {
            treeEntry.updated = Date.now();
            this.state.branches = [...this.state.branches];
            this.markBranchDirty(treeId);
            this.persist();
            return newId;
        }
        return false;
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
