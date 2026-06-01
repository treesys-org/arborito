# `arborito-index.json` on HTTP sources (E2)

If the tree URL points to an **HTTP site** that exposes a `data/` folder with a manifest, the client can load an **`arborito-index.json`** alongside the tree. The download is **optional** and only feeds the version / rolling list in the UI. It is format support for sources that already publish that JSON.

## Where the client looks

The logic lives in `discoverManifest` in [`src/features/sources/source-manager.js`](../src/features/sources/source-manager.js). For an HTTP source URL it tries, in order, candidates derived from the base URL:

1. `arborito-index.json` next to the resolved tree URL.
2. `../arborito-index.json` relative to that base.
3. If the URL contains `/data/`, also `…/data/arborito-index.json` (absolute path rebuilt from the `/data/` segment).

The first valid JSON updates `availableReleases`. Nostr, `local://`, and non-HTTP origins do **not** go through this discovery.

## Expected format

A JSON object with:

- `rolling` — optional; must include at least `url` (a relative `./` is resolved against the manifest base).
- `releases` — optional; an array of entries, each with a `url`.

This lets you use a manifest produced by a static-site build **without** depending on Nostr for the version listing.
