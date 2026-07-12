# Authoring without a terminal (recommended flow)

**Goal:** everyday authoring and reading happen **inside the app**, without a terminal. The source of truth is the **graph** (Nostr and/or the local garden), the cache is **IndexedDB**, and synchronisation goes through the **app itself** (publish, open a tree, export `.arborito`).

## In the app

In the in-app manual: section **"Courses without a terminal"** / **"Cursos sin terminal"** (`sec-authoring`), with the same message in English and Spanish.

### Construction mode walkthrough

1. Turn on **Construction** (helmet icon in the sidebar or dock).
2. A **product tour** highlights the toolbar: undo, languages, tree info, permissions, publish.
3. Tap any **node on the map** to edit it. Folders hold lessons; leaves open the lesson editor.
4. Open **Sage** (owl) for step-by-step guides: Add, Edit, Publish. Tap **Tour** in Sage to replay the spotlight tour.
5. When you open a **lesson** in construction, a separate **lesson edit tour** walks through title, toolbar, insert menu, quiz, syllabus, and save.

### Optional diplomas on sub-folders

Default progress gives students **one tree trophy** per imported branch. To add a trophy for a specific module or sub-folder:

1. Select the folder on the map.
2. Tap the **trophy** button next to Move (gray = off, gold = on). You can also use **Properties → Issue diploma**.

See [`ACHIEVEMENTS.md`](ACHIEVEMENTS.md) for how trophies are counted.

## Related

- [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md), how publishing a tree to Nostr is bundled and delivered.
- [`DEPLOY_GITHUB_PAGES.md`](DEPLOY_GITHUB_PAGES.md), Vite production build for static hosting.
- [`BIG_TREE_ACCEPTANCE.md`](BIG_TREE_ACCEPTANCE.md), manual validation on a real fixture before tagging a public version.
- [`ACHIEVEMENTS.md`](ACHIEVEMENTS.md), tree trophies vs author diplomas.
