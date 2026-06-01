/**
 * Unified “tree information”: public summary / edit (tree-presentation) + course intro markdown.
 * Opened from Trees, map chrome, or desktop menu — mobile “More” no longer duplicates tree info (Trees screen keeps ℹ️).
 */
import { store } from '../../../core/store.js';
import { parseContent } from '../../learning/parser.js';
import { ContentRenderer } from '../renderer.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import {
    getMediaConsentModalMarkup,
    getPendingExternalMediaDetails,
    isMediaSrcBlocked,
    persistMediaOriginsConsent
} from '../../privacy-gdpr/third-party-media.js';
import { hasAboutCourseCard } from '../../learning/course-intro-markdown.js';
import { TreeUtils } from '../tree-utils.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';

/**
 * Module-level cache for relay ping results so re-opening the "About this tree" modal
 * does not re-hit every relay (the user reported it felt like the modal was "reloading
 * online trees" every time). Keyed by the joined peer URL list so a relay change still
 * triggers a fresh check.
 */
const RELAY_PING_TTL_MS = 60_000;
let _cachedRelayPings = null; // { key: string, ts: number, checks: Array<{ok, ms, status}> }

class ArboritoModalTreeInfo extends HTMLElement {
    constructor() {
        super();
        this._introQuizStates = {};
        this._mediaDeclined = false;
    }

    connectedCallback() {
        this.renderShell();
        this._bindChrome();
        queueMicrotask(() => {
            this._renderTreeHealthSection();
            this._renderMarkdownSection();
        });
    }

    _modalFlags() {
        const m = store.value.modal;
        return {
            fromConstructionMore: m && typeof m === 'object' && !!m.fromConstructionMore,
            fromSources: m && typeof m === 'object' && !!m.fromSources
        };
    }

