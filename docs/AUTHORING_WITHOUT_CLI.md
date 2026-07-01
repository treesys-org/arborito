# Authoring without a terminal (recommended flow)

**Goal:** everyday authoring and reading happen **inside the app**, without a terminal. The source of truth is the **graph** (Nostr and/or the local garden), the cache is **IndexedDB**, and synchronisation goes through the **app itself** (publish, open a tree, export `.arborito`).

## In the app

In the in-app manual: section **"Courses without a terminal"** / **"Cursos sin terminal"** (`sec-authoring`), with the same message in English and Spanish.

## Related

- [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md) — how publishing a tree to Nostr is bundled and delivered.
- [`DEPLOY_GITHUB_PAGES.md`](DEPLOY_GITHUB_PAGES.md) — visitors do **not** run `npm`; the maintainer only regenerates CSS when they touch styles.
- [`BIG_TREE_ACCEPTANCE.md`](BIG_TREE_ACCEPTANCE.md) — manual validation on a real fixture before tagging a public version.
