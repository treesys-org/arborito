# Network and scale (simple map)

Arborito has no app server. The site at [arborito.org](https://arborito.org) is static JavaScript; public courses live on **Nostr** (metadata) + **WebTorrent** (heavy bytes).

## Two layers

| Layer | Carries | Analogy |
|-------|---------|---------|
| **Nostr** | Share codes, course index, forum, directory | Card catalog entry |
| **WebTorrent** | Lessons, map JSON, assets | The pages of the book |

Millions of **readers** on the same course is feasible with WebTorrent + seeders. Millions of people **chatting live** at once is not. physical limits apply.

## Discovering courses

1. **Short code** (`ABCD-EF23`) → resolves the course on Nostr.
2. **Forest → Internet search** (≥ 3 chars) → relay query with `#t` tags.
3. **Direct link** `nostr://…` always works even if not in the directory.

There is no mandatory central catalog. The Discover directory is **consultative**; authors can opt out at publish time.

## Publishing (bundle v2)

Only **bundle v2** (chunked) is supported.

On **first** publish, Arborito allocates a **random** Nostr `universeId` (`brn-…` for a branch, `tre-…` for a composed tree). Authors do not choose or paste that id. Republish reuses the existing id.

| Piece | When it loads |
|-------|----------------|
| Tree index (no lesson bodies) | When opening the course |
| Each lesson body | When opening that lesson |
| Forum | When opening the forum modal |
| Search pack | After index → local IndexedDB worker |

### Forest directory row

Directory metadata includes:

| Field | Role |
|-------|------|
| `title` | Fallback display string |
| `titles` | Map of curriculum-lang → course title; Forest shows `titles[UI language]` when present |
| `languages` | Curriculum folders shipped (`ES`, `EN`, …) → language chips |
| `description` / `authorName` | Blurb and author |
| `icon` | Optional catalog emoji (course glyph in Forest); omitted when unset |

Search indexes all strings in `titles` plus `title` / description / author.
## Nostr relays

By default **no relay** until the user accepts the network in onboarding or **Privacy & data**.

Suggested bundle: `SUGGESTED_NOSTR_RELAYS` in `nostr-relays-runtime.js`. Deploy override: `window.ARBORITO_NOSTR_RELAYS` in `index.html`.

**Invariant:** a relay error **never** deletes local data.

## Security (entry points)

All traffic goes through known modules; do not add ad-hoc relay `fetch` in features:

| Module | Role |
|--------|------|
| `nostr/api/client/index.js` | Nostr client (one pool) |
| `connected-services/` | GDPR consent + network init |
| `sources/api/source-manager.js` | Load `branch://`, `tree://`, `nostr://` |
| `stores/nostr-*-store-actions.js` | Network actions |

Consent before connecting. Private keys never in logs or DOM.

## Search

| Type | Scope |
|------|-------|
| **Inside open course** | Worker + IndexedDB; scales with course size |
| **Global directory (Forest)** | Nostr metadata; ~160 visible rows in UI |

Optional job: `npm run directory-index:build` for signed recent/top snapshots (800 rows each).

## Freeze (reminder)

Freeze is **not** part of the network. it is a local desktop copy. See [`PRODUCT_GUIDE.md`](PRODUCT_GUIDE.md#freeze-vs-versions-the-most-confusing-part).

## More detail

- Account and sync: [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md)
- EU compliance: [`DSA_COMPLIANCE.md`](DSA_COMPLIANCE.md)
- Web deploy: [`RELEASE.md`](RELEASE.md)
