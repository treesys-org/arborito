# Product guide (plain language)

For code contributors: [`DEVELOPMENT.md`](DEVELOPMENT.md). For course authors: [`AUTHORING.md`](AUTHORING.md).

## The three screens that matter

| In the app (EN / ES) | What it is |
|---------------------|------------|
| **Forest** / **Bosque** | Your library: saved courses, import, publish |
| **Backpack** / **Mochila** | Your progress: trophies, seeds, lumens |
| **Map** | The visual lesson tree you are studying |

## Branch vs tree (not the same thing)

Think **Spotify**:

| Concept | What it is | Analogy |
|---------|------------|---------|
| **Branch** | One full course with lessons | An album |
| **Tree** | A playlist that combines several courses | A playlist |

- A **branch** holds the content (lessons, quizzes, languages).
- A **tree** only **points at** branches; it does not replace them.

In Forest: **Branches** / **Ramas** tab = single courses. **Trees** / **Árboles** tab = playlists.

## Freeze vs versions (the most confusing part)

These are **two different things**. Do not mix them up.

### Freeze = “save a local copy and stop checking for updates”

**Desktop app only** (Flatpak / Windows / Android). Not shown on the web.

| | Freeze |
|---|--------|
| **Who does it** | You, the learner |
| **What it does** | Saves a copy on your PC and **stops checking** the network for new content |
| **Why** | Study offline; keep an Arcade game even if the author removes it online |
| **Where it lives** | `~/.config/Arborito/frozen-trees/` (courses) or `offline-games/` (games) |
| **Syncs with account** | No |

Analogy: freeze is like **downloading a PDF and turning off “new edition available” notifications**. You choose when to unfreeze.

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

- **Freeze** = I keep **my copy** and pause automatic updates.
- **Versions** = the author published **another edition** and I choose which to study.

## Trophies and diplomas

| Kind | When | Who sets it up |
|------|------|----------------|
| **Tree trophy** | You finish every lesson in an imported course | Automatic |
| **Branch trophy** | You finish one slot in a composed tree (playlist) | Automatic |
| **Diploma** | You finish every lesson inside one folder | Author (Construction → trophy on folder) |

**Folders inside the map** (modules) do not give a default trophy unless the author enables **Issue diploma**.

## Web vs desktop

| | Web ([arborito.org](https://arborito.org)) | Desktop app |
|---|--------------------------------------------|-------------|
| Install | None | Flatpak / Windows / APK |
| Map, lessons, editor | Same | Same |
| Sage AI (chat) | Your API key or unavailable | Private local AI (llama.cpp) |
| Freeze courses/games | No | Yes |
| Sage voice (Piper) | System speech only | Optional neural voice |

## Where your data lives

| What | Where |
|------|-------|
| Imported courses | IndexedDB in the browser / app |
| Progress, quizzes, freeze flags | `localStorage` (`arborito-progress`) |
| Frozen copies (desktop only) | `~/.config/Arborito/frozen-trees/` and `offline-games/` |
| Optional online account | Nostr; see [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md) |

Public network courses are **not** stored whole on disk by default; they load on demand.

## Developer quick map

| Code | Role |
|------|------|
| `features/sources/` | Forest modal |
| `features/forest/` | Composed-tree helpers |
| `core/user-store/branches.js` | Branch CRUD |
| `tree-freeze-cache.js` / `game-offline-cache.js` | Freeze to disk |
