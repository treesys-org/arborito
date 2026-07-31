# Network and scale (simple map)

Arborito has no app server. The site at [arborito.org](https://arborito.org) is static JavaScript; public courses live on **Nostr** (metadata) + **WebTorrent** (heavy bytes).

## Two layers

| Layer | Carries | Analogy |
|-------|---------|---------|
| **Nostr** | Share codes, course index, forum, directory | Card catalog entry |
| **WebTorrent** | Lessons, map JSON, assets | The pages of the book |

Millions of **readers** on the same course is feasible with WebTorrent + seeders. Millions of people **chatting live** at once is not; physical limits apply.

## Discovering courses

1. **Short code** (`ABCD-EF23`, with or without `#`) → resolves the course on Nostr.
2. **Courses → Explore / Discover** (browse or search ≥ 3 chars) → bounded directory crawl + `#t` trigram search on relays; optional signed snapshots / HTTP–torrent mirrors.
3. **Direct link** `nostr://…` always works even if not in the directory.

There is no mandatory central catalog. The Discover directory is **consultative**; authors can opt out at publish time.

### How Discover stays fast at catalogue scale

The client never walks “every course on the network.” Caps live in `src/features/p2p-webtorrent/api/directory-index-config.js` and are documented here so they stay intentional:

| Piece | Role at scale |
|-------|----------------|
| **First page / “Show more”** | Fetch about **48** rows, then bump toward a **2000** row ceiling (`DIRECTORY_CLIENT_FETCH_*`). UI paginates locally. |
| **Live crawl** | Pages relay directory events with **per-relay** `until` cursors (a shared cursor would skip dense relays when a sparse peer returns a wide time span), up to **~3000 events** and **~180 days**. Stops when the browse window cannot improve. |
| **Trigram `#t` search** | Deep / older listings: search, not an unbounded crawl. |
| **Share code** | O(1) claim resolve + one directory row — works even when browse never reached that course. |
| **Optional snapshots** | Signed recent/top indexes (800 rows each) when publishers are configured. |
| **Revoked / empty bundles** | Newest bundle header wins across lagging relays. A small header sample marks **known-dead** keys; **unknown** listings stay visible (incomplete intel must not empty Discover). No per-row revoke round-trip over the catalogue. |

**Invariant:** Discover work is O(page size + crawl budget), not O(total published courses).

## Publishing (bundle v2)

Only **bundle v2** (chunked) is supported.

On **first** publish, Arborito allocates a **random** Nostr `universeId` (`brn-…` for a branch / course, `tre-…` for a composed tree / playlist). Authors do not choose or paste that id. Republish reuses the existing id.

| Piece | When it loads |
|-------|----------------|
| Tree index (no lesson bodies) | When opening the course |
| Each lesson body | When opening that lesson |
| Forum | When opening the forum modal |
| Search pack | After index → local IndexedDB worker |

### Directory row

Directory metadata includes:

| Field | Role |
|-------|------|
| `title` | Fallback display string |
| `titles` | Map of curriculum-lang → course title; Courses UI shows `titles[UI language]` when present |
| `languages` | Curriculum folders shipped (`ES`, `EN`, …) → language chips |
| `description` / `authorName` | Blurb and author |
| `shareCode` | Public `XXXX-XXXX` code when published |
| `icon` | Optional catalog emoji; omitted when unset |
| `contentKind` | `branch` (course) or `composed-tree` (playlist) |

Search indexes `titles`, `title`, description, author, and share code.

## Nostr relays

By default **no relay** until the user accepts the network in onboarding or **Privacy & data**.

Suggested bundle: `SUGGESTED_NOSTR_RELAYS` in `nostr-relays-runtime.js`. Deploy override: `window.ARBORITO_NOSTR_RELAYS` in `index.html`.

**Invariant:** a relay error **never** deletes local data.

## Security (entry points)

All traffic goes through known modules; do not add ad-hoc relay `fetch` in features:

| Module | Role |
|--------|------|
| `nostr/api/client/index.js` | Nostr client (one pool) |
| `src/shared/lib/connected-services/` | GDPR consent + network init |
| `sources/api/source-manager.js` | Load `branch://`, `tree://`, `nostr://` |
| `stores/nostr-*-store-actions.js` | Network actions |

Consent before connecting. Private keys never in logs or DOM.

## Search

| Type | Scope |
|------|-------|
| **Inside open course** | Worker + IndexedDB; scales with course size |
| **Global directory (Courses / Discover)** | Nostr metadata; browse is a bounded window, search + share code reach the rest |

Optional job: `npm run directory-index:build` for signed recent/top snapshots (800 rows each).

## Offline (reminder)

Offline (UI label; code may still say “freeze”) is **not** part of the network. It is a local desktop copy. See [`PRODUCT_GUIDE.md`](PRODUCT_GUIDE.md#offline-vs-versions-the-most-confusing-part).

## More detail

- Account and sync: [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md)
- EU compliance: [`DSA_COMPLIANCE.md`](DSA_COMPLIANCE.md)
- Web deploy: [`RELEASE.md`](RELEASE.md)
