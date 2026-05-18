# Public directory of trees (GDPR-minded design)

This document describes a **low-liability pattern** for listing published Arborito courses (metadata + link). It is **not legal advice**; operators in the EU should still assess GDPR roles, DPIAs, and hosting contracts.

## Goals

- Help learners discover courses without Arborito Inc. (or you) becoming a general-purpose host of user data.
- Minimize **personal data** in the directory itself.

## Recommended shape: static opt-in manifest

1. **Machine-readable list** (e.g. `public-trees.json`) with only fields the author chooses to publish: title, language, license string, canonical HTTPS or share URL, optional short description (no email, no forum dump).
2. **No accounts** on the directory site if possible; no “social graph”; no comments stored on the directory.
3. **Opt-in**: a separate checkbox in your publish flow (“List in public directory X”) is stronger than scraping peers.
4. **Community PR model**: accept new rows only via pull request to a public repo so every entry has a public audit trail and explicit human review.
5. **Logs**: configure the web server or CDN to **drop or aggregate** IP logs aggressively; if you must retain logs, use a processor with a DPA and a defined retention.
6. **Takedown**: publish a simple contact or issue template so authors can request removal without you operating a heavy moderation stack.

## What to avoid putting in the index

- Forum bodies, learner progress, real names or emails of students.
- Anything that fingerprint users across sites (third-party marketing pixels on the directory page).

## Relation to in-app aliases

Short curated names can also ship in [`src/config/tree-aliases.js`](../src/config/tree-aliases.js) for deployments you control; keep the same minimization rules—only public metadata the author agreed to list.
