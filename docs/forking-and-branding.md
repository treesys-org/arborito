# Forking, mirrors, and branding (Arborito)

## Read this first — not legal advice

This document is **practical guidance** for contributors, forkers, and people who host a copy of this software. **It is not legal advice.** It does not create a lawyer–client relationship. Laws on trademarks, consumer protection, and software licensing **vary by country**. If you need certainty for your situation, consult a qualified professional when you can.

The goal here is to **reduce confusion** among end users and to **clarify expectations** so the upstream project (Treesys and the Arborito maintainers) and third parties each know **who is responsible for which build**.

---

## Trademarks and project names

### How upstream treats “Treesys” and “Arborito” (informational)

**Not legal advice.** Short version for forks and mirrors:

- **Treesys logo:** treated as a **registered trade mark** (EU). Do **not** copy or imitate it as **your** branding on unofficial builds **without written permission** from Treesys.
- **Names “Treesys” and “Arborito”:** use them **truthfully** (e.g. “based on Arborito”, “unofficial”). Do **not** suggest **endorsement** or that you **are** Treesys when you are not.
- **Arborito** as a project also has **copyright** in code and assets. **GPL v3** is not a blanket trade-mark licence.

If you need a one-line notice on your own site, something like **“Treesys and the Treesys logo are trade marks used with permission”** (only where true) or **“Treesys logo is a registered trade mark; unauthorised use prohibited”** is enough for many pages — have it **checked** against your actual register entry if you want maximum safety.

### Rules for everyone else (forks, mirrors, repackagers)

- **Treesys logo (registered mark):** do **not** use it as **your** product logo, app icon, or dominant branding on a **non-official** build **without written permission** from Treesys. *Nominative* use (e.g. “compatible with Arborito”, “fork of the Arborito project”) is different from **copying** the logo.
- **Word marks “Treesys” / “Arborito”:** truthful **descriptive** use (“based on…”, “unofficial build”) is normal in open source; use that **does not** suggest **endorsement**, **same legal entity**, or **official** status when that is false remains **required**.
- **GPL v3** governs **copyright** in the code, **not** a blanket licence to use **trade marks** or the **registered logo** on stores, domains, or ads.

---

## What counts as an “official” build (upstream)

Unless **Treesys** (or someone explicitly authorised in writing by Treesys) says otherwise, treat **only** distributions that Treesys **publishes or explicitly lists** (for example the primary site and repositories Treesys controls) as **official**.

Everything else — your fork, your company’s internal build, a mirror on another domain, a repackaged ZIP — should be treated as **non-official** unless you have **written** permission to say otherwise.

---

## What you must do if you ship a **modified** or **self-hosted** copy to others

If you give other people a binary or a hosted URL that **is not** an official Treesys build, you should **both**:

1. **Comply with the GNU GPL v3** (keep copyright notices, offer corresponding source, license text, etc.). See the `LICENSE` file in this repository.

2. **Avoid misleading branding** — use **at least one** of the following (more is better):

   **Option A — Distinct name (strongly recommended)**  
   Choose a **different public product name** for your variant (e.g. “MyProject (Arborito-based)” or a wholly new name). Adjust visible strings, page titles, and store listings accordingly.

   **Option B — Prominent disclaimer (required if you keep “Arborito” as the main title)**  
   If the UI or marketing still says **“Arborito”** as the main product name, you **must** show a **clear, conspicuous, and persistent** notice that:

   - this copy is **not** published or endorsed by Treesys;
   - **you** (name / project / contact) are responsible for this deployment;
   - users should **not** assume Treesys provides support or is the data controller for **your** site.

   Reasonable places: welcome screen, About → Legal, footer on the landing page, or `README` on the download page — **where users will actually see it before relying on the app**.

**Do not** reuse Treesys **Impressum**, **privacy contact**, or **legal entity details** as if they applied to **your** server without authorisation. For **your** deployment, **your** legal notices should identify **your** operator and contact (or state clearly that the instance is personal/experimental, if that is true).

---

## Unmodified mirrors

If you host a **byte-for-byte** mirror of an **official** release **without** changing code or legal text, still:

- State **where** the mirror is hosted and **who** operates the mirror.
- Prefer linking to **official** release artifacts when possible, so users can verify integrity.

If you change **anything** (even locales or a single string), treat the result as **modified** and follow the section above.

---

## Relationship to the roadmap

The project vision (see `ROADMAP.md`) is that knowledge and software can be **forked and hosted broadly**. That **does not** mean every host may present itself as **the same product or the same legal entity** as upstream. **Decentralisation of code** and **honest labelling** work together.

---

## Contact

Questions about **permission** to use names, logos, or to label a build as official: contact Treesys through the channels published on **https://treesys.org** (or the current canonical project site).

---

## Upstream: “I don’t write the curriculum” — what is **not** magically covered

**Not legal advice.** Many operators assume: *“I only ship the app; users bring trees; therefore I have no legal exposure.”* That is **too optimistic**.

**What changes when you don’t author trees**  
You may **not** be the “publisher” of lesson text in a **copyright** sense for third-party JSON. That **does not** remove **every** duty:

| Area | Why it can still matter |
|------|-------------------------|
| **Privacy / GDPR** | You still **determine purposes** of processing for **this website** (origin): loading the SPA, language files, optional features (AI consent, Nostr, forum UX), logs on **your** server if any, etc. Your **Privacy Policy** and **Legal** tab describe **that** processing — not only “lesson content”. |
| **Illegal / harmful UGC** | If users can post to **public** networks or load **third-party** trees, **someone** may be asked to act (notice-and-action, moderation, contact point). Rules differ (DSA in the EU for certain services, national law). “I didn’t write it” helps **morally** but is **not** a universal shield. |
| **Trade marks & misleading marketing** | If others **misuse** Treesys / Arborito branding, **your** clear **official** channel and **this policy** reduce confusion; they don’t replace **enforcement** choices. |
| **Product safety / consumer law** | If you **sell** or **market** to consumers, warranties and information duties may apply **to the software you supply**, independent of who wrote a given tree. |
| **Liability for your own statements** | Impressum, ads, roadmap claims: **you** are responsible for **your** communications. |

**Practical takeaway for Treesys**  
Shipping Arborito **without** creating every tree **reduces** some **copyright** risk around lesson text, but **does not** replace: accurate **privacy/legal** copy, sensible **abuse** / **contact** paths, and **trade-mark hygiene** (official builds clearly labelled; this document for everyone else).

---

## Quick summary — not legal advice

This document **is not legal advice**.

- **Treesys logo:** treated as a **registered trade mark** (EU). On forks, **do not** use it as **your** brand **without written permission**.
- **Names "Treesys" and "Arborito":** honest **descriptive** use is fine; making it look **official** or **endorsed** by Treesys when it isn't, is not.
- **GPL v3:** sets **copyright** obligations on the code (notices, source availability, etc.).
- **Unofficial forks / copies:** use a different **public name** *or* a **very visible notice** (not Treesys; who operates this deployment). **Do not reuse** Treesys's Impressum / legal data on third-party servers as if they belonged to that server.

On your own site a short phrase such as **"registered trade mark"** / **"registered logo"** is usually enough if your adviser approves it; you do **not** need to explain tax or registry details in public copy.

**"I don't create trees" ≠ zero obligations:** you still offer the **app** and the **web origin**; that can pull in GDPR and other rules depending on your situation. **Not** a substitute for a lawyer.

**Trade-mark / logo permissions:** contact details on the canonical site (e.g. treesys.org).
