# 🌳 The future of Arborito: our roadmap

> "The best time to plant a tree was 20 years ago. The second best time is now."

> **v0.1 alpha** — the forest is young. What follows is a **declaration of intent**, not a dated backlog. It is the compass we use to decide what to build next, and the promise we make to anyone who joins us.

Arborito is not an app you consume; it is a **forest of human knowledge** that humanity itself is allowed to plant, prune, fork, and walk through — for free, forever. The optional desktop and mobile builds add local AI and voice; they are the same project, not a paywall.

If even one bullet in this document resonates, you already belong here — teacher, student, translator, or curious visitor.

---

## ✨ Guiding principles

Every decision is filtered through these values. They are the DNA of the forest.

1. **Knowledge is a right, not a privilege.** Every feature must lower the barrier to education. Free, open, accessible — regardless of who you are or where you come from.
2. **Education over institution.** We challenge the rigid catalogue model — often expensive, often inaccessible, always slow to change. Arborito is built for the learner who wants to study what they want, when they want, at the depth they want, around the life they already have. Freedom and practical knowledge over outdated dogma.
3. **Simplicity is sovereignty.** In a world drowning in complexity, Arborito stays simple. **No JS application bundler** for the shipped client (vanilla ES modules); a small CSS toolchain (Tailwind) and npm for desktop/dev are acceptable trade-offs. A student in a public library, on an old browser, should still be able to contribute. Simplicity empowers.
4. **Community is the ecosystem.** The software is just soil. The real value is the people who plant, care for, and share knowledge. Every tool must strengthen the community and make collaboration easier.
5. **Decentralisation is resilience.** No single entity can be a point of failure. Knowledge must flow freely — forkable, archivable, hostable anywhere. Arborito is a protocol, not a closed platform.

   *Practical boundary:* forks and mirrors are welcome; they must **not impersonate** the upstream legal entity or imply endorsement where none exists. See [`docs/forking-and-branding.md`](docs/forking-and-branding.md) (GPL, naming, disclaimers — not legal advice).

---

## ✅ Already growing

Before talking about what's next, this is what already lives in the repository and works in the app. These aren't promises — they're load-bearing parts of Arborito today.

