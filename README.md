# 🌳 Arborito

**A free, open-source app for learning any subject as an interactive tree of lessons — and for the community to grow that tree together.**

Arborito turns a subject (languages, computing, history, music, biology, anything) into a visual map of lessons you can explore at your own pace. Anyone can study from existing trees, plant their own, translate lessons, or remix what others have published. There are no subscriptions, no accounts required, and no ads.

> Knowledge is a right, not a privilege. Arborito is a project, not a product — built by and for the people who use it.

## What Arborito can do today

- **Interactive lesson graphs.** Every subject is a navigable tree: pick a branch, read the lesson, take the quiz, move on.
- **Built-in spaced repetition.** A memory-garden system brings back what you start to forget, exactly when you need to review it.
- **Visual editor — no code.** Anyone can plant a tree: write lessons, add images, set quiz questions, branch out subtopics.
- **Lesson Arcade.** Turn lessons into small games — quizzes, RPGs, trading sims and more — and play to revise.
- **Local-first, no signup.** Your progress lives on your device by default. An optional **Nostr** account (no email, no password) syncs across devices and lets you publish.
- **Decentralised content.** Trees travel over Nostr, HTTPS JSON, or share codes. There is no central server you depend on; if `arborito.org` disappears, the public trees do not.
- **Desktop and web builds** from a single codebase (Electron + vanilla ES modules).
- **Multilingual UI and lessons.** Today English and Spanish, with the rest waiting for translators.
- **Optional AI tutor (off by default).** See the note at the bottom — short version: it's local, opt-in, and you never have to enable it.

See [`ROADMAP.md`](ROADMAP.md) for what's coming next (collaborative editing, federated trees, mentor integration, accreditation experiments…).

## Why Arborito exists

There are plenty of learning apps. Arborito differs in five ways that we don't compromise on:

1. **Free as in freedom (GPL v3).** You can study the code, fork it, host it, modify it. Forever.
2. **Education over institution.** Curricula are written by people who actually know the subject, not by a publisher chasing a tender. You learn what you want, when you want, at the depth you want.
3. **No vendor, no lock-in.** Lessons are plain JSON. Content travels over open protocols (Nostr, WebTorrent, HTTPS). Your progress is portable; an account is optional.
4. **Local-first, privacy-first.** Nothing about you is tracked. No analytics, no email, no per-question billing. The optional AI tutor runs entirely on your own device.
5. **Community is the curriculum.** Every learner is a potential editor. The goal is a forest of trees that humanity tends together, not a top-down catalogue.

## Try Arborito

Use it at **[arborito.org](https://arborito.org)**, or run it yourself:

```bash
git clone <this repo>
cd arborito
npm install
npm start          # Desktop (Electron). Styles compile automatically.
```

For a browser-only run from the same folder:

```bash
npm run serve:http   # or: python3 -m http.server 8000
# open http://localhost:8000/
```

If you get stuck, that's a documentation bug — [open an issue](../../issues) and we'll improve the steps.

## How to contribute — code is just one way

Arborito needs many kinds of people. Pick what fits you:

| If you are a… | You can… |
|---|---|
| **Learner** | Use Arborito, [open an issue](../../issues) about bugs or confusing screens, suggest a missing topic. |
| **Teacher / domain expert** | Plant a tree on something you know well, or improve an existing one. **No code needed** — the visual editor handles it. |
| **Writer / proofreader** | Polish lessons, fix typos, clarify explanations, write better quiz questions. |
| **Translator** | Translate the UI (`locales/en`, `locales/es`, …) or a tree's lessons. Every language is welcome. |
| **Designer / illustrator** | Improve icons, UI flows, accessibility. Open an issue with mockups or a PR. |
| **Developer** | Start with [`docs/dev-onboarding.md`](docs/dev-onboarding.md). |

New here? Just [open an issue](../../issues) introducing yourself and what you'd like to try. The full friendly contributor guide is in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

GNU **GPL v3** — see [`LICENSE`](LICENSE). Anyone can study, share, and improve Arborito; redistributed versions must stay free under the same terms.

If you **modify** the code or **host** a public copy that isn't an official Treesys release, please also read [`docs/forking-and-branding.md`](docs/forking-and-branding.md) — practical (not legal) guidance to avoid misleading users.

## A short note on AI

Arborito ships an **optional** AI tutor named Sage. It is **off by default**, never turns itself on, and — when enabled — **runs entirely on your own device**. Nothing you type goes to OpenAI, Google, or any cloud service. You can use Arborito for years without ever turning it on. Technical details are in [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md).

---

## For developers

Everything beyond this point lives in `docs/`:

- [`docs/dev-onboarding.md`](docs/dev-onboarding.md) — start here: repository layout, mental model, why `main.css` is huge, what `node_modules/` is.
- [`docs/MODAL_STANDARDS.md`](docs/MODAL_STANDARDS.md) — mandatory before touching any modal: the unified UX helpers and compliance table.
- [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md) — how the optional AI tutor is wired, what's bundled vs. downloaded, where settings live per OS.
- [`docs/NOSTR_RELAYS_CONFIGURATION.md`](docs/NOSTR_RELAYS_CONFIGURATION.md) — default `wss://` relays and how deployments override them.
- [`docs/MILLIONS_SCALE_ARCHITECTURE.md`](docs/MILLIONS_SCALE_ARCHITECTURE.md) — the Nostr + WebTorrent design that lets a community course scale.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — component, store, and styling patterns.
- [`src/shared/styles/README.md`](src/shared/styles/README.md) — Tailwind / CSS pipeline (shared styles + how feature `styles/` folders plug into the chain).
