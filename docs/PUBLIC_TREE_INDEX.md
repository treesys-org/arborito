# Public directory of trees (GDPR-minded design)

This document describes a **low-liability pattern** for listing published Arborito courses (metadata + link). It is **not legal advice**; operators in the EU should still assess GDPR roles, DPIAs, and hosting contracts.

## In-app Discover index

- **Consultative listing** over Nostr relays the user configured (live query + optional HTTP/torrent mirrors).
- **Opt-out at publish:** “List in Discover” is on by default but can be unchecked; share codes and `nostr://` links always work.
- **Disclaimer** in the Forest Internet tab: Arborito is not the publisher; report to the tree author and relay operator.
- **A posteriori moderation** of the in-app index only (reports, legal notices, maintainer blocklist), content may remain on the network. See **Creator defense** below.
- Policy text: `discoverIndexPolicyBody` in `locales/*/legal.json`.

## Creator defense (Forest / Discover)

When someone reports a tree or branch listed in Discover, the **owner** (device
holding the publisher key) is notified via:

1. **Bell icon** (🔔) next to profile / theme when there are unread alerts, works
   even if they never open Forest. Refreshes on app focus and ~12 s after boot.
2. **In-app toasts** when they load their own tree (secondary).
3. **Forest row** banner and ⋯ actions to contest or respond.

| Situation | What the owner sees | What they can do |
|-----------|---------------------|------------------|
| Community reports building up | Amber banner on their row: score / threshold; toast on next load | **⋯ → Contest community reports**: signed `tree_directory_appeal_v1` resets scoring for reports up to now (must explain fix, min. 80 chars) |
| Threshold reached (hidden for others) | Toast with score, threshold, unique reporters; banner | Same appeal + fix content and republish |
| Legal notice (copyright / illegal) | Bell + banner + toast with **case ID** (e.g. `ARB-20260706-A1B2C3`) | **⋯ → Respond to legal dispute**: signed response carries the same case ID for e-mail threads |
| Two independent legal notices | Hidden from Discover for others | Legal defense still available; off-app dispute between parties |

**Important limits (by design):**

- Restrictions affect **Discover visibility only**. Direct `nostr://` links, share
  codes, and relay copies keep working.
- Arborito does **not** ban user accounts, there are no accounts. The only
  “sanction” is consultative index hiding on clients that apply the rules.
- Community reporters: max **3 reports/week**, per-tree cooldown ~22 h, PoW on
  every write; young pubkeys count at half weight.
- Treesys does not adjudicate disputes; it surfaces signed statements on Nostr.

Code: `SourcesInternetRow.jsx`, `sources-actions/publish.js`,
`sources-directory-row-state.js`, `governance.js`, `publishing-store-actions.js`.

## External static manifest (optional)

1. **Machine-readable list** (e.g. `public-trees.json`) with only fields the author chooses to publish: title, language, license string, canonical HTTPS or share URL, optional short description (no email, no forum dump).
2. **No accounts** on the directory site if possible; no “social graph”; no comments stored on the directory.
3. **Opt-in**: separate checkbox or PR review for each entry.
4. **Community PR model**: accept new rows only via pull request to a public repo.
5. **Logs**: drop or aggregate IP logs aggressively.
6. **Takedown**: simple contact or issue template.

## What to avoid putting in any index

- Forum bodies, learner progress, real names or emails of students.
- Third-party marketing pixels on directory pages.

## Relation to in-app aliases

Short curated names can ship in [`src/features/sources/api/tree-aliases.js`](../src/features/sources/api/tree-aliases.js) for deployments you control; same minimization rules.
