# Changelog

All notable changes to Arborito are documented here.

Arborito ships as **web** ([arborito.org](https://arborito.org), continuous deploys from `main`) and as **optional installs** (Linux Flatpak, Windows, Android) cut on [GitHub Releases](https://github.com/treesys-org/arborito/releases). Tagged versions below describe those installable cuts and the product state at that tag; the live site may already include later fixes from `main`.

## 0.1.2-alpha — 2026-08-01

### Changed

- Catalog and chrome copy: the nav and panel are consistently **Courses**; combined courses are **playlists**. Tours, Sage shortcuts, Achievements, and the bundled Arborito demo use the same vocabulary (no leftover Sources / Catalog / Forest mix in the UI).
- Default Nostr relay suggestions: stock list prefers relays that already carry Arborito directory and bundle data; legacy unbroken stock lists migrate once to the new set without rewriting custom relay choices.
- Product tours and empty states match the current Courses footer (**Create** → course or playlist) and map chrome.

### Fixed

- Removing an installed course (including after an author unpublishes) remounts the bundled Arborito demo — never an empty sky graph.
- Deleted private account drafts stay deleted: local delete always clears the network blob when signed in, and a durable denylist blocks account pull from resurrecting them; composed-tree deletes clear private sync too.
- Modal dialog behaviour and related UI bugs.
- Course catalog: **My courses** / **Explore**, create course or playlist, and playlist management without opening the ⋯ menu for common actions.
- Lesson quiz recall: “I remember” / “I don’t remember” always uses recall feedback (no longer falls through to Incorrect when mode state was missing).
- Publish / Update for local branches and composed trees: dock and hub stay aligned after edits; published baseline freezes at success time; missing snapshot no longer looks “up to date”.
- Construction dock no longer switches to a dead **Publish** label when editing inside a map folder (keeps Update / Up to date and opens the hub).
- Publish hub change list shows lesson titles (not internal IDs) and avoids nested scroll for a short list of edits.
- Product tour next/back: smoother spotlight motion (no mid-scroll jump when changing steps).
- Product tour tip copy: always use the UI font (not the emoji font stack) so GitHub Pages does not stretch word spacing; tip/shades use inline `position:fixed` on `document.body`.
- About modal uses the shared dock-hub size on desktop (same family as Forum / course info), shows the app version on the Manifesto tab (not in the header), and keeps the Manifesto layout compact enough to fit without scrolling on typical desktop heights.
- Lazy feature CSS (Sage, construction, Courses, contributor share-code): load with the feature chunk or await before open so production deploys do not flash unstyled chrome.
- Editable copy from a network tree: materialize lazy lessons with limited concurrency (faster forks on large courses).
- Install skips remount when that course is already open.
- Playlists load their course refs in parallel.
- Network courses paint the topic map as soon as the structure skeleton arrives, then finish loading the full bundle in the background; your own published mirrors pick up the skeleton automatically when you open them.
- First-run onboarding: tighter welcome layout (no huge empty band above the buttons); account creation probes relay latency (~2s), races only live peers for the first ACK, uses lighter register proof-of-work, and confirms after ACK without claiming a free name if a timed-out put still landed.
- Playlist publish uses the same local branch-set fingerprint as the dock (no stuck Update state after a successful publish).
- Playlist republish from Courses keeps prior Discover-listing and forum choices; failed attempts no longer leave a false Update state.
- Public bundle publish writes chunks before the header (generation-scoped main parts) so a mid-update failure does not mix old and new curriculum; disabling the forum replaces the on-relay forum pack with an empty one; a share-code claim binds the local garden identity so a retry reuses the same public URL.
- Generation-scoped lesson, search, snapshot, and forum packs; Discover-off delists before updating the public copy (hard fail if delist cannot complete); share links stay hidden while a publish is still pending.
- Owner-opened published courses migrate themselves from legacy bundle addresses to generation-scoped packs in the background (same link and share code).
- On mobile Achievements, **View** opens the diploma; Share and Download sit in the modal footer.
- Publish hub: forum and Discover-listing switches stay available when the public copy is up to date.
- Local-media publish confirm appears before the publishing lock.
- Finish lesson persists the last outline section; reset progress on a course; shared links install into the garden by default with an Install switch in course info; playlists can sync metadata to the account.
- Discover listings no longer show the private “My Private Garden” starter blurb as if it were a public course description.
- Web deploy refresh: a cached older page no longer sticks on a blank screen after an update (build-id check before boot + one automatic reload if old script chunks are missing).

### Notes

- Windows continues to update via GitHub Releases (`latest.yml`). Android remains a direct APK from Releases. Web users on arborito.org keep receiving site deploys independently of this tag.

## 0.1.1-alpha — 2026-07-27

### Added

- Linux Flatpak **install ref** and signed remote on arborito.org so Software / Discover can install and update the desktop app.
- In-app update prompt on Linux packaged builds (opens the system installer for the new ref).
- In-app update prompt on Android (opens the APK download; the system asks to confirm install).
- When an author unpublishes a public course, students see a clear dialog and can save what is already on the device to My garden (or remove it from installed). Authors are told offline copies may remain.

### Fixed

- Modal dialog behaviour and related UI bugs.

### Notes

- Windows continues to update via GitHub Releases (`latest.yml`). Android remains a direct APK from Releases. Web users on arborito.org keep receiving site deploys independently of this tag.

## 0.1.0-alpha — 2026-07-16

### Added

- Public alpha: interactive lesson maps, Memory Garden, optional Arcade and Sage AI on desktop.
- Web app at arborito.org; optional Flatpak / Windows / Android builds on GitHub Releases.
