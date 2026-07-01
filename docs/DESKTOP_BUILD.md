# Building release packages (Flatpak, Windows, Android)

First public release: **v0.1.0-alpha**. End users: [GitHub Releases](https://github.com/treesys-org/arborito/releases) or **More → Download app** inside [arborito.org](https://arborito.org).

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

Flatpak runtime **24.08** (not 23.08 — EOL):

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

Workflow **[Arborito Release](https://github.com/treesys-org/arborito/actions/workflows/arborito-release.yml)** (`.github/workflows/arborito-release.yml`) builds Flatpak, Windows, and Android APK in parallel on GitHub — no local build required.

| Trigger | Result |
|---------|--------|
| **Push tag `v*`** (e.g. `v0.1.0-alpha`) | Builds all three platforms and **publishes a GitHub Release** with binaries attached. Links in **More → Download app** (`releases/latest/download/…`) work immediately. |
| **Manual run** (`workflow_dispatch`) | Choose which targets to build; download binaries from the run **Artifacts**. Does not create a Release. |

### Build installers from GitHub (no local compile)

1. Open [Actions → Arborito Release](https://github.com/treesys-org/arborito/actions/workflows/arborito-release.yml).
2. **Run workflow** → select branch `main` → check Flatpak / Windows / Android.
3. When finished (~15–30 min), open the run → **Artifacts** → download `.flatpak`, `.exe`, or `.apk`.

### Publish an official Release (for end users)

Tag must match `package.json` `version` (with a leading `v`):

```bash
# package.json → "version": "0.1.0-alpha"
git tag v0.1.0-alpha
git push origin v0.1.0-alpha
```

GitHub Actions builds all three binaries and attaches them to the Release automatically.

## Output

`dist/` — e.g. `Arborito-0.1.0-alpha-x86_64.flatpak`, `Arborito Setup 0.1.0-alpha.exe`, `arborito-0.1.0-alpha.apk`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Runtimes EOL / missing | `npm run setup:flatpak` |
| `No remote refs found for flathub` | Likely inside a **container**. Exit and run `npm run setup:flatpak` on the **host**, or build only `--win` / `--android` in the container |
| `wine is required` | `sudo dnf install wine` |
| Flatpak opaque error | `DEBUG=@malept/flatpak-bundler npm run release:build -- --flatpak` |
| Bad icon | `rm build/icon.png && npm run ensure:icon` |
| Windows `build:css` fails | Run `npm install`, then `node ./scripts/build-css.mjs` — uses Tailwind via Node (no PATH shim) |
| Android `invalid source release: 21` | Install JDK **21** (`java -version`); CI uses Temurin 21 |

### Dev containers

Flatpak runtimes usually **cannot** be installed inside an isolated container. The script detects this and prints instructions.

```bash
# Inside container — APK and Windows only:
npm run release:build -- --win --android

# On the host — full build including Flatpak:
cd arborito && npm run setup:flatpak && npm run release:build
```

See also [`docs/FREEZE_VS_SNAPSHOTS.md`](FREEZE_VS_SNAPSHOTS.md) for the in-app **Freeze** toggle vs version snapshots.

`predist`: CSS + emoji + icon only.
