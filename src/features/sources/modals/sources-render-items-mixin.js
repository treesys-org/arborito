import { store } from '../../../core/store.js';
import { listKnownAliasKeys } from '../tree-aliases.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { calloutHtml } from '../../../shared/ui/callout.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../nostr/nostr-refs.js';
import { DIRECTORY_CLIENT_FETCH_LIMIT, SOURCES_UNIFIED_DISPLAY_CAP } from '../../p2p-webtorrent/directory-index-config.js';
import {
    loadGlobalDirectoryRowsFromHttp,
    loadGlobalDirectoryRowsFromTorrent,
    mergeNostrAndTorrentDirectoryRows,
    usesGlobalDirectoryPointerForTorrent
} from '../../p2p-webtorrent/global-directory-torrent.js';
import { canonicalNetworkTreeUrlString, escapeHtmlAttr, escapeHtmlText } from './sources-helpers.js';
import { resolveDirectoryAuthorLabel } from '../../tree-graph/tree-owner-display.js';
import { AVAILABLE_LANGUAGES } from '../../../core/i18n.js';

/**
 * Inline language pills for a sources row. Returns '' when there's no language metadata
 * (older directory rows) so we never imply a tree is "no-language" by accident. The user's
 * active UI language gets the emerald highlight; the rest stay neutral.
 */
function languagePillsHtml(langCodesRaw, escFn) {
    const codes = Array.from(
        new Set(
            (Array.isArray(langCodesRaw) ? langCodesRaw : [])
                .map((c) => String(c || '').trim().toUpperCase())
                .filter(Boolean)
        )
    );
    if (codes.length === 0) return '';
    const active = String(store.state?.lang || '').toUpperCase();
    const meta = new Map(
        (Array.isArray(AVAILABLE_LANGUAGES) ? AVAILABLE_LANGUAGES : []).map((l) => [
            String(l.code || '').toUpperCase(),
            l
        ])
    );
    return codes
        .map((code) => {
            const m = meta.get(code);
            const flag = m?.flag || '🌐';
            const label = m?.nativeName || m?.name || code;
            const isActive = code === active;
            const cls = isActive
                ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black border bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 border-emerald-300/80 dark:border-emerald-700/70'
                : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
            return `<span class="${cls}" title="${escFn(label)}"><span aria-hidden="true">${escFn(flag)}</span><span>${escFn(code)}</span></span>`;
        })
        .join('');
}

