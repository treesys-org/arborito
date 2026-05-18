#!/usr/bin/env bash
# Reemplazo masivo: identificadores y prefijos arborito-gun-* → Nostr.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

while IFS= read -r -d '' f; do
  perl -i -pe '
    s/arborito-gun-/arborito-nostr-/g;
    s/selfDeleteGunForumAccount/selfDeleteNostrForumAccount/g;
    s/inviteGunCollaborator/inviteNostrCollaborator/g;
    s/removeGunCollaborator/removeNostrCollaborator/g;
    s/canMutateGunGraph/canMutateNostrGraph/g;
    s/\bgunCreateChild\b/nostrCreateChild/g;
    s/\bgunDeleteNodeByPath\b/nostrDeleteNodeByPath/g;
    s/\bgunRenameNodeByPath\b/nostrRenameNodeByPath/g;
    s/\bgunMoveNode\b/nostrMoveNode/g;
    s/publishActiveTreeToGunUniverse/publishActiveTreeToNostrUniverse/g;
    s/reuseGunUrl/reuseNostrTreeUrl/g;
    s/activeGunRef/activeTreeRef/g;
    s/resolvedGunUrl/resolvedNostrTreeUrl/g;
    s/_renderGunHealth/_renderNetworkHealth/g;
    s/treeGunHealth/treeNetworkHealth/g;
    s/_prevGunLiveSeeds/_prevNostrLiveSeeds/g;
    s/newGunSeeds/newNostrLiveSeeds/g;
    s/gunSeedsChanged/nostrLiveSeedsChanged/g;
    s/\bgunFooter\b/publicForumFooter/g;
    s/moveNodeGun/moveNodeNostr/g;
    s/seenGunUrls/seenPublishedTreeUrls/g;
    s/ownPublishedGunUrls/ownPublishedTreeUrls/g;
    s/\bgunHitCap\b/directoryHitCap/g;
    s/\bgunFetchError\b/directoryFetchError/g;
    s/localPublishedGunUrl/localPublishedNetworkUrl/g;
    s/publishedGunParsed/publishedNetworkParsed/g;
    s/btn-copy-my-gun-pub/btn-copy-my-nostr-pub/g;
    s/inner\.gun/inner.nostrPair/g;
    s/data\.gun\b/data.nostrPair/g;
    s/slot\.treeSnapshotRef \|\| slot\.gunSnapshotRef/slot.treeSnapshotRef/g;
    s/\|\| raw\.meta\.gunBundleFormat === 2//g;
    s/\(bundle\.meta && bundle\.meta\.gunBundleFormat === 2\)/(bundle.meta \&\& bundle.meta.nostrBundleFormat === 2)/g;
    s/opts\.gunUrl/opts.nostrTreeUrl/g;
    s/gunUrl\?/nostrTreeUrl?/g;
    s/\bgunPair\b/nostrPair/g;
    s/publish a signed DID claim to Gun/publish a signed DID claim to Nostr/g;
    s/GunDB is not loaded/Nostr client is not loaded/g;
    s/open gun:\/\/ trees/open nostr:\/\/ trees/g;
    s/auto-report on gun:\/\//auto-report on nostr:\/\//g;
    s/public \(gun:\/\/\)/public (nostr:\/\/)/g;
    s/public Gun link/public tree link/g;
    s/getActiveGunRef/getActivePublicTreeRef/g;
  ' "$f"
done < <(find src locales docs -type f \( -name '*.js' -o -name '*.json' -o -name '*.md' -o -name '*.css' \) -print0)

echo "strip-gun-identifiers: done."
