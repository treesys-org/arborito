import { getArboritoStore as store } from '../../../../../../core/store-singleton.js';
import { formatNostrTreeUrl } from '../../../../../nostr/api/nostr-refs.js';
import { finishSourcesLoadSession, captureHadCurriculumBeforeLoad } from '../../../sources-session.js';
import { promptTreeLegalReportEvidence } from '../../../../../publishing/api/tree-legal-report-evidence-prompts.js';
import { findCommunitySourceByUrl } from '../sources-helpers.js';
import {
    directoryRowForCommunitySource,
    rerankGlobalDirectoryRowsOnly,
    runGlobalDirectoryFetch,
    applyGlobalDirectorySortAndMetrics,
} from '../sources-directory-fetch.js';
import {
    sourcesLsGet,
    sourcesLsSet,
    sourcesLsDel,
    sourcesVoteKey,
    sourcesVoteKeyFallback,
    sourcesCooldownOk,
} from '../sources-local-storage.js';
import {
    ensureNostrUserFirstSeen,
    usageKey,
    withSourcesNetworkLoad,
} from '../sources-actions-support.js';
import {
    isReporterWeeklyCommunityReportLimitReached,
    recordReporterWeeklyCommunityReport,
    reporterCommunityReportWeight,
} from '../sources-moderation-limits.js';
import { computeReportSignalsFromRows } from '../sources-directory-fetch.js';
import { generateLegalCaseId } from '../../../../../publishing/api/legal-case-id.js';

