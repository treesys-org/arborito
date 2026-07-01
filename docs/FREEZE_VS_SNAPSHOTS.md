# Freeze vs version snapshots

Two different ideas — do not merge them in the UI.

## Freeze (Congelar) — sky-blue toggle, **desktop app only**

**What it does:** Saves a copy **on this device** and stops checking the network for updates.

- **Games (Arcade):** `~/.config/Arborito/offline-games/<id>/bundle.json`
- **Community trees:** `~/.config/Arborito/frozen-trees/<id>.json`

**Desktop-only on purpose:** avoids confusion with the web version switcher (snapshots).

**Not synced via account:** freeze flags in `arborito-progress`; payloads are local files. See [USER_DATA_LAYOUT.md](USER_DATA_LAYOUT.md).

**User message (i18n):** see `locales/*/sources.json` freeze strings (e.g. EN: frozen until unfrozen; ES: “Congelado: no recibirá actualizaciones hasta que lo descongeles.”).

## Version snapshots — curriculum timeline

**What they do:** Author-published **versions** of a course. You **choose** a version to study.

**Where:** Tree switcher → Version tab, construction snapshots, `.arborito` export.

## Why not one button?

| | Freeze | Snapshots |
|---|--------|-----------|
| Who controls it | Learner | Author |
| Updates | Blocked while frozen | Pick another version |
| Web | Hidden | Available |
| Account sync | No | Private trees yes; public versions via network |

## Implementation

- `frozenTrees` + `offlineGames` flags in `arborito-progress`.
- Payloads: `tree-freeze-cache.js`, `game-offline-cache.js` → Electron userData files only.
- UI: `isElectronDesktop()` guard in Arcade and Sources list.
