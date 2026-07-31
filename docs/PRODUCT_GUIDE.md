# Product guide (plain language)

For code contributors: [`DEVELOPMENT.md`](DEVELOPMENT.md). For course authors: [`AUTHORING.md`](AUTHORING.md).

## The three screens that matter

| Metaphor (EN / ES) | Nav label today | What it is |
|--------------------|-----------------|------------|
| **Forest** / **Bosque** | **Courses** / **Cursos** | Your library: **My courses**, **Explore** (Discover), import, publish |
| **Backpack** / **Mochila** | same | Your progress: trophies, seeds, Care, lumens |
| **Map** | same | The visual lesson tree you are studying |

**Forest** is the product metaphor (and the code domain under `features/forest/` plus the Courses/`sources` hub). The sidebar may say **Courses** today; docs and conversation still use **Forest**, **branch**, and **tree**.

## Branch vs tree (not the same thing)

Think **Spotify**:

| Concept | What it is | Analogy |
|---------|------------|---------|
| **Branch** | One full course with lessons | An album |
| **Tree** | A playlist that combines several courses | A playlist |

- A **branch** holds the content (lessons, quizzes, languages).
- A **tree** only **points at** branches; it does not replace them.

In the Forest hub: tab **Individual courses** (caption **Branches**) = single courses. Tab **Combined courses** (caption **Trees**) = playlists.

## Offline vs versions (the most confusing part)

These are **two different things**. Do not mix them up.

### Offline = “save a local copy and stop checking for updates”

**Desktop app only** (Flatpak / Windows / Android). Not shown on the web. The UI toggle label is **Offline** (code and older notes may still say “freeze”).

| | Offline |
|---|--------|
| **Who does it** | You, the learner |
| **What it does** | Saves a copy on your device and **stops checking** the network for new content |
| **Why** | Study offline; keep an Arcade game even if the author removes it online |
| **Where it lives** | Under the app profile: `frozen-trees/` (courses) or `offline-games/` (games). Linux native: `~/.config/arborito/…`. Flatpak: `~/.var/app/org.treesys.arborito/config/arborito/…`. Windows: `%APPDATA%\arborito\…` (legacy `Arborito` folder is still accepted). |
| **Syncs with account** | No |

Analogy: like **downloading a PDF and turning off “new edition available” notifications**. You choose when to turn Offline off again.

### Versions = “the author published another edition of the course”

| | Versions |
|---|----------|
| **Who does it** | The course author |
| **What it does** | Publishes a **new edition** of the same course (v1, v2, …) |
| **Where you see it** | Version picker on the map / Construction mode |
| **On web** | Yes |
| **Sync** | Public versions come from the network; private trees can sync |

Analogy: versions are like **“2024 edition” vs “2025 edition” of the same book**. The author wrote both; you pick which one to read.

### One-line summary

- **Offline** = I keep **my copy** and pause automatic updates.
- **Versions** = the author published **another edition** and I choose which to study.

## Trophies and achievements

| Kind | When | Who sets it up |
|------|------|----------------|
| **Tree trophy** | You finish every slot in a **composed tree** (playlist of branches) | Automatic |
| **Branch trophy** | You finish a **standalone branch**, or one branch slot inside a tree | Automatic |
| **Folder achievement** | You finish every lesson inside one folder the author marked | Author (Construction → **Enable achievement** on the folder) |

**Folders inside the map** (modules) do not give a default trophy unless the author turns on **Enable achievement** (🏆 on the map tools, or Properties).

## Web vs desktop

| | Web ([arborito.org](https://arborito.org)) | Desktop app |
|---|--------------------------------------------|-------------|
| Install | None | Flatpak / Windows / APK |
| Map, lessons, editor | Same | Same |
| Sage AI (chat) | Your API key or unavailable | Private local AI (llama.cpp) |
| Offline courses/games | No | Yes |
| Sage voice (Piper) | System speech only | Optional neural voice |

## Where your data lives

| What | Where |
|------|-------|
| Imported courses | IndexedDB in the browser / app |
| Progress, quizzes, offline flags | `localStorage` (`arborito-progress`) |
| Offline copies (desktop only) | Profile `frozen-trees/` and `offline-games/` (see Offline section above) |
| Optional online account | Nostr; see [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md) |

Public network courses are **not** stored whole on disk by default; they load on demand.

## Developer quick map

| Code | Role |
|------|------|
| `features/sources/` | Forest hub UI (Courses nav, library + Discover) |
| `features/forest/` | Composed-tree helpers (playlist / tree metaphor) |
| `core/user-store/branches.js` | Branch CRUD |
| `tree-freeze-cache.js` / `game-offline-cache.js` | Offline copies to disk |
