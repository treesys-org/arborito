
import { store } from "../store.js";
import { utf8_to_b64 } from "../utils/editor-engine.js";

class GitHubService {
    constructor() {
        this.token = null;
        this.currentUser = null;
        this.repoCache = null;
        this.codeOwnersRules = [];
        this.treeCache = null;
        this.baseUrl = "https://api.github.com";
    }

    // --- NATIVE FETCH HELPER ---
    async req(endpoint, method = 'GET', body = null) {
        if (!this.token) throw new Error("Not authenticated");
        
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        const headers = {
            "Authorization": `token ${this.token}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        };

        const config = { method, headers };
        if (body) config.body = JSON.stringify(body);

        const response = await fetch(url, config);
        
        if (!response.ok) {
            let errorMsg = `GitHub API Error: ${response.status}`;
            try {
                const errJson = await response.json();
                if (errJson.message) errorMsg += ` - ${errJson.message}`;
            } catch (e) {}
            
            // Handle rate limits or specific errors if needed
            const error = new Error(errorMsg);
            error.status = response.status;
            throw error;
        }
        
        // Handle 204 No Content (e.g. DELETE)
        if (response.status === 204) return null;

        return await response.json();
    }

    async initialize(token) {
        if (!token) return null;
        this.token = token;
        try {
            const user = await this.req("/user");
            this.currentUser = user;
            // Background load owners, don't block
            this.loadCodeOwners().catch(console.warn);
            return this.currentUser;
        } catch (e) {
            console.error("GitHub Auth Failed", e);
            this.token = null;
            return null;
        }
    }

    disconnect() {
        this.token = null;
        this.currentUser = null;
        this.repoCache = null;
        this.codeOwnersRules = [];
        this.treeCache = null;
    }

    getRepositoryInfo() {
        if (this.repoCache) return this.repoCache;
        const url = store.value.activeSource?.url;
        if (!url) return null;
        try {
            if (url.includes('raw.githubusercontent.com')) {
                const parts = new URL(url).pathname.split('/');
                this.repoCache = { owner: parts[1], repo: parts[2] };
            } else if (url.includes('github.io')) {
                const hostParts = new URL(url).hostname.split('.');
                const parts = new URL(url).pathname.split('/');
                this.repoCache = { owner: hostParts[0], repo: parts[1] };
            }
        } catch (e) { console.error("Repo parse error", e); }
        return this.repoCache;
    }
    
    async checkHealth() {
        if (!this.token) return false;
        try {
            const repo = this.getRepositoryInfo();
            if (!repo) return false;
            // Lightweight check
            await this.req(`/repos/${repo.owner}/${repo.repo}`);
            return true;
        } catch (e) { return false; }
    }

    async initializeSkeleton() {
        const repo = this.getRepositoryInfo();
        if (!repo) throw new Error("No repository detected.");
        const files = [
            { path: 'content/EN/01_Welcome/meta.json', content: JSON.stringify({ name: "Welcome", icon: "👋", order: "1" }, null, 2) },
            { path: 'content/EN/01_Welcome/01_Intro.md', content: "@title: Hello World\n@icon: 🌍\n@description: Your first lesson.\n\n# Welcome to Arborito\n\nThis is your first lesson. Click 'Edit' to change it!" },
            { path: '.github/CODEOWNERS', content: "# ARBORITO GOVERNANCE\n# Define folder owners here\n/content/EN/ @"+this.currentUser.login }
        ];
        for (const file of files) {
            try { await this.commitFile(file.path, file.content, "chore: Initialize Arborito skeleton"); } catch(e) {}
        }
        return true;
    }

    async protectBranch() {
        if (!this.token) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        const repoData = await this.req(`/repos/${repo.owner}/${repo.repo}`);
        
        await this.req(`/repos/${repo.owner}/${repo.repo}/branches/${repoData.default_branch}/protection`, 'PUT', {
            required_status_checks: null, enforce_admins: false,
            required_pull_request_reviews: { dismiss_stale_reviews: false, require_code_owner_reviews: false, required_approving_review_count: 0 },
            restrictions: null
        });
        return true;
    }

    async getFileContent(path) {
        if (!this.token) throw new Error("Editor Mode not connected.");
        const repo = this.getRepositoryInfo();
        try {
            const data = await this.req(`/repos/${repo.owner}/${repo.repo}/contents/${path}?timestamp=${Date.now()}`);
            const cleanContent = data.content.replace(/\s/g, '');
            // Native browser decoding
            const decoded = new TextDecoder().decode(Uint8Array.from(atob(cleanContent), c => c.charCodeAt(0)));
            return { content: decoded, sha: data.sha };
        } catch (e) { throw new Error(`File not found: ${path}`); }
    }

    async getRecursiveTree(path = 'content', forceRefresh = false) {
        if (this.treeCache && !forceRefresh) return this.treeCache.filter(node => node.path.startsWith(path));
        if (!this.token) return [];
        const repo = this.getRepositoryInfo();
        if (!repo) return [];
        try {
            const repoData = await this.req(`/repos/${repo.owner}/${repo.repo}`);
            const defaultBranch = repoData.default_branch;
            
            // Get HEAD ref to find tree SHA
            const refData = await this.req(`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${defaultBranch}`);
            const treeSha = refData.object.sha;
            
            const treeData = await this.req(`/repos/${repo.owner}/${repo.repo}/git/trees/${treeSha}?recursive=1`);
            
            this.treeCache = treeData.tree;
            return treeData.tree.filter(node => node.path.startsWith(path));
        } catch (e) { 
            console.error("Tree Fetch Error", e);
            return []; 
        }
    }

    async createPullRequest(filePath, newContent, message, branchName = null) {
        if (!this.token) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        
        // 1. Get Default Branch
        const repoData = await this.req(`/repos/${repo.owner}/${repo.repo}`);
        const baseBranch = repoData.default_branch;
        
        // 2. Create Branch
        const branch = branchName || `contrib/edit-${Date.now()}`;
        const refData = await this.req(`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${baseBranch}`);
        
        try {
            await this.req(`/repos/${repo.owner}/${repo.repo}/git/refs`, 'POST', {
                ref: `refs/heads/${branch}`,
                sha: refData.object.sha
            });
        } catch(e) {
            // Branch might exist, continue
        }

        // 3. Get File SHA (if exists)
        let fileSha = null;
        try {
            const fileData = await this.req(`/repos/${repo.owner}/${repo.repo}/contents/${filePath}`);
            fileSha = fileData.sha;
        } catch (e) {}

        // 4. Update File on New Branch
        await this.req(`/repos/${repo.owner}/${repo.repo}/contents/${filePath}`, 'PUT', {
            message: message,
            content: utf8_to_b64(newContent),
            branch: branch,
            sha: fileSha
        });

        // 5. Create Pull Request
        const pr = await this.req(`/repos/${repo.owner}/${repo.repo}/pulls`, 'POST', {
            title: message,
            body: `Edit via Arborito`,
            head: branch,
            base: baseBranch
        });
        return pr.html_url;
    }

    async commitFile(filePath, newContent, message, sha = null) {
        if (!this.token) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        
        const body = {
            message: message,
            content: utf8_to_b64(newContent)
        };
        if (sha) body.sha = sha;

        return await this.req(`/repos/${repo.owner}/${repo.repo}/contents/${filePath}`, 'PUT', body);
    }

    async createOrUpdateFileContents(filePath, newContent, message, sha = null) {
        return this.commitFile(filePath, newContent, message, sha);
    }

    async deleteFile(filePath, message, sha) {
        if (!this.token) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        
        return await this.req(`/repos/${repo.owner}/${repo.repo}/contents/${filePath}`, 'DELETE', {
            message: message,
            sha: sha
        });
    }

    // --- ENHANCED MOVE LOGIC (FILE & FOLDER) ---
    async moveFile(oldPath, newPath, message) {
        if (!this.token) throw new Error("Not authenticated");

        // 1. Is it a file?
        try {
            const fileData = await this.getFileContent(oldPath);
            // It's a file, perform simple move
            await this.commitFile(newPath, fileData.content, message);
            await this.deleteFile(oldPath, `chore: Move ${oldPath}`, fileData.sha);
            return true;
        } catch(e) {
            // It's likely a folder or doesn't exist
        }

        // 2. Handle Folder Recursion
        const allFiles = await this.getRecursiveTree(oldPath, true);
        const folderFiles = allFiles.filter(f => f.type === 'blob'); // Only move blobs

        if (folderFiles.length === 0) throw new Error("Cannot move: Path is empty or invalid.");

        let movedCount = 0;
        for (const file of folderFiles) {
            const relativePath = file.path.substring(oldPath.length);
            const targetPath = newPath + relativePath;
            
            // Get content
            const { content, sha } = await this.getFileContent(file.path);
            
            // Write to new location
            await this.commitFile(targetPath, content, `${message} (${movedCount + 1}/${folderFiles.length})`);
            
            // Delete old
            await this.deleteFile(file.path, `chore: Cleanup after move`, sha);
            movedCount++;
        }
        
        return true;
    }

    // --- PERMISSION ENGINE (CODEOWNERS) ---
    async loadCodeOwners() {
        if (!this.token) return;
        const paths = ['.github/CODEOWNERS', 'CODEOWNERS'];
        let content = '';
        for (const p of paths) {
            try {
                const res = await this.getFileContent(p);
                content = res.content;
                break;
            } catch(e) {}
        }
        this.codeOwnersRules = [];
        if (content) {
            content.split('\n').forEach(line => {
                const trim = line.trim();
                if(trim && !trim.startsWith('#')) {
                    const [pathPattern, owner] = trim.split(/\s+/);
                    if(pathPattern && owner) this.codeOwnersRules.push({ path: pathPattern, owner });
                }
            });
        }
    }

    async getCodeOwners() {
        if (!this.token) return null;
        const paths = ['.github/CODEOWNERS', 'CODEOWNERS'];
        for (const p of paths) {
            try {
                const res = await this.getFileContent(p);
                return { path: p, content: res.content, sha: res.sha };
            } catch(e) {}
        }
        return null;
    }
    
    async saveCodeOwners(path, content, sha) {
        return this.commitFile(path, content, "chore: Update CODEOWNERS", sha);
    }

    canEdit(path) {
        if (!this.currentUser) return false;
        const username = '@' + this.currentUser.login.toLowerCase();
        let applicableRule = null;
        let maxLen = 0;
        this.codeOwnersRules.forEach(rule => {
            const normRulePath = rule.path.startsWith('/') ? rule.path.substring(1) : rule.path;
            const normFilePath = path.startsWith('/') ? path.substring(1) : path;
            if (normFilePath.startsWith(normRulePath)) {
                if (normRulePath.length > maxLen) {
                    maxLen = normRulePath.length;
                    applicableRule = rule;
                }
            }
        });
        if (applicableRule) return applicableRule.owner.toLowerCase() === username;
        return true; 
    }

    async isAdmin() {
        if (!this.token) return false;
        const repo = this.getRepositoryInfo();
        if (!repo) return false;
        try {
            const perms = await this.req(`/repos/${repo.owner}/${repo.repo}/collaborators/${this.currentUser.login}/permission`);
            return perms.permission === 'admin';
        } catch (e) { return false; }
    }

    async getCollaborators() {
        const repo = this.getRepositoryInfo();
        const data = await this.req(`/repos/${repo.owner}/${repo.repo}/collaborators`);
        return data.map(u => ({
            login: u.login,
            avatar: u.avatar_url,
            role: u.permissions.admin ? 'ADMIN' : (u.permissions.push ? 'EDITOR' : 'READ')
        }));
    }

    async inviteUser(username) {
        const repo = this.getRepositoryInfo();
        await this.req(`/repos/${repo.owner}/${repo.repo}/collaborators/${username}`, 'PUT', { permission: 'push' });
    }

    async getPullRequests() {
        const repo = this.getRepositoryInfo();
        return await this.req(`/repos/${repo.owner}/${repo.repo}/pulls?state=open`);
    }
}

export const github = new GitHubService();
