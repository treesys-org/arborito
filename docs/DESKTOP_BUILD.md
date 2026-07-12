# Building release packages (Flatpak, Windows, Android)

Current alpha: **v0.1.0-alpha**. End users: [GitHub Releases](https://github.com/treesys-org/arborito/releases) or **More → Download app** inside [arborito.org](https://arborito.org).

Desktop Electron builds use **native llama.cpp** only.

## One command

```bash
cd arborito
npm install
npm run release:build
```

The script **asks interactively** which targets to build (all available on this host, or Flatpak / Windows / Android individually). Use flags to skip the prompt: `--flatpak`, `--win`, `--android`, or `--all`.

On **Linux** the default “all” option builds **Flatpak + Android APK**, and **Windows `.exe`** too if **Wine** is installed.

| Step | Command |
|------|---------|
| Install Flatpak runtimes (once) | `npm run setup:flatpak` |
| Install Wine for `.exe` on Linux (optional) | `sudo dnf install wine` |
| Full release build | `npm run release:build` |

`release:build` calls `setup:flatpak` automatically (`preflight-flatpak.mjs --install`).

## Prerequisites (Fedora)

```bash
sudo dnf install nodejs npm flatpak flatpak-builder elfutils rpm-build gcc-c++ make python3
```

Flatpak runtime **24.08** (not 23.08, EOL):

```bash
npm run setup:flatpak
```

Manual equivalent:

```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y flathub \
  org.freedesktop.Platform//24.08 \
  org.freedesktop.Sdk//24.08 \
  org.electronjs.Electron2.BaseApp//24.08
```

### Windows `.exe` on Linux

```bash
sudo dnf install wine
npm run release:build
```

Without Wine, the script skips `.exe` and prints install instructions.

### Android APK

JDK **21** (Capacitor 7), Android SDK (`ANDROID_HOME`). First run creates `android/` (gitignored).

## Individual targets

```bash
npm run release:build -- --flatpak
npm run release:build -- --win
npm run release:build -- --android
```

## GitHub Actions

Workflow **Arborito Release** (`.github/workflows/arborito-release.yml`) builds Flatpak, Windows, and Android APK in parallel.

| Trigger | Result |
|---------|--------|
| **Push tag `v*`** (e.g. `v0.1.0-alpha`) | Builds all three platforms and **creates a GitHub Release** with binaries attached. |
| **Manual run** (`workflow_dispatch`) | Choose targets; download from run **Artifacts**. Does not create a Release. |

### Build from CI (no local compile)

1. Open Actions → **Arborito Release**.
2. **Run workflow** → select branch → check Flatpak / Windows / Android.
3. When finished (~15–30 min), open the run → **Artifacts**.

### Tagging a release

Tag must match `package.json` `version` (with a leading `v`):

```bash
# package.json → "version": "0.1.0-alpha"
git tag v0.1.0-alpha
git push origin v0.1.0-alpha
```

## Output

`dist/`, e.g. `Arborito-0.1.0-alpha-x86_64.flatpak`, `Arborito Setup 0.1.0-alpha.exe`, `arborito-0.1.0-alpha.apk`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Runtimes EOL / missing | `npm run setup:flatpak` |
| `No remote refs found for flathub` | Likely inside a **container**. Exit and run `npm run setup:flatpak` on the **host**, or build only `--win` / `--android` in the container |
| `wine is required` | `sudo dnf install wine` |
| Flatpak opaque error | `DEBUG=@malept/flatpak-bundler npm run release:build -- --flatpak` |
| Bad icon / installer branding | `rm build/icon.png build/installerSidebar.bmp build/installerHeader.bmp && npm run ensure:icon` |
| Windows `build:css` fails | Run `npm install`, then `node ./scripts/build-css.mjs` |
| `platform_shared_memory` / `/tmp` errors in Toolbx | Use `npm start` (includes `--no-sandbox`); set `ARBORITO_CHROMIUM_TMP=~/…` if needed; see **Electron in Toolbx** below |
| YouTube black in packaged desktop | Expected with plain `<iframe>` + `file://`; app uses `<webview>` for embeds. Try `npm run dev:electron` to verify the URL |

### Dev containers

Flatpak runtimes usually **cannot** be installed inside an isolated container. The script detects this and prints instructions.

```bash
# Inside container: APK and Windows only:
npm run release:build -- --win --android

# On the host: full build including Flatpak:
cd arborito && npm run setup:flatpak && npm run release:build
```

See also [`docs/FREEZE_VS_SNAPSHOTS.md`](FREEZE_VS_SNAPSHOTS.md) for the in-app **Freeze** toggle vs version snapshots.

### Electron in Toolbx / nested containers

Chromium tries to spawn a **nested sandbox** (user namespaces + `/dev/shm`). Inside Toolbx, Distrobox, or similar, the host often denies that, which produces:

```text
platform_shared_memory_region_posix.cc: Creating shared memory in /tmp/... failed
```

**What Arborito does:**

| Measure | Purpose |
|---------|---------|
| `electron . --no-sandbox` in `npm start` | Sandbox already provided by the outer container |
| `ELECTRON_NO_SANDBOX=1` when a nested container is detected | Same, before Chromium subprocesses start |
| `disable-dev-shm-usage` + custom `TMPDIR` (`~/.cache/arborito/chromium-tmp`) | Avoid broken `/dev/shm` and `/tmp` |
| `<webview>` for YouTube/Vimeo in lessons (not `<iframe>`) | `file://` parent + iframe = Error 153; webview loads `https://youtube.com/embed/…` |
| `session.webRequest` Referer/Origin injection | YouTube Error 153: simulates `https://arborito.org` for embed + googlevideo requests |

**Optional on the host** (if namespaces are disabled system-wide):

```bash
sudo sysctl -w kernel.unprivileged_userns_clone=1
```

**Flatpak production** (Bubblewrap): `package.json` → `build.flatpak.finishArgs` includes `--device=shm`, `--device=dri`, and `--share=ipc`. The main process also sets `--no-sandbox` on Linux. Rebuild the Flatpak after changing finish-args.

**Dev tip:** `npm run dev:electron` uses Vite on `http://localhost:5173` — YouTube embeds behave like in the browser (valid HTTP origin).

`predist`: CSS + emoji + icon only.
