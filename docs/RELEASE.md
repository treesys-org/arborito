# Release and deploy

## Web (arborito.org)

```bash
cd arborito
npm install
npm run build # → www/
```

GitHub Actions: `arborito-pages.yml` uploads `www/` to Pages. The artifact must include `.nojekyll` (already in the repo).

Verify: `node scripts/verify-vite-www.mjs` · `npm run preview`

Nostr relays: [`NETWORK.md`](NETWORK.md#nostr-relays).

## Desktop (Flatpak / Windows / Android)

```bash
npm run setup:flatpak # once on Linux host
npm run release:build # interactive target picker
```

| Target | Flag |
|--------|------|
| Flatpak | `--flatpak` |
| Windows `.exe` | `--win` (needs Wine on Linux) |
| Android APK | `--android` |

**CI:** Actions → **Arborito Release**. Reads `package.json` version, builds binaries, publishes a GitHub Release, and publishes the Linux Flatpak remote (branch `flatpak-repo`, prune-depth 1, orphan force-push). Pages then serves `https://arborito.org/flatpak/`.

Linux install CTA: `https://arborito.org/flatpak/org.treesys.arborito.flatpakref` (Software / Discover). The `.flatpak` bundle remains on GitHub Releases as a fallback.

Windows auto-update reads `latest.yml` (and `.blockmap` when present) from that release; the Windows job uploads them next to the `.exe`.

Linux packaged builds check GitHub Releases and open the `.flatpakref` when a newer version exists.

### Flatpak remote secrets (once)

Under repo **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|--------|---------|
| `FLATPAK_GPG_PRIVATE_KEY` | Armored private key used to sign the OSTree remote |
| `FLATPAK_GPG_KEY_ID` | Key id / fingerprint passed to `flatpak build-update-repo --gpg-sign` |
| `FLATPAK_GPG_PASSPHRASE` | Optional, if the key is passphrase-protected |

Generate a dedicated signing key locally, export the private key armored into the secret, and keep the public half only as needed for verification. Each release rewrites branch `flatpak-repo` (orphan tip only) so Git history does not accumulate prior OSTree blobs.

Output in `dist/`. Icons from `build/arborito-app-logo.png` → `npm run ensure:icon`.

### Common issues

| Problem | Fix |
|---------|-----|
| Flatpak runtimes EOL | `npm run setup:flatpak` |
| Flatpak inside a container | Build Flatpak on the **host**, not in Toolbx |
| Missing Flatpak GPG secrets | Add `FLATPAK_GPG_*` secrets (release job `publish-flatpak-remote` fails closed) |
| No Wine | `sudo dnf install wine` or `--flatpak --android` only |
| Wrong icon | Replace `build/arborito-app-logo.png` + `npm run ensure:icon` |

Offline copies on desktop: [`PRODUCT_GUIDE.md`](PRODUCT_GUIDE.md#offline-vs-versions-the-most-confusing-part).

## QA before tagging a version

Manual checklist with a large reference course:

1. First load: time until the map is usable.
2. Nostr: time until render or a clear error message.
3. In-tree search: index `ready` + query returns results.
4. Second visit: lesson served from IndexedDB cache.
5. Memory: quick check in DevTools.

Record version/commit in release notes.

## Brand assets

| File | Use |
|------|-----|
| `build/arborito-app-logo.png` | Source for app icon and **favicon** |
| `favicon.png` | Web / README (synced from `build/icon.png` via `ensure:icon`) |
| `build/arborito-root-logo.svg` | Sidebar knot and boot spinner |
| `build/treesys-logo.png` | About modal only (not the Arborito app icon) |

After changing the logo: `npm run ensure:icon` (also writes `favicon.png`). Android launcher icons are applied from the same logo during `dist:android` / `release:build --android` (`scripts/patch-android-icons.mjs`).

Camera (QR sync) and microphone (Sage voice) need host permissions:

| Surface | Camera (QR) | Mic (Sage STT) |
|---------|-------------|----------------|
| Browser (`arborito.org` HTTPS) | OS/browser prompt via `getUserMedia` (CTA in scan modal) | Not offered. Whisper STT is desktop-only; read-aloud uses `speechSynthesis` |
| Electron (Windows / unpackaged) | Allowed in `electron-main.js` | Same (+ Pulse/OS prompt) |
| Flatpak | PipeWire + `portal.Camera` finish-args | PulseAudio socket |
| Android APK | `CAMERA` (+ optional `uses-feature`) via `patch-android-permissions.mjs` | `RECORD_AUDIO` declared for WebView; Sage Whisper still desktop-only |

Rebuild APK / Flatpak / desktop after changing these patches.