- **Anyone can plant a tree.** Construction Mode is built into the app — write lessons, branch subtopics, attach quizzes and exercises, all visually, no code, no editorial board. There is no gatekeeper deciding which subjects "count."
- **Anyone can publish to the open network.** A tree on your device can be published over **Nostr** (control plane) and optional **WebTorrent** (data plane) without going through any company — including Treesys. Once it's out there, it can be mirrored, forked, archived. Global discovery uses native Nostr indexing (trigram tags on publish). See [`docs/MILLIONS_SCALE_ARCHITECTURE.md`](docs/MILLIONS_SCALE_ARCHITECTURE.md) and [`docs/NOSTR_DIRECTORY_SEARCH.md`](docs/NOSTR_DIRECTORY_SEARCH.md).
- **Interactive lesson graphs.** Every subject is a navigable map: pick a branch, read the lesson, take the quiz, move on. Core viz, lesson flow, and progress tracking are stable.
- **Local-first storage.** Progress and trees live on your device by default. No signup, no email, no analytics.
- **Optional Nostr identity.** Sign in with a key — no email, no password — to sync across devices and sign your publications. Strictly optional; offline-only learners are first-class.
- **Three privacy levels** — device-only, encrypted private draft, or public publish.
- **Spaced repetition (Memory Garden).** Brings back what you start to forget, exactly when you need to review it.
- **Lesson Arcade with cartridges.** Lessons can be played as small games. Cartridges have both a browser SDK and a Python SDK (`arborito-games/`); games can stay fully static or call optional helpers.
- **Web at [arborito.org](https://arborito.org)** — full app, no install. **Desktop and mobile** — Linux Flatpak, Windows `.exe`, Android APK from [GitHub Releases](https://github.com/treesys-org/arborito/releases); one codebase (Electron + vanilla ES modules in the browser).
- **Multilingual UI infrastructure.** Modular `locales/en/*.json` and `locales/es/*.json` with a parity validator (`scripts/validate-locales.py`). New languages are a translation away.
- **Optional AI tutor (Sage).** Opt-in only, off by default, never turns itself on. **Desktop:** native `llama.cpp` — fully local; nothing you type goes to a cloud service. **Web:** guide mode works without any LLM; chat is optional via **Expert mode** (your API key) or install the desktop app for private local AI. Details: [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md), [`docs/WEB_VS_DESKTOP.md`](docs/WEB_VS_DESKTOP.md).
- **Contributor docs.** `CONTRIBUTING.md`, `docs/dev-onboarding.md`, `docs/MODAL_STANDARDS.md`, and many domain-specific notes.

---

## 🗺️ The journey ahead

Our path is divided into seasons, like the life cycle of a great tree.

### Phase 1: The Seed (Foundation) — _mostly complete_

- **Goal:** the purest, most beautiful, most focused learning experience possible.
- **Status:** the architecture is in place (see *Already growing*). What remains here is **polish and content**:
  - **Stability hardening** — keep sharpening rough edges in the graph editor and publish flows.
  - **Onboarding polish** — simplify the first run: account vs. no-account, picking a first tree.
  - **Lesson content growth** — at this stage we optimize for **quantity** and diversity, to build a broad base. Curation and quality refinement come naturally as the community grows.

### Phase 2: The Sapling (growth & community) — _in progress / next_

- **Goal:** turn learners into contributors, and contributors into guardians of the forest.
- **Focus:**
  - **Collaborative construction.** Construction Mode already lets one person plant a tree end-to-end. The next leap is **real-time, multi-author construction** — several editors on the same garden, a per-branch role system (author, editor, reviewer), peer review through the Nostr network (no central PR queue), and a richer diff/review UX before publishing. Co-authorship becomes a first-class flow, not a workaround.
  - **AI as an augmentation tool — _base shipped, capabilities to expand_.** Sage already answers questions about a lesson (local on desktop; optional Expert mode on web). Next steps: personalized study plans from your progress, on-demand quiz generation per branch, and a Socratic-partner mode. AI stays **optional** — a tool for the learner, not a substitute for a teacher. Private-by-default on desktop; on web, cloud only if **you** bring your key.
  - **The human element: teacher & mentor integration.** A space where real-world educators can volunteer or build a livelihood inside Arborito:
    - Verified teachers hosting live classes, office hours, and one-on-one tutoring.
    - Structured support classes with a sustainable revenue model.
    - Scheduled video meetings for community members to share ideas and collaborate.
  - **Mission-driven curriculum.** An annual, community-voted theme focused on a real-world problem (e.g. climate literacy, sustainable energy). Every branch of knowledge is invited to contribute relevant content — turning the forest into a yearly act of collective focus.

### Phase 3: The Forest (ecosystem) — _long-term vision_

- **Goal:** evolve Arborito from an application into a **decentralised protocol for knowledge** that survives any single company, any single border, any single fashion.
- **Focus:**
  - **Decentralised identity & verifiable credentials.** Explore sovereign identity (DIDs) so achievements are tied to the learner, not to a platform — yours forever, even if Arborito vanishes tomorrow.
  - **Knowledge federation.** Different trees link to each other, weaving an interconnected meta-forest. A student jumps from a physics course in one tree to a mathematics course in another, with prerequisites resolved across authors who have never met.
  - **Bridging digital and physical — "Arborito Hubs" (concept).** Optional, merit-based, city-level community centers that offer proctored exams, hands-on labs for equipment that cannot live in a browser, and local meeting space for Arborito communities.
  - **Path to accreditation.** Partnerships with established institutions; ultimately celebrating the first accredited professional who graduates entirely through the Arborito ecosystem.
  - **Incentives and governance.** Fair, community-driven governance and sustainable models so high-quality authors and exam verifiers can be rewarded — keeping the forest healthy without ever requiring a paying customer.

---

## Beyond the horizon

Arborito's ultimate goal is not to be the "best" educational platform. It is to **make the very idea of a centralised educational platform obsolete**.

We dream of a future where human knowledge is a public resource — a global garden tended by everyone, for everyone. A future where learning is as natural as breathing and as inspiring as looking at the stars; where a child in a village and a researcher in a capital share the same map, with the same depth, in the language they choose.

**If this resonates with you, welcome home. There is much to cultivate.**

---

## How to help now

1. **Use Arborito** at [arborito.org](https://arborito.org).
2. **Report** what confuses you ([issues](https://github.com/treesys-org/arborito/issues)).
3. **Plant or improve** a lesson tree.
4. **Translate** UI or content (`locales/`).
5. **Build** — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

*Treesys maintains Arborito as open software. The roadmap changes as the community grows — that is a feature, not a bug.*
