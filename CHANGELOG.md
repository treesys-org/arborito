# Changelog

All notable changes to Arborito are documented here.

Arborito ships as **web** ([arborito.org](https://arborito.org), continuous deploys from `main`) and as **optional installs** (Linux Flatpak, Windows, Android) cut on [GitHub Releases](https://github.com/treesys-org/arborito/releases). Tagged versions below describe those installable cuts and the product state at that tag; the live site may already include later fixes from `main`.

## 0.1.1-alpha — 2026-07-27

### Added

- Linux Flatpak **install ref** and signed remote on arborito.org so Software / Discover can install and update the desktop app.
- In-app update prompt on Linux packaged builds (opens the system installer for the new ref).
- In-app update prompt on Android (opens the APK download; the system asks to confirm install).

### Fixed

- Modal dialog behaviour and related UI bugs.
- Course catalog (**Courses** in the nav; **Cursos** in Spanish): tabs for individual courses (branches) and combined courses (trees), with the forest metaphor kept in the subtitle and captions.
- **Edit branches** is visible on composed trees without opening the ⋯ menu.
- Lesson quiz recall: “I remember” / “I don’t remember” always uses recall feedback (no longer falls through to Incorrect when mode state was missing).
- Publish / Update for local branches and composed trees: dock and hub stay aligned after edits; published baseline freezes at success time; missing snapshot no longer looks “up to date”.
- Construction dock no longer switches to a dead **Publish** label when editing inside a map folder (keeps Update / Up to date and opens the hub).
- Publish hub change list shows lesson titles (not internal IDs) and avoids nested scroll for a short list of edits.
- Composed-tree publish uses the same local branch-set fingerprint as the dock (no stuck Update state after a successful publish).
- Composed-tree republish from Courses keeps prior forest-listing and forum choices; failed attempts no longer leave a false Update state.
- Public bundle publish writes chunks before the header (generation-scoped main parts) so a mid-update failure does not mix old and new curriculum; disabling the forum replaces the on-relay forum pack with an empty one; a share-code claim binds the local garden identity so a retry reuses the same public URL.
- Generation-scoped lesson, search, snapshot, and forum packs; Discover-off delists before updating the public copy (hard fail if delist cannot complete); share links stay hidden while a publish is still pending.
- Owner-opened published courses migrate themselves from legacy bundle addresses to generation-scoped packs in the background (same link and share code).
- On mobile Certificates, **View** opens the diploma; Share and Download sit in the modal footer.
- Publish hub: forum and forest-listing switches stay available when the public copy is up to date; clearer copy for listing a course in the forest.
- Closing the catalog with no course loaded restores the bundled Arborito demo.
- Local-media publish confirm appears before the publishing lock.
- Finish lesson persists the last outline section; reset progress on a branch; shared links install into the garden by default with an Install switch in course info; composed trees can sync playlist metadata to the account.
- Discover listings no longer show the private “My Private Garden” starter blurb as if it were a public course description.

### Notes

- Windows continues to update via GitHub Releases (`latest.yml`). Android remains a direct APK from Releases. Web users on arborito.org keep receiving site deploys independently of this tag.

## 0.1.0-alpha — 2026-07-16

### Added

- Public alpha: interactive lesson maps, Memory Garden, optional Arcade and Sage AI on desktop.
- Web app at arborito.org; optional Flatpak / Windows / Android builds on GitHub Releases.