export const sourcesRenderItemsMethods = {

    _renderItemLocal(ui, t, { activeSource }) {
        const isActive = !!(activeSource && activeSource.id === t.id);
        const key = `local:${String(t?.id || '')}`;
        const open = !!(key && this._rowActionsOpen && this._rowActionsOpen.has(key));
        const localLangs = t?.data?.languages ? Object.keys(t.data.languages) : [];
        const langPills = languagePillsHtml(localLangs, (s) => this._escText(s));
        /* Active-row border:
         * - Light mode keeps the saturated emerald (`emerald-500/70`) — pops
         *   cleanly against the bright off-white background.
         * - Dark mode uses a calmer sky-slate accent (`sky-400/40`) plus a
         *   subtle inset ring. The previous `emerald-500/50` was too neon
         *   against the dark emerald modal background. */
        return `<div class="p-4 bg-white dark:bg-slate-900 border ${
            isActive
                ? 'border-emerald-500/70 dark:border-sky-400/40 dark:ring-1 dark:ring-sky-400/15'
                : 'border-slate-200 dark:border-slate-800'
        } rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex flex-wrap gap-2 items-center">
                        <p class="m-0 text-sm font-black text-slate-800 dark:text-slate-100 truncate">🌳 ${this._escText(
                            t?.name
                        )}</p>
                        ${this._renderPill(
                            ui.sourcesPillLocal || 'Local',
                            'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-800/60'
                        )}
                        ${
                            t?.publishedNetworkUrl
                                ? this._renderPill(
                                      ui.sourcesPillPublished || 'Published',
                                      'bg-sky-50 dark:bg-sky-950/25 text-sky-900 dark:text-sky-200 border-sky-200/70 dark:border-sky-800/60'
                                  )
                                : ''
                        }
                        ${
                            isActive
                                ? this._renderPill(
                                      ui.sourceActive || 'Active',
                                      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                  )
                                : ''
                        }
                        ${langPills}
                    </div>
                    <p class="m-0 mt-1 text-[10px] text-slate-400 font-mono">${this._escText(
                        ui.sourcesUpdated || 'Updated'
                    )}: ${this._escText(new Date(t?.updated).toLocaleDateString())}</p>
                </div>
                <div class="flex gap-2 shrink-0 items-center">
                    ${
                        isActive
                            ? ''
                            : `<button data-action="load-local" data-id="${this._escAttr(
                                  t?.id
                              )}" data-name="${this._escAttr(
                                  t?.name
                              )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm hover:opacity-90 transition-opacity">${this._escText(
                                  ui.sourceLoad
                              )}</button>`
                    }
                    <button type="button" data-action="toggle-row-actions" data-key="${this._escAttr(
                        key
                    )}" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors text-sm font-black" aria-expanded="${open ? 'true' : 'false'}" aria-label="${this._escAttr(
                        ui.more || ui.navMore || 'More'
                    )}">⋯</button>
                </div>
            </div>
            ${
                open
                    ? `<div class="mt-3 flex flex-wrap gap-2">
                        <button type="button" data-action="tree-info" data-id="${this._escAttr(
                            t?.id
                        )}" data-name="${this._escAttr(t?.name)}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">${this._escText(
                            ui.treesViewTreeInfoButton || ui.treeInfoModalTitle || 'Tree information'
                        )}</button>
                        <button type="button" data-action="export-local" data-id="${this._escAttr(
                            t?.id
                        )}" data-name="${this._escAttr(t?.name)}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30">${this._escText(
                            ui.sourceExport || 'Export'
                        )}</button>
                        <button type="button" data-action="show-delete" data-id="${this._escAttr(
                            t?.id
                        )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-900/20">${this._escText(
                            ui.sourceRemove
                        )}</button>
                    </div>`
                    : ''
            }
        </div>`;
    },

    _renderItemSaved(ui, s) {
        const key = `saved:${String(s?.id || '')}`;
        const open = !!(key && this._rowActionsOpen && this._rowActionsOpen.has(key));
        const dir = this._directoryRowForCommunitySource(s);
        let treeRef = null;
        try {
            treeRef = parseNostrTreeUrl(String(s?.url || '').trim());
        } catch {
            treeRef = null;
        }
        const titleRaw = String(dir?.title || s?.name || '').trim();
        const title =
            titleRaw ||
            (s?.origin === 'nostr'
                ? ui.graphUntitledDefault || 'Untitled'
                : (() => {
                      try {
                          return new URL(String(s.url).trim(), window.location.href).hostname;
                      } catch {
                          return ui.graphUntitledDefault || 'Untitled';
                      }
                  })());
        const desc = String(dir?.description || s?.listDescription || '').trim();
        const codeForPill = String(s?.shareCode || dir?.shareCode || '').trim();
        const savedLangs = Array.isArray(s?.languages) && s.languages.length
            ? s.languages
            : (Array.isArray(dir?.languages) ? dir.languages : []);
        const savedLangPills = languagePillsHtml(savedLangs, (s2) => this._escText(s2));

        /* HTTPS or other links without Nostr ref: same layout as Internet (title + description), no “by” row. */
        if (!treeRef) {
            const originIcon = s.origin === 'nostr' ? '🕸️' : '🌐';
            return `<div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex flex-wrap gap-2 items-center">
                        <p class="m-0 text-sm font-black text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">${originIcon} ${this._escText(
                title
            )}</p>
                        ${this._renderPill(
                            ui.sourcesPillSaved || 'Guardado',
                            'bg-purple-50 dark:bg-purple-900/25 text-purple-900 dark:text-purple-200 border-purple-200/70 dark:border-purple-800/60'
                        )}
                        ${
                            codeForPill
                                ? this._renderPill(
                                      `#${codeForPill}`,
                                      'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                  )
                                : ''
                        }
                        ${savedLangPills}
                    </div>
                    ${
                        desc
                            ? `<p class="m-0 mt-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-3">${this._escText(
                                  desc
                              )}</p>`
                            : ''
                    }
                </div>
                <div class="flex gap-2 shrink-0 items-center">
                    <button data-action="load-source" data-id="${this._escAttr(
                        s?.id
                    )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-sm ring-1 ring-amber-600/40 dark:ring-amber-400/50">${this._escText(
                ui.sourceLoad
            )}</button>
                    <button type="button" data-action="toggle-row-actions" data-key="${this._escAttr(
                        key
                    )}" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors text-sm font-black" aria-expanded="${open ? 'true' : 'false'}" aria-label="${this._escAttr(
                ui.more || ui.navMore || 'More'
            )}">⋯</button>
                </div>
            </div>
            ${
                open
                    ? `<div class="mt-3 flex flex-wrap gap-2">
                        <button type="button" data-action="remove-source" data-id="${this._escAttr(
                            s?.id
                        )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-900/20">${this._escText(
                            ui.sourcesGlobalRemove || ui.sourceRemove || 'Uninstall'
                        )}</button>
                    </div>`
                    : ''
            }
        </div>`;
        }

        const r = {
            ownerPub: String(treeRef.pub),
            universeId: String(treeRef.universeId),
            title,
            shareCode: codeForPill,
            description: desc,
            authorName: String(dir?.authorName || s?.listAuthorName || '').trim()
        };
        const st = this._computeDirectoryRowState(r);
        const ownerPub = st.ownerPub;
        const isReported = st.isReported;
        const m = this._getRowMetrics(r);
        const votes = Number.isFinite(Number(m?.votes)) ? Number(m.votes) : null;
        const voteUpLbl = this._escAttr(ui.sourcesGlobalVoteUp || ui.sourcesGlobalVote);
        const reportLbl = this._escAttr(ui.sourcesGlobalReport || ui.sourcesGlobalReport);
        const liked = (() => {
            try {
                const pair = store.getNetworkUserPair?.();
                const pub = String(pair?.pub || '').trim();
                if (pub) {
                    const lsKey = this._voteKey(st.ownerPub, st.universeId, pub);
                    return this._lsGet(lsKey) === '1';
                }
                const fallback = this._voteKeyFallback(st.ownerPub, st.universeId);
                return this._lsGet(fallback) === '1';
            } catch {
                return false;
            }
        })();
        const isOwner = (() => {
            try {
                return !!(ownerPub && store.getNostrPublisherPair?.(ownerPub)?.priv);
            } catch {
                return false;
            }
        })();
        const latestLegalAt = String(st.legalLatestAt || '').trim();
        const defenseAt = String(st.legalOwnerDefenseLatestAt || '').trim();
        const hasLegal = (Number(st.legal90Unique) || 0) > 0;
        const legalDefensePending =
            isOwner && hasLegal && latestLegalAt && (!defenseAt || defenseAt < latestLegalAt);
        const ms48 = 48 * 60 * 60 * 1000;
        const legalDeadlineMs = (() => {
            const t = Date.parse(latestLegalAt);
            return Number.isFinite(t) ? t + ms48 : NaN;
        })();
        const legalHoursLeft = (() => {
            if (!Number.isFinite(legalDeadlineMs)) return null;
            const msLeft = Math.max(0, legalDeadlineMs - Date.now());
            return Math.max(1, Math.ceil(msLeft / 3600000));
        })();
        const ownerPill = isOwner
            ? this._renderPill(
                  ui.sourcesPillOwner,
                  'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-800/60'
              )
            : '';
        const statusPills = [
            isReported
                ? this._renderPill(
                      ui.sourcesGlobalReportedPill || 'Reported',
                      'bg-amber-50 dark:bg-amber-950/25 text-amber-950 dark:text-amber-100 border-amber-200 dark:border-amber-800'
                  )
                : '',
            (Number(st.legal90Unique) || 0) > 0
                ? this._renderPill(
                      ui.sourcesGlobalDisputePill || 'Dispute',
                      'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  )
                : '',
            (() => {
                try {
                    const ref = store.getActivePublicTreeRef?.();
                    if (!ref) return '';
                    if (String(ref.pub) !== String(st.ownerPub) || String(ref.universeId) !== String(st.universeId)) return '';
                    const seeds = store.state.nostrLiveSeeds;
                    const lbl = ui.treeNetworkHealthSeedsLabel || 'Seeds';
                    return this._renderPill(
                        `${lbl}: ${seeds == null ? '—' : String(seeds)}`,
                        'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    );
                } catch {
                    return '';
                }
            })()
        ]
            .filter(Boolean)
            .join('');

        const descHtml = desc
            ? `<p class="m-0 mt-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-3">${this._escText(desc)}</p>`
            : '';
        const sharePillHtml = r.shareCode
            ? this._renderPill(
                  `#${r.shareCode}`,
                  'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              )
            : '';
        const authorLine = resolveDirectoryAuthorLabel(r);
        const authorHtml = authorLine
            ? `<p class="m-0 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-semibold">${this._escText(
                  ui.sourcesGlobalBy || 'by'
              )} ${this._escText(authorLine)}</p>`
            : '';

        return `<div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex flex-wrap gap-2 items-center">
                        <button type="button" data-action="global-open" data-owner-pub="${this._escAttr(
                            r.ownerPub
                        )}" data-universe-id="${this._escAttr(r.universeId)}" data-share-code="${this._escAttr(
            r.shareCode || ''
        )}"${isOwner ? ' data-edit-own="1"' : ''} class="p-0 m-0 bg-transparent border-0 cursor-pointer text-left text-sm font-black text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 hover:underline">🌍 ${this._escText(
            r.title
        )}</button>
                        ${this._renderPill(
                            ui.sourcesPillInternet || 'Internet',
                            'bg-sky-50 dark:bg-sky-950/25 text-sky-900 dark:text-sky-200 border-sky-200/70 dark:border-sky-800/60'
                        )}
                        ${ownerPill}
                        ${sharePillHtml}
                        ${savedLangPills}
                    </div>
                    ${authorHtml}
                    ${descHtml}
                    ${
                        isReported
                            ? `<p class="m-0 mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">${this._escText(
                                  ui.sourcesGlobalHiddenHint ||
                                      'Community signals hide this listing from the public directory; only you (the owner) see it here.'
                              )}</p>`
                            : ''
                    }
                    ${
                        legalDefensePending
                            ? `<p class="m-0 mt-2 text-[10px] text-amber-900 dark:text-amber-100/90 leading-snug font-semibold">${this._escText(
                                  (st.legalAfter48h
                                      ? ui.sourcesLegalDisputeOwnerAfter48h ||
                                        'More than 48 hours since the legal notice without your signed owner response. The listing stays off the public directory; sign below to record your position.'
                                      : (ui.sourcesLegalDisputeOwnerBefore48h ||
                                            'Legal claim: others do not see this listing in the directory until it is resolved. About {hours} hour(s) left to submit your signed owner response under ⋯.'
                                        ).replace(/\{hours\}/g, String(legalHoursLeft ?? '48'))
                                  ) || ''
                              )}</p>`
                            : ''
                    }
                </div>
                <div class="flex gap-2 shrink-0 items-center">
                    <button type="button" data-action="global-vote" data-vote="up" data-owner-pub="${this._escAttr(
                        r.ownerPub
                    )}" data-universe-id="${this._escAttr(r.universeId)}" class="w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
            liked
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm dark:bg-emerald-600 dark:border-emerald-500 dark:text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.97]'
        }" aria-label="${voteUpLbl}">
                        ${
                            liked
                                ? `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="block">
                                    <path fill="currentColor" d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"/>
                                  </svg>`
                                : `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="block">
                                    <path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"/>
                                  </svg>`
                        }
                    </button>
                    <span class="min-h-10 px-3 py-2 rounded-xl text-sm font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 border border-slate-200 dark:border-slate-700 tabular-nums" aria-label="${this._escAttr(
                        ui.sourcesGlobalVote || ui.sourcesGlobalVoteUp
                    )}">${String(votes == null ? 0 : Math.max(0, votes))}</span>
                    <button type="button" data-action="toggle-row-actions" data-key="${this._escAttr(
                        key
                    )}" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors text-sm font-black" aria-expanded="${open ? 'true' : 'false'}" aria-label="${this._escAttr(
            ui.navMore || ui.more
        )}">⋯</button>
                    <button data-action="load-source" data-id="${this._escAttr(
                        s?.id
                    )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-sm ring-1 ring-amber-600/40 dark:ring-amber-400/50">${this._escText(
            ui.sourceLoad
        )}</button>
                </div>
            </div>
            ${
                open
                    ? `<div class="mt-3 space-y-2">
                        ${statusPills ? `<div class="flex flex-wrap gap-2 items-center">${statusPills}</div>` : ''}
                        <div class="flex flex-wrap gap-2">
                            ${
                                isOwner
                                    ? ''
                                    : `<button type="button" data-action="global-report" data-owner-pub="${this._escAttr(
                                          r.ownerPub
                                      )}" data-universe-id="${this._escAttr(
                                          r.universeId
                                      )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-amber-50 dark:bg-amber-950/25 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-950 dark:text-amber-100 border border-amber-200 dark:border-amber-800">${this._escText(
                                          ui.sourcesGlobalReport || 'Report'
                                      )} ⚠</button>`
                            }
                            ${
                                legalDefensePending
                                    ? `<button type="button" data-action="global-legal-defense" data-owner-pub="${this._escAttr(
                                          r.ownerPub
                                      )}" data-universe-id="${this._escAttr(
                                          r.universeId
                                      )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-900 dark:border-white hover:opacity-95">${this._escText(
                                          ui.sourcesGlobalLegalDefenseButton || 'Respond to legal dispute (owner)'
                                      )}</button>`
                                    : ''
                            }
                            <button type="button" data-action="remove-source" data-id="${this._escAttr(
                                s?.id
                            )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-900/20">${this._escText(
                                ui.sourcesGlobalRemove || ui.sourceRemove || 'Uninstall'
                            )}</button>
                        </div>
                    </div>`
                    : ''
            }
        </div>`;
    },

    _renderItemInternet(ui, r, { localInfo = null } = {}) {
        const internetLangs = Array.isArray(r?.languages) ? r.languages : [];
        const internetLangPills = languagePillsHtml(internetLangs, (s) => this._escText(s));
        const openLbl = this._escAttr(ui.sourcesGlobalOpenTree || ui.sourceLoad);
        const voteUpLbl = this._escAttr(ui.sourcesGlobalVoteUp || ui.sourcesGlobalVote);
        const reportLbl = this._escAttr(ui.sourcesGlobalReport);
        const installLbl = this._escAttr(ui.sourcesGlobalInstall || ui.sourcesInstall);
        const editOwnLbl = this._escAttr(ui.sourcesGlobalEditOwnTree || ui.navConstruct || 'Edit');
        const removeLbl = this._escAttr(ui.sourcesGlobalRemove || ui.sourceRemove);
        const by = r?.ownerPub ? resolveDirectoryAuthorLabel(r) : '';
        const author = String(r?.authorName || '').trim();
        const desc = String(r?.description || '').trim();
        const st = this._computeDirectoryRowState(r);
        const ownerPub = st.ownerPub;
        const isReported = st.isReported;
        const m = this._getRowMetrics(r);
        const votes = Number.isFinite(Number(m?.votes)) ? Number(m.votes) : null;
        const liked = (() => {
            try {
                const pair = store.getNetworkUserPair?.();
                const pub = String(pair?.pub || '').trim();
                if (pub) {
                    const lsKey = this._voteKey(st.ownerPub, st.universeId, pub);
                    return this._lsGet(lsKey) === '1';
                }
                const fallback = this._voteKeyFallback(st.ownerPub, st.universeId);
                return this._lsGet(fallback) === '1';
            } catch {
                return false;
            }
        })();
        const isOwner = (() => {
            try {
                return !!(ownerPub && store.getNostrPublisherPair?.(ownerPub)?.priv);
            } catch {
                return false;
            }
        })();
        const latestLegalAt = String(st.legalLatestAt || '').trim();
        const defenseAt = String(st.legalOwnerDefenseLatestAt || '').trim();
        const hasLegal = (Number(st.legal90Unique) || 0) > 0;
        const legalDefensePending =
            isOwner && hasLegal && latestLegalAt && (!defenseAt || defenseAt < latestLegalAt);
        const ms48 = 48 * 60 * 60 * 1000;
        const legalDeadlineMs = (() => {
            const t = Date.parse(latestLegalAt);
            return Number.isFinite(t) ? t + ms48 : NaN;
        })();
        const legalHoursLeft = (() => {
            if (!Number.isFinite(legalDeadlineMs)) return null;
            const msLeft = Math.max(0, legalDeadlineMs - Date.now());
            return Math.max(1, Math.ceil(msLeft / 3600000));
        })();
        const ownerPill = isOwner
            ? this._renderPill(
                  ui.sourcesPillOwner,
                  'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-800/60'
              )
            : '';
        const communityEntry = (() => {
            try {
                const url = formatNostrTreeUrl(st.ownerPub, st.universeId);
                const comm = store.value.communitySources || [];
                return comm.find((s) => String(s?.url || '') === String(url)) || null;
            } catch {
                return null;
            }
        })();
        const isCommunityInstalled = !!communityEntry;
        const primaryLbl = isOwner ? editOwnLbl : isCommunityInstalled ? removeLbl : installLbl;
        const statusPills = [
            isReported
                ? this._renderPill(
                      ui.sourcesGlobalReportedPill || 'Reported',
                      'bg-amber-50 dark:bg-amber-950/25 text-amber-950 dark:text-amber-100 border-amber-200 dark:border-amber-800'
                  )
                : ''
            ,
            (Number(st.legal90Unique) || 0) > 0
                ? this._renderPill(
                      ui.sourcesGlobalDisputePill || 'Dispute',
                      'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  )
                : ''
            ,
            (() => {
                try {
                    const ref = store.getActivePublicTreeRef?.();
                    if (!ref) return '';
                    if (String(ref.pub) !== String(st.ownerPub) || String(ref.universeId) !== String(st.universeId)) return '';
                    const seeds = store.state.nostrLiveSeeds;
                    const lbl = ui.treeNetworkHealthSeedsLabel || 'Seeds';
                    return this._renderPill(
                        `${lbl}: ${seeds == null ? '—' : String(seeds)}`,
                        'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    );
                } catch {
                    return '';
                }
            })()
        ]
            .filter(Boolean)
            .join('');

        const key = `internet:${String(r?.ownerPub || '')}/${String(r?.universeId || '')}`;
        const open = !!(key && this._rowActionsOpen && this._rowActionsOpen.has(key));
        const localActions = localInfo?.id
            ? `<div class="flex flex-wrap gap-2">
                    <button type="button" data-action="tree-info" data-id="${this._escAttr(
                        localInfo.id
                    )}" data-name="${this._escAttr(localInfo.name || '')}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">${this._escText(
                        ui.treesViewTreeInfoButton || ui.treeInfoModalTitle || 'Tree information'
                    )}</button>
                    <button type="button" data-action="export-local" data-id="${this._escAttr(
                        localInfo.id
                    )}" data-name="${this._escAttr(localInfo.name || '')}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30">${this._escText(
                        ui.sourceExport || 'Export'
                    )}</button>
                </div>`
            : '';

        return `<div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex flex-wrap gap-2 items-center">
                        <button type="button" data-action="global-open" data-owner-pub="${this._escAttr(
                            r?.ownerPub
                        )}" data-universe-id="${this._escAttr(
            r?.universeId
        )}" data-share-code="${this._escAttr(
            r?.shareCode || ''
        )}"${isOwner ? ' data-edit-own="1"' : ''} class="p-0 m-0 bg-transparent border-0 cursor-pointer text-left text-sm font-black text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 hover:underline">🌍 ${this._escText(
                            r?.title
                        )}</button>
                        ${this._renderPill(
                            ui.sourcesPillInternet || 'Internet',
                            'bg-sky-50 dark:bg-sky-950/25 text-sky-900 dark:text-sky-200 border-sky-200/70 dark:border-sky-800/60'
                        )}
                        ${ownerPill}
                        ${
                            r?.shareCode
                                ? this._renderPill(
                                      `#${r.shareCode}`,
                                      'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                  )
                                : ''
                        }
                        ${internetLangPills}
                    </div>
                    <p class="m-0 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-semibold">${this._escText(
                        ui.sourcesGlobalBy || 'by'
                    )} ${this._escText(author || by)}</p>
                    ${
                        desc
                            ? `<p class="m-0 mt-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-3">${this._escText(
                                  desc
                              )}</p>`
                            : ''
                    }
                    ${
                        isReported
                            ? `<p class="m-0 mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">${
                                  this._escText(
                                      ui.sourcesGlobalHiddenHint ||
                                          'Community signals hide this listing from the public directory; only you (the owner) see it here.'
                                  )
                              }</p>`
                            : ''
                    }
                    ${
                        legalDefensePending
                            ? `<p class="m-0 mt-2 text-[10px] text-amber-900 dark:text-amber-100/90 leading-snug font-semibold">${this._escText(
                                  (st.legalAfter48h
                                      ? ui.sourcesLegalDisputeOwnerAfter48h ||
                                        'More than 48 hours since the legal notice without your signed owner response. The listing stays off the public directory; sign below to record your position.'
                                      : (ui.sourcesLegalDisputeOwnerBefore48h ||
                                            'Legal claim: others do not see this listing in the directory until it is resolved. About {hours} hour(s) left to submit your signed owner response under ⋯.'
                                        ).replace(/\{hours\}/g, String(legalHoursLeft ?? '48'))
                                  ) || ''
                              )}</p>`
                            : ''
                    }
                </div>
                <div class="flex flex-wrap gap-2 items-center justify-end shrink-0 max-w-full">
                    <button type="button" data-action="global-vote" data-vote="up" data-owner-pub="${this._escAttr(
                        r?.ownerPub
                    )}" data-universe-id="${this._escAttr(
            r?.universeId
        )}" class="w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
            liked
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm dark:bg-emerald-600 dark:border-emerald-500 dark:text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.97]'
        }" aria-label="${this._escAttr(voteUpLbl)}">
                        ${
                            liked
                                ? `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="block">
                                    <path fill="currentColor" d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"/>
                                  </svg>`
                                : `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="block">
                                    <path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"/>
                                  </svg>`
                        }
                    </button>
                    <span class="min-h-10 px-3 py-2 rounded-xl text-sm font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 border border-slate-200 dark:border-slate-700 tabular-nums" aria-label="${this._escAttr(
                        ui.sourcesGlobalVote || ui.sourcesGlobalVoteUp
                    )}">${String(votes == null ? 0 : Math.max(0, votes))}</span>
                    <button type="button" data-action="toggle-row-actions" data-key="${this._escAttr(
                        key
                    )}" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors text-sm font-black" aria-expanded="${open ? 'true' : 'false'}" aria-label="${this._escAttr(
                        ui.navMore || ui.more
                    )}">⋯</button>
                    ${
                        isOwner
                            ? `<button type="button" data-action="global-open" data-edit-own="1" data-owner-pub="${this._escAttr(
                                  r?.ownerPub
                              )}" data-universe-id="${this._escAttr(
                                  r?.universeId
                              )}" data-share-code="${this._escAttr(
                                  r?.shareCode || ''
                              )}" class="arborito-cta-emerald min-h-10 px-3 py-2 rounded-xl text-xs font-black shadow-sm">${this._escText(
                                  primaryLbl
                              )}</button>`
                            : isCommunityInstalled
                              ? `<button type="button" data-action="remove-source" data-id="${this._escAttr(
                                    communityEntry?.id
                                )}" class="arborito-cta-rose min-h-10 px-3 py-2 rounded-xl text-xs font-black shadow-sm">${this._escText(
                                    primaryLbl
                                )}</button>`
                              : `<button type="button" data-action="install-source" data-owner-pub="${this._escAttr(
                                    r?.ownerPub
                                )}" data-universe-id="${this._escAttr(
                                    r?.universeId
                                )}" class="arborito-cta-emerald min-h-10 px-3 py-2 rounded-xl text-xs font-black shadow-sm">${this._escText(
                                    primaryLbl
                                )}</button>`
                    }
                </div>
            </div>
            ${
                open
                    ? `<div class="mt-3 space-y-2">
                        ${statusPills ? `<div class="flex flex-wrap gap-2 items-center">${statusPills}</div>` : ''}
                        ${localActions}
                        <div class="flex flex-wrap gap-2">
                            ${
                                isOwner
                                    ? ''
                                    : `<button type="button" data-action="global-report" data-owner-pub="${this._escAttr(
                                          r?.ownerPub
                                      )}" data-universe-id="${this._escAttr(
                                          r?.universeId
                                      )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-amber-50 dark:bg-amber-950/25 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-950 dark:text-amber-100 border border-amber-200 dark:border-amber-800">${this._escText(
                                          reportLbl
                                      )} ⚠</button>`
                            }
                            ${
                                legalDefensePending
                                    ? `<button type="button" data-action="global-legal-defense" data-owner-pub="${this._escAttr(
                                          r?.ownerPub
                                      )}" data-universe-id="${this._escAttr(
                                          r?.universeId
                                      )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-900 dark:border-white hover:opacity-95">${this._escText(
                                          ui.sourcesGlobalLegalDefenseButton || 'Respond to legal dispute (owner)'
                                      )}</button>`
                                    : ''
                            }
                        </div>
                    </div>`
                    : ''
            }
        </div>`;
    },

    _renderUnifiedAddLink(ui) {
        return `<div class="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
            <label class="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">${this._escText(
                ui.sourcesOneLinkLabel || 'Add a tree'
            )}</label>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-snug">${this._escText(
                ui.sourcesOneLinkHint || 'Type an 8-character share code or paste the full link—the app figures it out.'
            )}</p>
            <div class="flex gap-2">
                <input id="inp-tree-link" type="text" autocomplete="off" placeholder="${this._escAttr(
                    ui.sourcesOneLinkPlaceholder || 'Tree name or share code'
                )}" class="arborito-input flex-1">
                <button type="button" data-action="add-tree-link" class="arborito-cta-purple px-6 py-2 rounded-xl font-bold shadow-md active:scale-95 transition-transform text-lg shrink-0" title="${this._escAttr(
                    ui.sourceAdd || 'Add'
                )}">+</button>
            </div>
        </div>`;
    },

};
