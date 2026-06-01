import { parseNostrTreeUrl } from '../../nostr/nostr-refs.js';

/** Source list management, deferred product tour, no-tree prompt, and WebTorrent seeder controls. */
export const storeSourceResolveMethods = {
    addCommunitySource(url, opts) {
        return this.sourceManager.addCommunitySource(url, opts || {});
    },

    removeCommunitySource(id) {
        const prevActive = this.state.activeSource;
        this.sourceManager.removeCommunitySource(id);
        // GDPR/local: if user deletes a tree link, also clear derived local caches for that source.
        try {
            import('../../search/search-index-service.js')
                .then((m) => m.clearSearchIndexForTreeId(id))
                .catch(() => {});
            import('../../learning/lesson-content-cache.js')
                .then((m) => m.clearLessonCacheForSource(id))
                .catch(() => {});
        } catch {
            /* ignore */
        }
        if (prevActive?.id === id) {
            void this.clearCanvasAndShowLoadTreeWelcome();
        }
    },

    loadAndSmartMerge(sourceId) {
        const sid = String(sourceId || '').trim();
        if (!sid) return Promise.resolve();
        /* Prefer the saved link (Internet) over version rows in case the id collides. */
        let source =
            this.state.communitySources.find((s) => String(s.id) === sid) ||
            this.state.availableReleases.find((s) => String(s.id) === sid);
        if (!source) return Promise.resolve();
        return this.loadData(source, true);
    },

    /** True if the active source is a public universe and this device holds the publisher key. */
    canRetractActivePublicUniverse() {
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) return false;
        return !!this.getNostrPublisherPair(treeRef.pub);
    },

    /**
     * If the active source is local:// and it was previously published, return its public tree ref.
     * This is used to prevent "infinite publish" loops when the UI remains on the local editor.
     * @returns {{ pub: string, universeId: string } | null}
     */
    getPublishedTreeRefForActiveLocalSource() {
        try {
            const srcUrl = String(this.state.activeSource?.url || '');
            if (!srcUrl.startsWith('local://')) return null;
            const localId = srcUrl.slice('local://'.length);
            const published = this.userStore?.getLocalTreePublishedNetworkUrl?.(localId);
            if (!published) return null;
            return parseNostrTreeUrl(published);
        } catch {
            return null;
        }
    },

    async startWebTorrentSeeder() {
        try {
            const raw = this.state.rawGraphData;
            const wt = raw?.meta?.webtorrent;
            if (!wt || typeof wt !== 'object' || wt.mode !== 'buckets-v1') {
                this.notify(this.ui.webtorrentSeederNoMeta || 'This tree has no WebTorrent metadata to seed.', true);
                return false;
            }
            if (!this.webtorrent?.available?.()) {
                this.notify(this.ui.webtorrentSeederUnavailable || 'WebTorrent is not available in this environment.', true);
                return false;
            }
            const nodes = wt.nodesBuckets && typeof wt.nodesBuckets === 'object' ? wt.nodesBuckets : {};
            const content = wt.contentBuckets && typeof wt.contentBuckets === 'object' ? wt.contentBuckets : {};
            const magnets = [
                ...Object.values(nodes).map((s) => String(s || '').trim()).filter(Boolean),
                ...Object.values(content).map((s) => String(s || '').trim()).filter(Boolean)
            ];
            const uniq = [...new Set(magnets)];
            if (!uniq.length) return false;
            this.update({
                webtorrentSeeder: {
                    running: true,
                    total: uniq.length,
                    done: 0,
                    peers: 0,
                    startedAt: Date.now()
                }
            });
            // Add torrents one by one (keeps memory stable). This will download as needed and then seed.
            for (let i = 0; i < uniq.length; i++) {
                const m = uniq[i];
                try {
                    await this.webtorrent.ensureAdded({ magnet: m });
                } catch {
                    /* ignore */
                }
                if (i % 3 === 0) {
                    let peers = 0;
                    for (const mm of uniq.slice(0, i + 1)) {
                        try {
                            const st = await this.webtorrent.getStats({ magnet: mm });
                            peers += st?.numPeers || 0;
                        } catch {
                            /* ignore */
                        }
                    }
                    this.update({
                        webtorrentSeeder: {
                            ...this.state.webtorrentSeeder,
                            done: i + 1,
                            peers
                        }
                    });
                } else {
                    this.update({
                        webtorrentSeeder: {
                            ...this.state.webtorrentSeeder,
                            done: i + 1
                        }
                    });
                }
            }
            return true;
        } catch (e) {
            console.warn('startWebTorrentSeeder', e);
            this.update({ webtorrentSeeder: { running: false, error: String(e?.message || e) } });
            return false;
        }
    },

    stopWebTorrentSeeder() {
        try {
            this.webtorrent?.stopAll?.();
        } catch {
            /* ignore */
        }
        this.update({ webtorrentSeeder: { running: false, total: 0, done: 0, peers: 0, stoppedAt: Date.now() } });
    },

    /**
     * Users who already dismissed welcome never got `arborito-start-tour`; we retry until
     * no modal blocks (e.g. “no trees”).
     */
    _scheduleDeferredProductTour() {
        try {
            if (localStorage.getItem('arborito-ui-tour-done')) return;
        } catch {
            return;
        }
        // Construction mode should never show the UI tour.
        if (this.state.constructionMode) return;
        let tries = 0;
        const attempt = () => {
            tries += 1;
            try {
                if (localStorage.getItem('arborito-ui-tour-done')) return;
            } catch {
                return;
            }
            if (this.state.constructionMode) return;
            const modal = this.state.modal;
            const modalType = typeof modal === 'string' ? modal : modal?.type;
            const overlayBlocking = !!this.state.modalOverlay;
            const previewBlocking = !!this.state.previewNode;

            if (overlayBlocking || previewBlocking) {
                if (tries < 160) setTimeout(attempt, 400);
                return;
            }

            /* No tree loaded: open the Trees picker so the user has somewhere
             * to go — BUT only when nothing else is currently showing. The
             * earlier behaviour ("if modal is not sources, replace it with
             * sources") hijacked the onboarding wizard mid-flow: after a fresh
             * register the user lands on "Account created!" to save the secret,
             * this poller would fire ~650 ms later and swap that view for the
             * Trees picker without any tap — the "advances on its own" the user
             * reported even on desktop with no input. Onboarding's own
             * `_complete()` is the single source of truth that opens sources
             * when the user is actually ready; we wait for whatever modal is
                     * up to close on its own before nudging the picker open. */
            if (!this.state.data) {
                if (modalType) {
                    /* Something is up (onboarding, profile, sources already, etc.) —
                     * retry later instead of replacing it. */
                    if (tries < 160) setTimeout(attempt, 400);
                    return;
                }
                try {
                    this.setModal({ type: 'sources' });
                } catch {
                    /* ignore */
                }
                if (overlayBlocking || previewBlocking) {
                    if (tries < 160) setTimeout(attempt, 400);
                    return;
                }
                window.dispatchEvent(
                    new CustomEvent('arborito-start-tour', {
                        detail: { source: 'deferred-no-tree', force: true, skipDockForOpenTrees: true }
                    })
                );
                return;
            }

            if (modal) {
                if (tries < 160) setTimeout(attempt, 400);
                return;
            }
            window.dispatchEvent(new CustomEvent('arborito-start-tour', { detail: { source: 'deferred-init' } }));
        };
        setTimeout(attempt, 650);
    },

    /**
     * After Sources-only onboarding tour, dock/graph tour stays pending until a tree loads.
     * Must match `SHELL_TOUR_PENDING_KEY` in `product-tour.js`.
     */
    maybeScheduleShellProductTourAfterTree() {
        const shellPendingKey = 'arborito-ui-tour-shell-pending-v1';
        try {
            if (localStorage.getItem('arborito-ui-tour-done')) return;
            if (localStorage.getItem(shellPendingKey) !== 'true') return;
        } catch {
            return;
        }
        if (this.state.constructionMode) return;
        if (!this.state.rawGraphData || !this.state.activeSource) return;
        try {
            localStorage.removeItem(shellPendingKey);
        } catch {
            /* ignore */
        }
        this._scheduleDeferredProductTour();
    },

    maybePromptNoTree(opts = {}) {
        if (this.state.treeHydrating) return;
        if (this.state.loading) return;
        if (this.state.data) return;

        const m = this.state.modal;
        const t = typeof m === 'string' ? m : m?.type;
        const localCount = this.userStore?.state?.localTrees?.length ?? 0;
        const emptyGarden = localCount === 0;

        /** Empty garden and no curriculum: always open Trees (sources). */
        if (emptyGarden) {
            if (t === 'language') return;
            if (t === 'onboarding') return;
            if (this.state.modalOverlay?.type === 'author-license') return;
            if (t === 'author-license' || t === 'load-warning') return;
            if (t === 'dialog') return;
            this.setModal({ type: 'sources' });
            this._maybeStartSourcesPickerTour();
            return;
        }

        if (t === 'language') return;
        if (t === 'onboarding') return;
        if (this.state.modalOverlay?.type === 'author-license') return;
        if (t === 'author-license' || t === 'load-warning') return;
        if (t === 'dialog') return;
        // No tree: open Trees (sources) directly.
        this.setModal({ type: 'sources' });
        this._maybeStartSourcesPickerTour();
    },

    /** Product tour on the tree picker when no curriculum is loaded yet. */
    _maybeStartSourcesPickerTour() {
        try {
            if (localStorage.getItem('arborito-ui-tour-done')) return;
        } catch {
            return;
        }
        setTimeout(() => {
            try {
                if (localStorage.getItem('arborito-ui-tour-done')) return;
            } catch {
                return;
            }
            const m = this.state.modal;
            const mt = typeof m === 'string' ? m : m?.type;
            if (mt !== 'sources' || this.state.data) return;
            window.dispatchEvent(
                new CustomEvent('arborito-start-tour', {
                    detail: { source: 'no-tree-sources', force: true, skipDockForOpenTrees: true }
                })
            );
        }, 700);
    }
};
