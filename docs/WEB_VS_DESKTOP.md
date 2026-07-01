# Web vs desktop — what changes for users

Arborito is **one app** with two ways to run it. The map, lessons, quizzes, Memory Garden, Arcade, editor, and Nostr sync behave the same. What differs is **how you install it** and a few **optional** capabilities tied to the desktop shell.

## Quick comparison

| | **Web** ([arborito.org](https://arborito.org)) | **Desktop** (Linux Flatpak / Electron) |
|---|---|---|
| **Install** | None — open the site in a modern browser | Download a release (Flatpak / Windows / Android) |
| **Account & progress** | Local-first; optional Nostr sync | Same |
| **Trees & editor** | Full Construction Mode | Full Construction Mode |
| **Sage — Guide mode** | On-device tips & navigation (no LLM) | Same |
| **Sage — AI chat** | **Expert mode** (your API key) or unavailable | **Native local AI** (llama.cpp, private) |
| **Sage — voice** (mic + spoken replies) | System speech only | Piper + Whisper (optional download) |
| **Arcade — offline games** | Online cartridges only | Freeze games offline (desktop only) |
| **Freeze trees** | No | Yes (files under `~/.config/Arborito/`) |
| **Updates** | Refresh the page | Flatpak / installer / APK |

## Web (browser)

- Best for **trying Arborito** without installing anything.
- Sage chat needs **Expert mode** (your compatible API) or install the **desktop app** for private on-device AI.
- **Accessibility → read aloud** uses system speech synthesis.

## Desktop

- Same UI, wrapped in **Electron**.
- **Private Sage** (GGUF on disk), **voice**, **freeze** trees/games, offline Arcade.
- Packaged as Flatpak (Linux), NSIS (Windows), APK (Android).

See [AI_INTEGRATION.md](AI_INTEGRATION.md) and [GLOBAL_CATALOG_SCALE.md](GLOBAL_CATALOG_SCALE.md).