/** @returns {Promise<boolean>} whether the action was handled */
export async function runPublishAction(ctx, action, fields = {}) {
    const id = fields.id != null ? String(fields.id) : '';

    if (action === 'install-source') {
        const ownerPub = String(fields.ownerPub || '').trim();
        const universeId = String(fields.universeId || '').trim();
        if (!ownerPub || !universeId) {
            try {
                console.warn('[Arborito] install-source missing data', { ownerPub, universeId });
            } catch {
                /* ignore */
            }
            store.notify(store.ui.sourcesInstallFailed || 'No se pudo instalar.', true);
            return true;
        }
        const url = formatNostrTreeUrl(ownerPub, universeId);
        const dir = directoryRowForCommunitySource(ctx.globalDirRows, url);
        const relayFromDir =
            Array.isArray(dir?.recommendedRelays) && dir.recommendedRelays.length
                ? { recommendedRelays: dir.recommendedRelays }
                : {};
        const hasListMeta = !!(dir && (dir.title || dir.authorName || dir.description || dir.shareCode));
        const installOpts = hasListMeta
            ? {
                  resolvedNostrTreeUrl: url,
                  listMeta: {
                      title: String(dir.title || '').trim(),
                      authorName: String(dir.authorName || '').trim(),
                      description: String(dir.description || '').trim(),
                      contentKind: String(dir.contentKind || '').trim() || undefined,
                  },
                  codeLabel: String(dir.shareCode || '').trim() || undefined,
                  ...relayFromDir,
              }
            : Object.keys(relayFromDir).length
              ? { resolvedNostrTreeUrl: url, ...relayFromDir }
              : null;
        const out = installOpts ? store.addCommunitySource(url, installOpts) : store.addCommunitySource(url);
        const ok = out && typeof out === 'object' ? out.ok !== false : !!out;
        if (!ok) {
            if (out && out.reason === 'duplicate' && out.existing?.id) {
                store.notify(store.ui.sourcesInstalledToast || 'Ya instalado, cargando…', false);
                const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
                const loaded = await withSourcesNetworkLoad(ctx, () =>
                    store.loadAndSmartMerge(out.existing.id)
                );
                if (loaded) finishSourcesLoadSession(ctx.modalApi, { hadCurriculumBeforeLoad });
                else ctx.bump();
                return true;
            }
            store.notify(store.ui.sourcesInstallFailed || 'No se pudo instalar.', true);
            return true;
        }
        store.notify(store.ui.sourcesInstalledToast || 'Instalado.', false);
        const loaded = await withSourcesNetworkLoad(ctx, () => store.maybeAutoLoadCommunityAfterAdd(out));
        if (!loaded) ctx.bump();
        return true;
    }

    if (action === 'load-source') {
        const cid = String(id || '').trim();
        if (!cid) return true;
        const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
        const ok = await withSourcesNetworkLoad(ctx, () => store.loadAndSmartMerge(cid));
        if (ok) finishSourcesLoadSession(ctx.modalApi, { hadCurriculumBeforeLoad });
        else ctx.bump();
        return true;
    }

    if (action === 'remove-source') {
        const ui = store.ui;
        if (
            await store.confirm(
                ui.sourcesDeleteTreeLinkConfirm ||
                    'Uninstall this tree? It stays online, you can install it again any time.'
            )
        ) {
            const wasActive = store.state.activeSource?.id === id;
            store.removeCommunitySource(id);
            if (!wasActive) ctx.bump();
        }
        return true;
    }

    if (action === 'open-author-license') {
        const cur = store.value.modal;
        const payload = { fromSources: true, sourcesFocusTab: ctx.activeTab };
        if (cur && typeof cur === 'object' && cur.fromConstructionMore) payload.fromConstructionMore = true;
        if (cur && typeof cur === 'object' && cur.fromMobileMore) payload.fromMobileMore = true;
        store.openAuthorLicenseOverlay(payload);
        return true;
    }

    if (action === 'quick-alias' && fields.alias) {
        void store.requestAddCommunitySource(String(fields.alias));
        ctx.bump();
        return true;
    }

    if (action === 'global-filter') {
        const allowed = new Set(['discover', 'recent', 'voted', 'used7', 'active']);
        const next = String(fields.filter || '').trim();
        const filter = allowed.has(next) ? next : 'discover';
        ctx.setGlobalDirFilter(filter);
        void applyGlobalDirectorySortAndMetrics(
            { ...ctx.directoryState(), globalDirFilter: filter },
            ctx.directorySetters(),
            { onUpdate: ctx.bump }
        );
        return true;
    }

    if (action === 'lang-filter') {
        const raw = String(fields.lang || '*').trim().toUpperCase();
        ctx.setSourcesLangFilter(raw === '*' || !raw ? '*' : raw);
        ctx.bump();
        return true;
    }

    if (action === 'global-refresh') {
        void runGlobalDirectoryFetch(ctx.directoryState(), ctx.directorySetters(), { onUpdate: ctx.bump });
        return true;
    }

    if (action === 'global-open') {
        const ownerPub = String(fields.ownerPub || '');
        const universeId = String(fields.universeId || '');
        const shareCode = String(fields.shareCode || '').trim();
        const editOwn = String(fields.editOwn || '') === '1';
        if (!ownerPub || !universeId) return true;
        if (editOwn) {
            const ap = store.getNostrPublisherPair?.(ownerPub);
            if (!(ap && ap.priv)) {
                store.notify(
                    store.ui.sourcesGlobalEditOwnDenied ||
                        'Only this device with the publisher key can edit this tree.',
                    true
                );
                return true;
            }
        }
        if (store.isNostrTreeMaintainerBlocked(ownerPub, universeId)) {
            store.notify(
                store.ui.maintainerBlocklistLoadRefused ||
                    'This tree is blocked in this app build (maintainer list).',
                true
            );
            return true;
        }
        const url = formatNostrTreeUrl(ownerPub, universeId);
        const dirRow = directoryRowForCommunitySource(ctx.globalDirRows, url);
        const addOpts = {
            resolvedNostrTreeUrl: url,
            codeLabel: shareCode || (dirRow?.shareCode ? String(dirRow.shareCode).trim() : null) || null,
        };
        if (dirRow && (dirRow.title || dirRow.authorName || dirRow.description || dirRow.shareCode)) {
            addOpts.listMeta = {
                title: String(dirRow.title || '').trim(),
                authorName: String(dirRow.authorName || '').trim(),
                description: String(dirRow.description || '').trim(),
            };
        }
        if (Array.isArray(dirRow?.recommendedRelays) && dirRow.recommendedRelays.length) {
            addOpts.recommendedRelays = dirRow.recommendedRelays;
        }
        try {
            const added = store.addCommunitySource(url, addOpts);
            if (added && added.ok === false && added.reason === 'maintainer_blocklist') {
                store.notify(
                    store.ui.maintainerBlocklistAddRefused ||
                        store.ui.maintainerBlocklistLoadRefused ||
                        'This tree is blocked in this app build (maintainer list).',
                    true
                );
                return true;
            }
        } catch {
            /* ignore */
        }
        try {
            const net = store.nostr;
            if (net && typeof net.putTreeUsagePing === 'function') {
                const pair = await store.ensureNetworkUserPair?.();
                if (pair?.pub) {
                    const okCd = sourcesCooldownOk(
                        usageKey(ownerPub, universeId, pair.pub),
                        22 * 60 * 60 * 1000
                    );
                    if (okCd) void net.putTreeUsagePing({ pair, ownerPub, universeId });
                }
            }
        } catch {
            /* ignore */
        }
        const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
        const loadedOk = await withSourcesNetworkLoad(ctx, async () => {
            const src = findCommunitySourceByUrl(store.value.communitySources, url);
            const ephemeralRelays =
                Array.isArray(dirRow?.recommendedRelays) && dirRow.recommendedRelays.length
                    ? { recommendedRelays: dirRow.recommendedRelays }
                    : {};
            return src
                ? store.loadData(src, true)
                : store.loadData({
                      id: `nostr-open-${Date.now()}`,
                      name: `Public · ${ownerPub.slice(0, 10)}…`,
                      url,
                      type: 'community',
                      origin: 'nostr',
                      ...ephemeralRelays,
                  });
        });
        if (loadedOk) {
            if (editOwn && store.canOpenConstruction?.()) {
                if (!store.hasAcceptedAuthorLicense?.()) store.acceptAuthorLicense?.();
                store.update({ constructionMode: true });
            }
            finishSourcesLoadSession(ctx.modalApi, { hadCurriculumBeforeLoad });
        }
        return true;
    }

    if (action === 'global-vote') {
        const ownerPub = String(fields.ownerPub || '');
        const universeId = String(fields.universeId || '');
        const dir = String(fields.vote || 'up');
        if (!ownerPub || !universeId) return true;
        const net = store.nostr;
        const canNetworkVote = !!(net && typeof net.putTreeVote === 'function');
        const pair = canNetworkVote ? await store.ensureNetworkUserPair?.() : null;
        const pub = String(pair?.pub || '').trim();
        const lsKey = pub
            ? sourcesVoteKey(ownerPub, universeId, pub)
            : sourcesVoteKeyFallback(ownerPub, universeId);
        const prev = sourcesLsGet(lsKey) === '1';
        const finalVote = dir === 'up' ? !prev : false;

        if (canNetworkVote && pub) {
            const firstSeen = ensureNostrUserFirstSeen();
            const ageMs = Date.now() - firstSeen;
            const ageOk = ageMs >= 5 * 60 * 1000;
            const cdOk = sourcesCooldownOk(`arborito-tree-vote-cooldown:${pub}`, 6000);
            if (ageOk && cdOk) {
                store.notify(store.ui.sourcesGlobalPowWorking, false);
                try {
                    await net.putTreeVote({ pair, ownerPub, universeId, vote: finalVote });
                } catch (e) {
                    console.warn('putTreeVote', e);
                }
            }
        }
        if (finalVote) sourcesLsSet(lsKey, '1');
        else sourcesLsDel(lsKey);

        const k = `${ownerPub}/${universeId}`;
        ctx.setGlobalDirMetrics((prevMetrics) => {
            const cur = prevMetrics[k] || {};
            const base = Number(cur.votes) || 0;
            const delta = (finalVote ? 1 : 0) - (prev ? 1 : 0);
            return { ...prevMetrics, [k]: { ...cur, votes: Math.max(0, base + delta) } };
        });
        rerankGlobalDirectoryRowsOnly(ctx.directoryState(), ctx.directorySetters());
        ctx.bump();
        return true;
    }

    if (action === 'global-report') {
        const ownerPub = String(fields.ownerPub || '');
        const universeId = String(fields.universeId || '');
        if (!ownerPub || !universeId) return true;
        if (store.getNostrPublisherPair?.(ownerPub)?.priv) return true;
        const net = store.nostr;
        if (!net || typeof net.putTreeReport !== 'function') return true;
        const pair = await store.ensureNetworkUserPair?.();
        if (!pair?.pub) return true;
        ensureNostrUserFirstSeen();
        const okGlobal = sourcesCooldownOk(`arborito-tree-report-cd:${pair.pub}`, 9000);
        if (!okGlobal) return true;
        const okTree = sourcesCooldownOk(
            `arborito-tree-report-tree:${ownerPub}/${universeId}:${pair.pub}`,
            22 * 60 * 60 * 1000
        );
        if (!okTree) {
            store.notify(store.ui.sourcesGlobalReportTooSoon || 'You already reported this tree recently.', true);
            return true;
        }
        if (isReporterWeeklyCommunityReportLimitReached(pair.pub)) {
            store.notify(
                store.ui.sourcesGlobalReportWeeklyLimit ||
                    'You reached the weekly limit for community reports (3). Legal notices are still available.',
                true
            );
            return true;
        }
        const ui = store.ui;
        const policy = String(ui.treeReportPolicyBody || '').trim();
        const sheetHint = String(ui.treeReportSheetHint || '').trim();
        const reportDialogBody = [policy, sheetHint].filter(Boolean).join('\n\n') || sheetHint;
        const choice = await store.showDialog({
            type: 'choice',
            title: ui.treeReportSheetTitle || ui.sourcesGlobalReport || 'Report',
            body: reportDialogBody,
            confirmText: ui.dialogOkButton || 'OK',
            cancelText: ui.cancel || 'Cancel',
            choices: [
                { id: 'spam', label: ui.treeReportReasonSpam || 'Spam' },
                { id: 'phishing', label: ui.treeReportReasonPhishing || 'Phishing' },
                { id: 'copyright', label: ui.treeReportReasonCopyright || 'Copyright' },
                { id: 'illegal', label: ui.treeReportReasonIllegal || 'Illegal content (legal notice)' },
                { id: 'other', label: ui.treeReportReasonOther || 'Other' },
            ],
        });
        if (!choice) return true;
        const reason = String(choice);
        let note = '';
        if (reason === 'other') {
            const txt = await store.prompt(
                ui.treeReportOtherPlaceholder || 'Short note (optional)',
                '',
                ui.treeReportReasonOther || 'Other'
            );
            note = String(txt || '').trim();
        }
        store.notify(ui.sourcesGlobalPowWorking || 'Verifying…', false);
        /* Copyright and generic illegal content both use the DSA Art. 16
         * notice flow (exact location, substantiation, notifier identity,
         * good-faith declaration). */
        if ((reason === 'copyright' || reason === 'illegal') && typeof net.putTreeLegalReport === 'function') {
            const ev = await promptTreeLegalReportEvidence(store, { reportType: reason });
            if (!ev) return true;
            const caseId = generateLegalCaseId();
            store.notify(ui.sourcesGlobalPowWorking || 'Verifying…', false);
            await net.putTreeLegalReport({
                pair,
                ownerPub,
                universeId,
                entityName: '',
                euAddress: '',
                vatId: '',
                reportType: reason,
                legalGround: ev.legalGround,
                notifierName: ev.notifierName,
                notifierEmail: ev.notifierEmail,
                whereInTree: ev.whereInTree,
                whatWork: ev.whatWork,
                description: ev.description,
                declaration: true,
                links: ev.links,
                caseId,
            });
            const k2 = `${ownerPub}/${universeId}`;
            ctx.setGlobalDirMetrics((prevMetrics) => {
                const cur2 = prevMetrics[k2] || {};
                const baseL = Number(cur2.legal90Unique) || 0;
                const approxAt = new Date().toISOString();
                return {
                    ...prevMetrics,
                    [k2]: {
                        ...cur2,
                        legal90Unique: baseL + 1,
                        legalLatestAt: approxAt,
                        legalOwnerDefenseLatestAt: String(cur2.legalOwnerDefenseLatestAt || ''),
                    },
                };
            });
            store.notify(
                (ui.legalReportSentWithCase || ui.legalReportSent || 'Legal report sent. Case reference: {caseId}.')
                    .replace(/\{caseId\}/g, caseId),
                false
            );
            ctx.bump();
            return true;
        }
        await net.putTreeReport({ pair, ownerPub, universeId, reason, note });
        recordReporterWeeklyCommunityReport(pair.pub);
        const k = `${ownerPub}/${universeId}`;
        ctx.setGlobalDirMetrics((prevMetrics) => {
            const cur = prevMetrics[k] || {};
            const baseU = Number(cur.reports14Unique) || 0;
            const baseS = Number(cur.reportScore) || 0;
            let rw = reason === 'phishing' ? 1.35 : reason === 'copyright' ? 1.25 : 1;
            rw *= reporterCommunityReportWeight(pair.pub);
            return {
                ...prevMetrics,
                [k]: {
                    ...cur,
                    reports14Unique: baseU + 1,
                    reportScore: Math.round((baseS + rw) * 100) / 100,
                },
            };
        });
        ctx.bump();
        return true;
    }

    if (action === 'global-directory-appeal') {
        const ownerPub = String(fields.ownerPub || '').trim();
        const universeId = String(fields.universeId || '').trim();
        if (!ownerPub || !universeId) return true;
        const net = store.nostr;
        if (!net || typeof net.putTreeDirectoryOwnerAppeal !== 'function') return true;
        const pair = store.getNostrPublisherPair?.(ownerPub);
        if (!pair?.priv) {
            store.notify(
                store.ui.sourcesOwnerDirectoryAppealNotOwner ||
                    'Only the tree owner on this device can publish a directory appeal.',
                true
            );
            return true;
        }
        let reportsThroughAt = '';
        if (typeof net.listTreeReportsOnce === 'function') {
            const rows = await net.listTreeReportsOnce({ ownerPub, universeId, max: 1 });
            reportsThroughAt = String(rows?.[0]?.at || '').trim();
        }
        if (!reportsThroughAt) {
            store.notify(
                store.ui.sourcesOwnerDirectoryAppealNoReports ||
                    'No community reports to contest right now.',
                true
            );
            return true;
        }
        const ui = store.ui;
        const statement = await store.prompt(
            ui.sourcesOwnerDirectoryAppealPlaceholder ||
                'Explain what you fixed or why the reports are unfounded (min. 80 characters). This signed statement resets community report scoring for reports up to now.',
            '',
            ui.sourcesOwnerDirectoryAppealButton || 'Contest community reports (owner)'
        );
        const text = String(statement || '').trim();
        if (!text || text.length < 80) {
            if (statement !== null && statement !== undefined) {
                store.notify(
                    ui.sourcesOwnerDirectoryAppealTooShort ||
                        'Please write at least 80 characters so others can understand your response.',
                    true
                );
            }
            return true;
        }
        store.notify(ui.sourcesGlobalPowWorking || 'Verifying…', false);
        const rec = await net.putTreeDirectoryOwnerAppeal({
            pair,
            ownerPub,
            universeId,
            statement: text,
            reportsThroughAt,
        });
        if (!rec) {
            store.notify(ui.sourcesOwnerDirectoryAppealFailed || 'Could not publish the appeal.', true);
            return true;
        }
        const kM = `${ownerPub}/${universeId}`;
        let nextScore = 0;
        let nextUnique = 0;
        if (typeof net.listTreeReportsOnce === 'function') {
            const allRows = await net.listTreeReportsOnce({ ownerPub, universeId, max: 900 });
            const sig = computeReportSignalsFromRows(allRows, {
                daysWindow: 14,
                ignoreBeforeAt: reportsThroughAt,
            });
            nextScore = sig.score;
            nextUnique = sig.unique;
        }
        ctx.setGlobalDirMetrics((prevMetrics) => ({
            ...prevMetrics,
            [kM]: {
                ...(prevMetrics[kM] || {}),
                reports14Unique: nextUnique,
                reportScore: nextScore,
                directoryAppealAt: String(rec.at || new Date().toISOString()),
            },
        }));
        store.notify(ui.sourcesOwnerDirectoryAppealSuccess || 'Appeal published. Community report score was reset.', false);
        ctx.bump();
        return true;
    }

    if (action === 'global-legal-defense') {
        const ownerPub = String(fields.ownerPub || '').trim();
        const universeId = String(fields.universeId || '').trim();
        if (!ownerPub || !universeId) return true;
        const net = store.nostr;
        if (!net || typeof net.putTreeLegalOwnerDefense !== 'function') return true;
        const pair = store.getNostrPublisherPair?.(ownerPub);
        if (!pair?.priv) {
            store.notify(
                store.ui.sourcesGlobalLegalDefenseNotOwner ||
                    'Only the tree owner on this device can sign a response.',
                true
            );
            return true;
        }
        let latestLegalReportAt = '';
        const kM = `${ownerPub}/${universeId}`;
        const curM = ctx.globalDirMetrics[kM] || {};
        latestLegalReportAt = String(curM.legalLatestAt || '').trim();
        if (!latestLegalReportAt && typeof net.listTreeLegalReportsOnce === 'function') {
            const lr = await net.listTreeLegalReportsOnce({ ownerPub, universeId, max: 1 });
            latestLegalReportAt = String(lr?.[0]?.at || '').trim();
        }
        let caseId = String(curM.legalCaseId || '').trim();
        if (!caseId && typeof net.listTreeLegalReportsOnce === 'function') {
            const lr = await net.listTreeLegalReportsOnce({ ownerPub, universeId, max: 1 });
            caseId = String(lr?.[0]?.caseId || '').trim();
        }
        if (!latestLegalReportAt) {
            store.notify(
                store.ui.sourcesGlobalLegalDefenseNoReport ||
                    'Could not load the latest legal timestamp. Try again in a moment.',
                true
            );
            return true;
        }
        const ui = store.ui;
        const consentJudicialShare = await store.confirm(
            ui.legalOwnerDefenseConfirmBody ||
                'Your signed response links to the latest legal report timestamp. If required by law, this device may share minimal metadata with competent authorities. Continue?',
            ui.legalOwnerDefenseConfirmTitle || ui.sourcesGlobalDisputePill || 'Legal dispute',
            true
        );
        if (!consentJudicialShare) return true;
        store.notify(ui.sourcesGlobalPowWorking || 'Verifying…', false);
        const rec = await net.putTreeLegalOwnerDefense({
            pair,
            ownerPub,
            universeId,
            latestLegalReportAt,
            caseId,
            consentJudicialShare: true,
        });
        if (!rec) {
            store.notify(ui.sourcesGlobalLegalDefenseFailed || 'Could not publish owner response.', true);
            return true;
        }
        ctx.setGlobalDirMetrics((prevMetrics) => ({
            ...prevMetrics,
            [kM]: {
                ...(prevMetrics[kM] || {}),
                legalOwnerDefenseLatestAt: String(rec.latestLegalReportAt || latestLegalReportAt),
            },
        }));
        store.notify(
            (ui.legalOwnerDefenseSuccessWithCase || ui.legalOwnerDefenseSuccessToast || 'Owner response published. Case {caseId}.')
                .replace(/\{caseId\}/g, String(rec?.caseId || caseId || '')),
            false
        );
        ctx.bump();
        return true;
    }

    return false;
}
