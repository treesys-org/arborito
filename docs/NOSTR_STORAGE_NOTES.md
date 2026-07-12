# Nostr storage and "garbage" (G3)

Nostr does not behave like a **filesystem** with guaranteed global deletion. Data that was once published to the network can still exist in replicas or caches depending on peers and network policy.

## Product implications

- **Deleting a node in the app** updates the graph your readers fetch via the paths Arborito uses; it doesn't trigger automatic **garbage collection** of every historical blob across the whole Nostr network.
- **Don't** promise the user that "delete" is irreversible erasure on every Nostr server on the planet.
- Local copies, **IndexedDB** and `.arborito` **exports**: are under the device's control; they can be cleaned up deterministically there (see the search index and local gardens in the checklist).

## Related documentation

- [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md), default relay list and how to override it at deployment time.
- [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md), bundle format and publish flow.
