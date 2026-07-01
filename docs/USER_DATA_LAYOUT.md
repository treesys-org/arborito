# Where Arborito stores your data

## Desktop app (`~/.config/Arborito` on Linux)

| Folder / file | What it is | Copy individually? |
|---------------|------------|-------------------|
| `README.txt` | Short guide (auto-created) | Yes |
| `frozen-trees/*.json` | One file per **frozen** network tree | **Yes** |
| `offline-games/<id>/bundle.json` | One **frozen** Arcade game | **Yes** |
| `llamacpp-models/` | Sage chat model (GGUF) | Optional backup (large) |
| `whisper-models/` | Sage microphone model | Optional |
| `piper-voices/` | Sage read-aloud voice | Optional |
| `sage-voice-bin/`, `llama-cpp-bin/` | Downloaded binaries | Re-download usually easier |

Freeze flags (which trees/games are frozen) live in `localStorage` (`arborito-progress`), not as separate files.

## Browser / embedded storage (web and Electron UI)

| Store | What it is |
|-------|------------|
| IndexedDB `arborito_catalog_v2` | **Branches** (`.arborito` units), **composed trees** (playlists), and **installed network branches** — see [`TREES_AND_BRANCHES.md`](TREES_AND_BRANCHES.md) |
| `localStorage` `arborito-progress` | Progress, SRS, game scores, freeze/offline flags (no tree bodies) |
| `localStorage` `arborito-bookmarks` | Per-lesson bookmarks |

Course bytes for public trees are **not** stored wholesale — only URLs/bookmarks. Heavy content loads via Nostr index + WebTorrent (lazy).

**Export/import:** Profile → export bundles progress + local trees. For frozen copies on desktop, use the folders above.

## Account sync (Nostr, optional)

Small **encrypted** blobs only: private trees, installed source list, per-tree progress — not frozen public trees or multi‑GB models.

See [MILLIONS_SCALE_ARCHITECTURE.md](MILLIONS_SCALE_ARCHITECTURE.md).