    renderShell() {
        const ui = store.ui;
        const mobile = shouldShowMobileUI();
        const { fromConstructionMore } = this._modalFlags();
        const instantOpen = fromConstructionMore && mobile;
        /* Shared dock-modal enter animation; same easing/duration as search/sage/arcade/profile
         * and the "More" sheet so the drill feels like one design. */
        const title = ui.treeInfoModalTitle || ui.treePresentationTitle || 'About this tree';
        const introHeading = ui.treeInfoIntroHeading || ui.introLabel || 'Introduction';

        /* Header pinned to the canonical "More" sub-pane hero pattern: same class soup
         * used by Sources / About / Language / Certificates so the drill reads as one panel.
         * We pass `mobile: true` to force the mobile wrap class on desktop too — that's
         * the look tree-info has always shipped. The back/close themselves still respect
         * the real viewport (back on mobile, × on desktop). */
        const headerHtml = modalHeroHtml(ui, {
            mobile: true,
            title,
            titleTruncate: true,
            tagClass: 'btn-tree-info-back',
            trailingSpacer: true,
            showClose: !mobile,
        });

        /* `<arborito-tree-presentation>` (title + "by" + seeds + "Report") used to live here,
         * but every row in the Trees picker already shows the same title/author/seeds card —
         * showing it again inside "Sobre este árbol" was duplicate noise. This modal now sticks
         * to the data the picker doesn't have: the diagnostics block (storage / relays / seeder)
         * and the course intro markdown. */
        const bodyHtml = `
                ${headerHtml}
                <div id="tree-info-scroll" class="flex-1 overflow-y-auto overscroll-contain custom-scrollbar min-h-0 px-3 py-3 sm:px-4 sm:py-4" style="touch-action: pan-y; -webkit-overflow-scrolling: touch;">
                    <div id="tree-info-health" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-3 text-left"></div>
                    <div id="tree-info-intro-wrap" class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <p class="arborito-eyebrow mb-2">${introHeading}</p>
                        <div id="tree-info-md" class="readme-markdown prose prose-slate dark:prose-invert mx-auto w-full max-w-3xl text-left select-text text-sm"></div>
                    </div>
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml,
            mobile,
            layout: 'dock',
            z: 140,
            instantOpen,
            panelRadius: mobile ? 'none' : '2xl',
            panelSize: mobile ? undefined : 'lg auto-h',
        });
    }

    _bindChrome() {
        const close = () => store.dismissModal();
        this.querySelectorAll('.btn-tree-info-back').forEach((b) => bindMobileTap(b, close));
        const bd = this.querySelector('#modal-backdrop');
        if (bd) {
            bd.addEventListener('click', (e) => {
                if (e.target === bd) close();
            });
        }
    }

    _formatBytes(n) {
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    }

    _renderTreeHealthSection() {
        const el = this.querySelector('#tree-info-health');
        if (!el) return;
        const raw = store.state.rawGraphData;
        const ui = store.ui;
        if (!raw) {
            el.classList.add('hidden');
            return;
        }
        el.classList.remove('hidden');
        const nodes = TreeUtils.countNodesInRawGraph(raw);
        const title = ui.treeHealthHeading || 'Tree data footprint';
        const sizeL = ui.treeHealthSizeLabel || 'Estimated size in memory (JSON)';
        const nodesL = ui.treeHealthNodesLabel || 'Nodes (map + lessons)';
        const pending = ui.treeHealthSizePending || '…';
        el.innerHTML = `
            <p class="arborito-eyebrow m-0 mb-2">${title}</p>
            <ul class="list-disc pl-4 m-0 space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                <li><span class="font-semibold">${sizeL}:</span> <span id="tree-info-size-bytes">${pending}</span></li>
                <li><span class="font-semibold">${nodesL}:</span> ${nodes}</li>
            </ul>
            <div id="tree-info-network-health" class="mt-4"></div>
        `;
        const measureFootprint = () => {
            try {
                const n = TreeUtils.utf8JsonByteLength(raw);
                const span = el.querySelector('#tree-info-size-bytes');
                if (span) span.textContent = this._formatBytes(n);
            } catch {
                const span = el.querySelector('#tree-info-size-bytes');
                if (span) span.textContent = pending;
            }
        };
        const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 0);
        ric(measureFootprint, { timeout: 900 });
        void this._renderNetworkHealth();
    }

    async _ping(url, timeoutMs = 2500) {
        const started = performance.now();
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal, mode: 'cors' });
            const ms = Math.round(performance.now() - started);
            return { ok: !!res, ms, status: res.status };
        } catch {
            const ms = Math.round(performance.now() - started);
            return { ok: false, ms, status: 0 };
        } finally {
            clearTimeout(t);
        }
    }

    _parsePeersTextarea(s) {
        return String(s || '')
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean);
    }

    async _renderNetworkHealth() {
        const wrap = this.querySelector('#tree-info-network-health');
        if (!wrap) return;
        const ui = store.ui;
        const treeRef = (store.getActivePublicTreeRef && store.getActivePublicTreeRef());
        if (!treeRef) {
            wrap.innerHTML = '';
            return;
        }
        const seeds = store.state.nostrLiveSeeds;
        const peers = Array.isArray((store.nostr && store.nostr.peers)) ? store.nostr.peers : [];
        const heading = ui.treeNetworkHealthHeading || 'Online health';
        const seedsL = ui.treeNetworkHealthSeedsLabel || 'Active peers (approx.)';
        const relaysL = ui.treeNetworkHealthRelaysLabel || 'Relays';
        const saveL = ui.dialogSaveButton || 'Save';
        const hint =
            ui.treeNetworkHealthHint ||
            'If relays are down or slow, add community relays here. Share codes can include recommended relays so others connect automatically.';

        wrap.innerHTML = `
            <p class="arborito-eyebrow m-0 mb-2">${heading}</p>
            <ul class="list-disc pl-4 m-0 space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                <li><span class="font-semibold">${seedsL}:</span> ${seeds == null ? '—' : String(seeds)}</li>
            </ul>
            <p class="mt-2 mb-2 text-xs leading-snug text-slate-500 dark:text-slate-400">${hint}</p>
            <p class="arborito-eyebrow m-0 mb-2">${relaysL}</p>
            <div id="tree-info-relay-status" class="text-xs text-slate-600 dark:text-slate-300 space-y-1 mb-3"></div>
            <textarea id="tree-info-relays-input" class="w-full h-28 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 outline-none" spellcheck="false">${esc(peers.join('\n'))}</textarea>
            <div class="mt-2 flex items-center justify-end gap-2">
                <button id="btn-tree-info-relays-save" class="arborito-cta-emerald px-3 py-2 rounded-xl text-xs font-bold">${saveL}</button>
            </div>
        `;

        const statusEl = this.querySelector('#tree-info-relay-status');
        if (statusEl) {
            const cacheKey = peers.join('|');
            const now = Date.now();
            const fresh =
                _cachedRelayPings &&
                _cachedRelayPings.key === cacheKey &&
                (now - _cachedRelayPings.ts) < RELAY_PING_TTL_MS;
            let checks;
            if (fresh) {
                checks = _cachedRelayPings.checks;
            } else {
                statusEl.textContent = (ui.treeNetworkHealthChecking || 'Checking relays…');
                checks = await Promise.all(peers.map((p) => this._ping(p)));
                _cachedRelayPings = { key: cacheKey, ts: now, checks };
            }
            statusEl.innerHTML = peers
                .map((p, i) => {
                    const c = checks[i];
                    const ok = (c && c.ok);
                    const ms = ((c && c.ms) != null ? c.ms : 0);
                    const badgeCls = ok
                        ? ms < 3500
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-amber-700 dark:text-amber-300'
                        : 'text-rose-700 dark:text-rose-300';
                    const badge = ok ? `${ms}ms` : (ui.treeNetworkHealthDown || 'down');
                    return `<div class="flex items-center justify-between gap-2"><span class="font-mono break-all">${esc(
                        p
                    )}</span><span class="${badgeCls} font-bold">${esc(badge)}</span></div>`;
                })
                .join('');
        }

        const saveBtn = this.querySelector('#btn-tree-info-relays-save');
        if (saveBtn && !saveBtn._bound) {
            saveBtn._bound = true;
            saveBtn.addEventListener('click', () => {
                const ta = this.querySelector('#tree-info-relays-input');
                const next = this._parsePeersTextarea((ta && ta.value) || '');
                store.setNostrRelayUrls(next);
                /* Force a re-check after the user explicitly changed the relays. */
                _cachedRelayPings = null;
                void this._renderNetworkHealth();
            });
        }

        // Append torrent health + seeder control (if webtorrent metadata exists).
        await this._renderTorrentHealth();
    }

    async _renderTorrentHealth() {
        const wrap = this.querySelector('#tree-info-network-health');
        if (!wrap) return;
        const raw = store.state.rawGraphData;
        const wt = ((raw && raw.meta) ? raw.meta.webtorrent : undefined);
        if (!wt || typeof wt !== 'object' || wt.mode !== 'buckets-v1') return;

        const ui = store.ui;
        const heading = ui.treeTorrentHealthHeading || 'Course content (WebTorrent)';
        const hint =
            ui.treeTorrentHealthHint ||
            'These are the “bytes” of the course (folders + lessons). If there are no peers, downloads may be slow until someone runs a seeder.';

        const nodes = wt.nodesBuckets && typeof wt.nodesBuckets === 'object' ? wt.nodesBuckets : {};
        const content = wt.contentBuckets && typeof wt.contentBuckets === 'object' ? wt.contentBuckets : {};
        const magnets = [
            ...Object.values(nodes).map((s) => String(s || '').trim()).filter(Boolean),
            ...Object.values(content).map((s) => String(s || '').trim()).filter(Boolean)
        ];
        const uniq = [...new Set(magnets)];
        const sample = uniq.slice(0, 6);
        let peersTotal = 0;
        try {
            if ((store.webtorrent && store.webtorrent.available ? store.webtorrent.available() : false)) {
                const stats = await Promise.all(sample.map((m) => store.webtorrent.getStats({ magnet: m })));
                for (const st of stats) peersTotal += (st && st.numPeers) || 0;
            }
        } catch {
            peersTotal = 0;
        }

        const seeder = store.state.webtorrentSeeder || { running: false, total: 0, done: 0, peers: 0 };
        const seederLine = seeder.running
            ? `${seeder.done || 0}/${seeder.total || 0} · peers≈${seeder.peers || peersTotal}`
            : `peers≈${peersTotal}`;

        const btnText = seeder.running
            ? ui.treeTorrentStopSeeder || 'Stop seeder'
            : ui.treeTorrentStartSeeder || 'Start seeder';
        const warn =
            ui.treeTorrentSeederWarn ||
            'Seeder mode downloads and shares the whole course. It can slow down this device and use bandwidth.';

        wrap.insertAdjacentHTML(
            'beforeend',
            `
            <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <p class="arborito-eyebrow m-0 mb-2">${heading}</p>
              <p class="mt-0 mb-2 text-xs leading-snug text-slate-500 dark:text-slate-400">${hint}</p>
              <ul class="list-disc pl-4 m-0 space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                <li><span class="font-semibold">Buckets:</span> ${uniq.length}</li>
                <li><span class="font-semibold">Status:</span> ${seederLine}</li>
              </ul>
              <p class="mt-2 mb-2 text-[11px] leading-snug text-amber-700 dark:text-amber-300">${warn}</p>
              <div class="flex items-center justify-end">
                <button id="btn-tree-info-torrent-seeder" class="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold">${btnText}</button>
              </div>
            </div>`
        );

        const btn = this.querySelector('#btn-tree-info-torrent-seeder');
        if (btn && !btn._bound) {
            btn._bound = true;
            btn.addEventListener('click', async () => {
                const cur = store.state.webtorrentSeeder;
                if ((cur && cur.running)) store.stopWebTorrentSeeder();
                else await store.startWebTorrentSeeder();
                void this._renderNetworkHealth();
            });
        }
    }

    _getReadmeMarkdown() {
        const rootNode = store.value.data;
        const rawData = store.value.rawGraphData;
        if (!rootNode || !rawData) return '';
        if (hasAboutCourseCard(rawData)) return '';
        return rootNode.description || store.ui.readmeFallbackWelcome || '';
    }

    _renderMarkdownSection() {
        const bodyEl = this.querySelector('#tree-info-md');
        if (!bodyEl) return;

        const ui = store.ui;
        const wrap = this.querySelector('#tree-info-intro-wrap');
        const md = this._getReadmeMarkdown().trim();
        if (!md) {
            if (wrap) wrap.classList.add('hidden');
            return;
        }
        if (wrap) wrap.classList.remove('hidden');

        const getQuizState = (id) =>
            this._introQuizStates[id] || {
                started: false,
                finished: false,
                currentIdx: 0,
                score: 0,
                results: []
            };
        const blocks = parseContent(md);
        const pendingMediaDetails = getPendingExternalMediaDetails(blocks);
        const showMediaConsentModal = pendingMediaDetails.length > 0 && !this._mediaDeclined;

        const htmlContent = blocks
            .map((b) =>
                ContentRenderer.renderBlock(b, ui, {
                    getQuizState,
                    isCompleted: () => false,
                    isExam: false,
                    isMediaSrcBlocked
                })
            )
            .join('');

        bodyEl.innerHTML = htmlContent;

        const backdrop = this.querySelector('#modal-backdrop');
        const consentRoot = backdrop ? backdrop.querySelector('#arborito-media-consent-root') : null;
        if (consentRoot) consentRoot.remove();
        if (showMediaConsentModal && backdrop) {
            backdrop.insertAdjacentHTML('beforeend', getMediaConsentModalMarkup(ui, pendingMediaDetails));
            const btnAccept = this.querySelector('#btn-media-consent-accept');
            const btnDecline = this.querySelector('#btn-media-consent-decline');
            if (btnAccept) {
                btnAccept.onclick = () => {
                    const rootEl = this.querySelector('#arborito-media-consent-root');
                    let origins = [];
                    const raw = ((rootEl && rootEl.dataset) ? rootEl.dataset.pendingOrigins : undefined);
                    if (raw) {
                        try {
                            origins = JSON.parse(decodeURIComponent(raw));
                        } catch {
                            origins = [];
                        }
                    }
                    persistMediaOriginsConsent(origins, true);
                    this._renderMarkdownSection();
                };
            }
            if (btnDecline) {
                btnDecline.onclick = () => {
                    this._mediaDeclined = true;
                    this._renderMarkdownSection();
                };
            }
        }

        bodyEl.querySelectorAll('.arborito-media-consent-retry').forEach((btn) => {
            btn.onclick = () => {
                this._mediaDeclined = false;
                this._renderMarkdownSection();
            };
        });
    }
}

customElements.define('arborito-modal-tree-info', ArboritoModalTreeInfo);
