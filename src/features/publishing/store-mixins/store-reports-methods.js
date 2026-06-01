import { parseNostrTreeUrl } from '../../nostr/nostr-refs.js';

/** Local toasts for tree creators about new directory reports / urgent user inbox messages. */
export const storeReportsMethods = {
    /**
     * Best-effort local notification for creators.
     * Reports live in the global directory; there is no OS push — we check when a tree loads on this device.
     * Legal (copyright) path: matches the brainstorming “notify owner + 48h window” idea: we nudge once per newest legal `at`.
     */
    async maybeNotifyOwnerAboutNewDirectoryReports(source) {
        let notified = false;
        try {
            if (!source || typeof source !== 'object') return false;
            if (String(source.origin || '') !== 'nostr') return false;
            const url = String(source.url || '');
            const ref = parseNostrTreeUrl(url);
            const pub = String(ref?.pub || '');
            const universeId = String(ref?.universeId || '');
            if (!pub || !universeId) return false;
            const pair = this.getNostrPublisherPair?.(pub);
            if (!pair?.priv) return false; // not the creator on this device
            const net = this.nostr;
            if (!net) return false;

            // 1) Legal dispute — needs owner response (newer than last signed defense, if any)
            if (typeof net.listTreeLegalReportsOnce === 'function' && typeof net.loadTreeLegalOwnerDefenseOnce === 'function') {
                try {
                    const legalRows = await net.listTreeLegalReportsOnce({ ownerPub: pub, universeId, max: 40 });
                    const latestLegalAt = String(legalRows?.[0]?.at || '');
                    if (latestLegalAt) {
                        const def = await net.loadTreeLegalOwnerDefenseOnce({ ownerPub: pub, universeId });
                        const defAt = String(def?.latestLegalReportAt || '');
                        const needsOwner = !defAt || defAt < latestLegalAt;
                        if (needsOwner) {
                            const lk = `arborito-dir-legal-dispute-last-toast-v1:${pub}/${universeId}`;
                            let lastL = '';
                            try {
                                lastL = String(localStorage.getItem(lk) || '');
                            } catch {
                                lastL = '';
                            }
                            if (!lastL || String(latestLegalAt) > String(lastL)) {
                                try {
                                    localStorage.setItem(lk, latestLegalAt);
                                } catch {
                                    /* ignore */
                                }
                                this.notify(
                                    this.ui.creatorLegalDisputeToast ||
                                        'Legal notice on your tree: the public directory no longer shows this listing to others until you respond. From Trees, open your row ⋯ → owner response (signed). You have about 48 hours to act.',
                                    false
                                );
                                notified = true;
                            }
                        }
                    }
                } catch {
                    /* ignore */
                }
            }

            // 2) Community reports (non-legal)
            if (typeof net.listTreeReportsOnce === 'function') {
                const key = `arborito-dir-reports-last-notified-v1:${pub}/${universeId}`;
                let last = '';
                try {
                    last = String(localStorage.getItem(key) || '');
                } catch {
                    last = '';
                }

                const rows = await net.listTreeReportsOnce({ ownerPub: pub, universeId, max: 80 });
                const latestAt = String(rows?.[0]?.at || '');
                if (latestAt && (!last || String(latestAt) > String(last))) {
                    try {
                        localStorage.setItem(key, latestAt);
                    } catch {
                        /* ignore */
                    }

                    const n = Array.isArray(rows) ? rows.length : 1;
                    const reportsMsg =
                        n === 1
                            ? this.ui.creatorReportsToastOne ||
                              'Your tree received a recent directory report. Check Trees / reports if relevant.'
                            : (this.ui.creatorReportsToastMany || 'Your tree received {n} recent directory reports. Check Trees / reports if relevant.').replace(
                                  '{n}',
                                  String(n)
                              );
                    this.notify(this.ui.creatorReportsToast || reportsMsg, false);
                    notified = true;
                }
            }

            return notified;
        } catch {
            return notified;
        }
    },

    /**
     * Local notice to owner: “urgent” user message (`urgentUserReports` on Nostr), separate from community report.
     */
    async maybeNotifyOwnerAboutUrgentUserInbox(source) {
        try {
            if (!source || typeof source !== 'object') return false;
            if (String(source.origin || '') !== 'nostr') return false;
            const url = String(source.url || '');
            const ref = parseNostrTreeUrl(url);
            const pub = String(ref?.pub || '');
            const universeId = String(ref?.universeId || '');
            if (!pub || !universeId) return false;
            const pair = this.getNostrPublisherPair?.(pub);
            if (!pair?.priv) return false;
            const net = this.nostr;
            if (!net || typeof net.listTreeUrgentUserMessagesOnce !== 'function') return false;
            const rows = await net.listTreeUrgentUserMessagesOnce({ ownerPub: pub, universeId, max: 40 });
            const latestAt = String(rows?.[0]?.at || '');
            if (!latestAt) return false;
            const key = `arborito-dir-urgent-user-last-toast-v1:${pub}/${universeId}`;
            let last = '';
            try {
                last = String(localStorage.getItem(key) || '');
            } catch {
                last = '';
            }
            if (last && String(latestAt) <= String(last)) return false;
            try {
                localStorage.setItem(key, latestAt);
            } catch {
                /* ignore */
            }
            this.notify(
                this.ui.creatorUrgentUserMessageToast ||
                    'A visitor left an urgent signed message for you on the network (not the app operator). Open “Report this tree” from the readme or sources context to review network metadata if needed.',
                false
            );
            return true;
        } catch {
            return false;
        }
    }
};
