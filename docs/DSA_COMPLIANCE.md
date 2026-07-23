# DSA compliance map: Regulation (EU) 2022/2065 (Digital Services Act)

This document maps the DSA obligations to what Arborito/Treesys actually implements.
It exists so the position is auditable as we open the alpha to a wider audience. It is engineering
documentation, not legal advice; have counsel review the classification below.

## Service classification (operator position)

- **What Treesys ships:** open-source, local-first client software. Content lives on
  third-party Nostr relays and WebTorrent peers; Treesys operates **no content server**.
- **Where the DSA plausibly bites:** to the extent Treesys is considered an
  intermediary/hosting-like service for the **Discover index** in the app (directory
  listing over relays the user chose, plus build blocklist and algorithmic moderation),
  the operator position is to meet the intermediary and hosting duties that apply at
  this scale, and to document the rest. Relay transport is user-configured; Treesys does
  not operate relays.
- **Size:** Treesys is a micro/small enterprise. Under **Art. 19**, the additional
  online-platform obligations of Section 3 (Arts. 20–28: internal complaint handling,
  out-of-court dispute bodies, trusted flaggers, transparency reports for platforms,
  ad repositories, recommender transparency for platforms…) **do not apply** to
  micro/small enterprises. They are therefore documented as N/A below; some related
  safeguards are implemented anyway (redress paths, PoW gating, no ads or profiling
  recommenders) and described in the table.

## Article-by-article

| DSA provision | Status | Where |
|---------------|--------|-------|
| **Art. 11**: point of contact for authorities | ✅ | Impressum block names the single contact (operator e-mail, languages DE/EN/ES): `locales/*/legal.json` → `impressumDetails`, `dsaContactBody`; rendered in `LegalSection.jsx` |
| **Art. 12**: point of contact for recipients | ✅ | Same contact, explicitly stated for recipients (`dsaContactBody`) |
| **Art. 13**: legal representative | N/A | Operator is established in the EU (Germany, per Impressum) |
| **Art. 14**: terms: content-moderation policies, tools, algorithmic decision-making, in clear language | ✅ | `dsaModerationBody` (EN/ES) describes: read-side proof-of-work gating, report-threshold directory hiding, 48 h legal-dispute window, maintainer build blocklist, owner-moderated forums. Also summarised in the report dialog (`treeReportPolicyBody`) |
| **Art. 15**: transparency reporting (intermediaries) | Exempt | Art. 15(2): does not apply to micro/small enterprises |
| **Art. 16**: notice and action mechanism | ✅ | Report → “Copyright” / “Illegal content” runs the legal-notice flow: exact location in tree (16(2)(b)), identification + substantiated explanation (16(2)(a)), evidence links, notifier name + e-mail (16(2)(c), with the CSAM anonymity exception stated), good-faith declaration (16(2)(d)). Code: `tree-legal-report-evidence-prompts.js`, `governance.js#putTreeLegalReport`, `sources-actions/publish.js` |
| **Art. 16(4)**: confirmation of receipt | ✅ (adapted) | There is no server to send an acknowledgment; the signed, timestamped record on the network is the receipt, and the post-submit text (`legalReportSent`) says so explicitly |
| **Art. 16(6)**: timely, diligent, non-arbitrary processing | ✅ (adapted) | Legal notices: ~48 h grace in Discover (deprioritized, still listed) for owner response; then hidden from in-app index only; **two independent legal notices** can hide immediately. Community reports: score threshold scales with votes/usage; weekly cap (3/community reporter); young-account weight 0.5×; owner **directory appeal** resets scoring |
| **Art. 17**: statement of reasons | ✅ | Affected publishers get an in-app statement with facts (score, threshold, unique reporters), ground (community policy), scope (in-app directory visibility only) and redress path (Forest → row ⋯ → contest / legal response): `creatorDirectoryHiddenStatement`, `creatorReportsToastProgress`, `creatorLegalDisputeToast`, owner banner in `SourcesInternetRow.jsx` |
| **Art. 18**: notification of suspected criminal offences | Documented | The operator holds no user data and cannot proactively detect offences; anyone (including the operator) seeing such content uses the authorities of their jurisdiction. Operator contact is published for authority requests (Art. 11) |
| **Arts. 20–28** (Section 3, online platforms) | Exempt (Art. 19) | Micro/small enterprise. Spirit partially implemented anyway: redress path in every statement of reasons (≈ Art. 20), PoW + unique-reporter verification deters manifestly unfounded mass notices (≈ Art. 23), no advertising and no profiling-based recommender exists (≈ Arts. 26, 27, 28: nothing to disclose, directory ranking is votes/usage/recency, described in UI) |
| **GDPR interplay** | ✅ | Network consent gate before any relay connection (`core.js#_assertNetworkConsent`), privacy policy in `profile.json`, data-minimised directory (`docs/NETWORK.md`) |

## German law (unchanged, still cited in the Impressum)

- § 5 DDG (Diensteanbieter identification), `impressumDetails`
- § 18 Abs. 2 MStV (editorial responsibility), `impressumDetails`
- § 19 UStG (small-business VAT note), `impressumDetails`

## Anti-bot architecture (what makes moderation keep working at scale)

Everything below is enforced **at read time** by every honest client (and by the
Node directory aggregator), because relays accept arbitrary writes:

1. **Proof-of-work table** (`src/features/nostr/api/nostr-pow.js`): directory rows,
   forum messages/threads, votes, reports, usage pings, urgent messages, legal
   notices and account registrations each require a SHA-256 PoW bound to the actor
   key and target. Verifiers use the required difficulty from the table, payload-
   claimed difficulty is ignored (a previous bypass).
2. **Signature + field binding**: forum messages must be signed; unsigned entries in
   peer-provided pages are rejected. Threads must be signed and carry PoW.
3. **Per-pubkey aggregation**: votes count one per pubkey (newest wins), forks one
   per child tree, reports/legal notices deduplicate by verified reporter pubkey.
4. **Thresholded, reversible restrictions**: directory hiding (report score ≥
   popularity-scaled threshold) and legal-dispute hiding after 48 h without
   owner response (or immediately with ≥2 independent legal notices) are local,
   reversible, owner-exempt, and never delete content from the network. During
   the legal grace window listings are deprioritized only. Owners can publish a
   signed **directory appeal** (`tree_directory_appeal_v1`) that resets
   community report scoring for reports up to the appeal timestamp.
5. **Reporter abuse limits**: 3 community reports per week per pubkey (local
   counter); reporters younger than 7 days count at 0.5× weight when scoring.
6. **Operator backstop**: per-build maintainer blocklist for firm removals from the
   distributed app.

## Known limitations (accepted)

- **CPU-rich Sybil farms**: proof-of-work raises cost but does not stop large bot farms. Optional future mitigation: dynamic bit increases or pubkey reputation weighting, without breaking the no-login model.
- **Forum page refs (last-write-wins)**: any participant can overwrite a thread page magnet pointer (thread vandalism, not message forgery: individual messages remain verified). Hardening would require owner-signed rollups or per-author buckets.
- **Third-party relays**: may purge or censor events; the app mitigates with multi-relay + HTTP/torrent directory mirrors.
- **Pre-PoW published trees**: directory rows published before PoW enforcement must be republished once so the directory row carries valid PoW.
