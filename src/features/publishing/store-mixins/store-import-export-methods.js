import { DataProcessor } from '../../tree-graph/data-processor.js';

/** Progress import/export glue (`getExportJson` itself lives elsewhere). */
export const storeImportExportMethods = {
    downloadProgressFile() {
        const data = this.getExportJson();
        const blob = new Blob([data], {type: 'application/json;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `arborito-progress-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    importProgress(input) {
        try {
            let data;
            const cleaned = input.trim();
            if (cleaned.startsWith('{')) data = JSON.parse(cleaned);
            else data = JSON.parse(decodeURIComponent(escape(atob(cleaned))));

            let newProgress = [];
            if (Array.isArray(data.progress)) newProgress = data.progress;

            if (data.gamification) {
                this.userStore.state.gamification = {
                    ...this.userStore.state.gamification,
                    ...data.gamification
                };
            }

            if (data.bookmarks) {
                this.userStore.state.bookmarks = { ...this.userStore.state.bookmarks, ...data.bookmarks };
                localStorage.setItem('arborito-bookmarks', JSON.stringify(this.state.bookmarks));
            }

            if (data.gameData) {
                this.userStore.state.gameData = { ...this.userStore.state.gameData, ...data.gameData };
            }

            // Restore Nostr writer keypair (needed to decrypt synced progress).
            const importedPair =
                data.nostrPair && typeof data.nostrPair === 'object' ? data.nostrPair : null;
            if (importedPair && importedPair.pub && importedPair.priv) {
                localStorage.setItem('arborito-nostr-user-pair', JSON.stringify(importedPair));
            }

            if (!Array.isArray(newProgress)) throw new Error('Invalid Format');

            const merged = new Set([...this.userStore.state.completedNodes, ...newProgress]);
            this.userStore.state.completedNodes = merged;
            this.userStore.persist();

            if (this.state.data) DataProcessor.hydrateCompletionState(this, this.state.data);

            this.update({});
            // If a public tree is mounted, push the imported progress back (encrypted).
            try {
                this.maybeSyncNetworkProgress(this.userStore.getPersistenceData());
            } catch {
                /* ignore */
            }
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
};
