# 🌳 Arborito

**Learn anything as an interactive tree of lessons — free, open source, no ads.**

Arborito turns a subject (languages, history, computing, music, biology, anything) into a visual map you explore at your own pace. Study from community trees, plant your own, translate lessons, or remix what others published. No subscription, no mandatory account, no ads.

> **v0.1 alpha** — early software. Use it, break it, help us improve it.

**Knowledge is a right, not a privilege.** Arborito is a **project, not a product** — built by and for the people who use it. The goal is a forest of trees the community tends together, not a top-down catalogue.

## Try it now

**Easiest:** open **[arborito.org](https://arborito.org)** in your browser. That is the full app — no install required.

**Optional install** (same Arborito, plus local Sage AI and voice on desktop): open **Más → Descargar app** inside Arborito, or get **Flatpak / Windows / Android APK** from [GitHub Releases](https://github.com/treesys-org/arborito/releases) (tag `v0.1.0-alpha`).

| Platform | Where |
|----------|--------|
| Web | [arborito.org](https://arborito.org) |
| Linux | `.flatpak` on [Releases](https://github.com/treesys-org/arborito/releases) |
| Windows | `.exe` installer on Releases |
| Android | `.apk` on Releases (not Play Store yet) |

## What you can do today

- **Interactive lesson maps** — pick a branch, read, quiz, move on.
- **Memory garden** — spaced repetition for what you are starting to forget.
- **Visual editor** — create lessons without code.
- **Lesson Arcade** — minigames tied to what you are learning.
- **Local-first** — progress stays on your device by default; optional Nostr sync with a simple code (no email, no password).
- **Decentralised trees** — content over Nostr, HTTPS, or share links. There is no central server you depend on: if arborito.org goes away, public trees published on the network do not.
- **English & Spanish UI** — more languages welcome; help translate in `locales/`.
- **Sage (optional, off by default)** — see [A short note on AI](#a-short-note-on-ai) below.

See [`ROADMAP.md`](ROADMAP.md) for what is next (collaborative editing, federated trees, mentors, accreditation experiments…).

## Why we built it

1. **Free as in freedom (GPL v3)** — study the code, fork it, host it, modify it. Forever.
2. **Education over institution** — curricula from people who know the subject, not a publisher chasing a tender. Learn what you want, when you want, at the depth you want.
3. **No lock-in** — plain JSON lessons, open protocols (Nostr, WebTorrent, HTTPS). Progress is portable; an account is optional.
4. **Privacy-first** — no tracking, no ads, no per-question billing. Optional AI stays under your control (local on desktop).
5. **Community curriculum** — every learner can contribute; software is soil, people are the forest.

## A short note on AI

Arborito ships an optional tutor named **Sage**. It is **off by default**, never turns itself on, and you can use Arborito for years without enabling it.

| Where you run Arborito | Sage chat | Guide (no LLM) |
|------------------------|-----------|----------------|
| **Desktop app** | **Local only** — llama.cpp on your machine; nothing you type goes to OpenAI, Google, or any cloud | On-device tips & navigation |
| **Web** ([arborito.org](https://arborito.org)) | **Expert mode** — your own API key, if you choose; or install the desktop app for private local AI | Same guide mode, no AI required |

Voice (mic + spoken replies) is optional on desktop and downloads only after you opt in. Technical details: [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md) and [`docs/WEB_VS_DESKTOP.md`](docs/WEB_VS_DESKTOP.md).

See [`docs/NETWORK_AND_SECURITY.md`](NETWORK_AND_SECURITY.md) for the full network map.

## Transparencia

Arborito recién empieza. Somos muy pocas personas, y en **esta etapa inicial** — código, diseño de interfaz, documentación interna — hemos recurrido a **asistencia de modelos de lenguaje** cuando no alcanzaban las horas humanas. Siempre con revisión de personas reales, siempre bajo **GPL v3**, y siempre con la meta de que el proyecto pase a manos de la comunidad, no de una máquina.

Entendemos el malestar que despierta la IA en educación y en el software libre. No estamos vendiendo automatización ni reemplazando a maestros, traductores o desarrolladores: estamos intentando **sembrar un bosque de lecciones libres** que cualquiera pueda cuidar y ampliar. Si esa tensión te incomoda, es legítimo. Si, en cambio, te mueve la causa — aprender sin candados, sin anuncios, en comunidad — **necesitamos voluntarios**: quien escriba lecciones, quien traduzca, quien diseñe, quien programe, quien pruebe y cuente qué duele.

La herramienta importa menos que la intención: **el conocimiento como derecho, no como privilegio.** Cómo sumarte: [`CONTRIBUTING.md`](CONTRIBUTING.md).

*(English: during this early stage we used LLM assistance where the team was too small; human review applies; volunteers welcome — see Contributing.)*

## Contribute

You do not need to code:

| You are… | You can… |
|----------|----------|
| Learner | Use it, report bugs, suggest topics |
| Teacher | Plant a tree in Construction mode |
| Writer | Fix lessons and quizzes |
| Translator | Help with `locales/` |
| Developer | [`docs/dev-onboarding.md`](docs/dev-onboarding.md) · [`docs/CODEBASE_CONVENTIONS.md`](docs/CODEBASE_CONVENTIONS.md) |

[`CONTRIBUTING.md`](CONTRIBUTING.md) has the friendly details.

## Build releases (maintainers)

**En GitHub (recomendado):** [Actions → Arborito Release](https://github.com/treesys-org/arborito/actions/workflows/arborito-release.yml) → **Run workflow** → descargá los instaladores en **Artifacts**. Para publicar a usuarios: `git tag v0.1.0-alpha && git push origin v0.1.0-alpha`.

**Local:**

```bash
npm install
npm run setup:flatpak   # once: install Flatpak runtimes 24.08
npm run release:build   # Flatpak + APK (+ .exe if Wine on Linux)
```

See [`docs/DESKTOP_BUILD.md`](docs/DESKTOP_BUILD.md) and [`docs/TREES_AND_BRANCHES.md`](docs/TREES_AND_BRANCHES.md) (branches vs trees).

## License

GNU **GPL v3** — see [`LICENSE`](LICENSE). Forks: read [`docs/forking-and-branding.md`](docs/forking-and-branding.md).

---

**Treesys** maintains Arborito as open educational software. This site: [treesys.org](https://treesys.org).
