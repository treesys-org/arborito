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
| IndexedDB `arborito_catalog_v2` | **Branches** (`.arborito` units), **composed trees** (playlists), and **installed network branches**: see [`TREES_AND_BRANCHES.md`](TREES_AND_BRANCHES.md) |
| `localStorage` `arborito-progress` | Progress, SRS, game scores, freeze/offline flags (no tree bodies) |
| `localStorage` `arborito-bookmarks` | Per-lesson bookmarks |
| `localStorage` auth session | Online username, password (plaintext in session), recovery key, QR data URL — see [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md) |

Course bytes for public trees are **not** stored wholesale, only URLs/bookmarks. Heavy content loads via Nostr index + WebTorrent (lazy).

**Export/import:** Profile → Backup (progress JSON) or Forest → Export (`.arborito` courses) progress + local trees. For frozen copies on desktop, use the folders above.

## Account sync (Nostr, optional)

Small **encrypted** blobs only: private trees, installed source list, per-tree progress, not frozen public trees or multi‑GB models.

See [MILLIONS_SCALE_ARCHITECTURE.md](MILLIONS_SCALE_ARCHITECTURE.md).

## Account security layers (serverless, optional)

Online accounts use a **password** for daily sign-in. Only the password hash is on relays; losing the password without a backup means losing access to that online identity.

Three optional layers — all serverless and PII-free:

1. **Sync key file / sync QR** (`recovery-kit.js`) — sign in on another device without typing the password. Generated at registration; QR shown on desktop Profile.
2. **Recovery passphrase** (`account-recovery.js`, Nostr kind **30295**, `d = arborito:account:recovery:<user>`) — if you **forget your password**. User-chosen passphrase; password encrypted with scrypt (N=2^15, r=8) + AES-GCM. No auto-generated phrases, no security questions.
3. **Change password** (`changeSyncLoginPasswordAction`) — invalidates any existing recovery passphrase blob; user must configure recovery again.

Trade-off: recovery blobs are fetchable by username, so weak passphrases are brute-forceable offline. Recovery is a convenience layer, not a replacement for keeping your password or sync key safe.

Full UX and code map: [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md).
