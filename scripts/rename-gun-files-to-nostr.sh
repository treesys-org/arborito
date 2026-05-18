#!/usr/bin/env bash
# Renombra módulos y rutas "gun" → "nostr" bajo arborito/ (sin vendor/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

rename_file() {
  local from="$1" to="$2"
  if [[ -f "$from" ]]; then
    mv "$from" "$to"
    echo "mv $from -> $to"
  else
    echo "skip missing: $from" >&2
  fi
}

rename_file "src/config/maintainer-gun-tree-blocklist.js" "src/config/maintainer-nostr-tree-blocklist.js"
rename_file "src/utils/gun-bundle-chunks.js" "src/utils/nostr-bundle-chunks.js"
rename_file "src/store/store-gun-sync-forum-community-methods.js" "src/store/store-nostr-sync-forum-community-methods.js"
rename_file "src/store/store-gun-admin-governance-methods.js" "src/store/store-nostr-admin-governance-methods.js"
rename_file "src/store/store-gun-graph-curriculum-methods.js" "src/store/store-nostr-graph-curriculum-methods.js"

[[ -f "src/config/gun-runtime-peers.js" ]] && rm -f "src/config/gun-runtime-peers.js" && echo "rm src/config/gun-runtime-peers.js"

# Docs: GUN_* → NOSTR_*
for pair in \
  "docs/GUN_BUNDLE_AND_PUBLISH.md:docs/NOSTR_BUNDLE_AND_PUBLISH.md" \
  "docs/GUN_DISCOVERY.md:docs/NOSTR_DISCOVERY.md" \
  "docs/GUN_STORAGE_NOTES.md:docs/NOSTR_STORAGE_NOTES.md" \
  "docs/BUILDER_FREE_INDEXEDDB_GUN_CHECKLIST.md:docs/BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md"; do
  IFS=: read -r from to <<<"$pair"
  [[ -f "$from" ]] && mv "$from" "$to" && echo "mv $from -> $to"
done

replace_in_tree() {
  find . -type f \
    \( -name '*.js' -o -name '*.mjs' -o -name '*.json' -o -name '*.html' -o -name '*.md' -o -name '*.txt' \) \
    ! -path './vendor/*' ! -path './node_modules/*' ! -path './.git/*' \
    -print0 | xargs -0 -r sed -i "$1"
}

replace_in_tree 's|store/store-gun-sync-forum-community-methods\.js|store/store-nostr-sync-forum-community-methods.js|g'
replace_in_tree 's|store/store-gun-admin-governance-methods\.js|store/store-nostr-admin-governance-methods.js|g'
replace_in_tree 's|store/store-gun-graph-curriculum-methods\.js|store/store-nostr-graph-curriculum-methods.js|g'
replace_in_tree 's|config/maintainer-gun-tree-blocklist\.js|config/maintainer-nostr-tree-blocklist.js|g'
replace_in_tree 's|utils/gun-bundle-chunks\.js|utils/nostr-bundle-chunks.js|g'
replace_in_tree 's|maintainer-gun-tree-blocklist|maintainer-nostr-tree-blocklist|g'
replace_in_tree 's|gun-bundle-chunks|nostr-bundle-chunks|g'

replace_in_tree 's/gunSyncForumCommunityMethods/nostrSyncForumCommunityMethods/g'
replace_in_tree 's/gunAdminGovernanceMethods/nostrAdminGovernanceMethods/g'
replace_in_tree 's/gunGraphCurriculumMethods/nostrGraphCurriculumMethods/g'

replace_in_tree 's/isGunTreeMaintainerBlocked/isNostrTreeMaintainerBlocked/g'
replace_in_tree 's/isGunTreeOnMaintainerBlocklist/isNostrTreeOnMaintainerBlocklist/g'
replace_in_tree 's/isGunUrlMaintainerBlocked/isNostrUrlMaintainerBlocked/g'

replace_in_tree 's/prepareGunSplitBundleV2/prepareNostrSplitBundleV2/g'
replace_in_tree 's/GUN_FORUM_MESSAGE_CHUNK/NOSTR_FORUM_MESSAGE_CHUNK/g'
replace_in_tree 's/gunMainLessonChunkKey/nostrMainLessonChunkKey/g'
replace_in_tree 's/gunSnapshotLessonChunkKey/nostrSnapshotLessonChunkKey/g'
replace_in_tree 's/gunSnapshotGraphChunkKey/nostrSnapshotGraphChunkKey/g'

replace_in_tree 's/getMyGunTreeAccessRole/getMyTreeNetworkRole/g'
replace_in_tree 's/refreshGunTreeGovernance/refreshTreeNetworkGovernance/g'
replace_in_tree 's/getForumModerationModeForActiveGunTree/getForumModerationModeForActiveTree/g'
replace_in_tree 's/setForumBanForActiveGunTree/setForumBanForActiveTree/g'

replace_in_tree 's/getGunAdminPairs/getNostrPublisherPairs/g'
replace_in_tree 's/saveGunAdminPair/saveNostrPublisherPair/g'
replace_in_tree 's/getGunAdminPair/getNostrPublisherPair/g'
replace_in_tree 's/removeGunAdminPair/removeNostrPublisherPair/g'

replace_in_tree 's/isGunSource/isNostrTreeSource/g'

replace_in_tree 's/hydrateGunForumIfNeeded/hydrateTreeForumIfNeeded/g'
replace_in_tree 's/mergeGunAndTorrentDirectoryRows/mergeNostrAndTorrentDirectoryRows/g'
replace_in_tree 's/mergeGunForumSnapshots/mergeNostrForumSnapshots/g'
replace_in_tree 's/mergeGunForumOverlayLive/mergeNostrForumOverlayLive/g'
replace_in_tree 's/loadGunProgressIntoUserStore/loadNetworkProgressIntoUserStore/g'

replace_in_tree 's/canRetractActiveGunUniverse/canRetractActivePublicUniverse/g'
replace_in_tree 's/getPublishedGunRefForActiveLocalSource/getPublishedTreeRefForActiveLocalSource/g'

echo "OK. Busca restos: grep -r gun src --include='*.js' | head"
