# Discovery without `arborito-index.json` (E1)

## What already exists on Nostr

- **Tree codes** (`share code`): the Nostr graph `arborito.codes.{code}` points to a signed record that resolves to `{ pub, universeId }`. See `resolveTreeShareCode` / `putTreeCodeClaim` in [`nostr-universe.js`](../src/features/nostr/nostr-universe.js).
- That covers **sharing a short link** without an HTTP manifest; it does not replace a global "catalogue" of every course.

## What's not in the product (yet)

- A **curated public registry** (list of universes, metadata, categories) would require **moderation** design, signatures, and possibly a well-known Nostr node (`arborito.registry.*`) with a stable schema.
- Until then, **E1** is satisfied at the **documentation + share-codes** level: authors publish from the app; readers come in via `nostr://…` or via a code, not via a JSON generated in CI.

## Coexistence with HTTP

Anyone still publishing a static site can use [`STATIC_ARBORITO_INDEX.md`](STATIC_ARBORITO_INDEX.md). It is **independent** from the Nostr registry.
