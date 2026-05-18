#!/usr/bin/env python3
"""
Second pass: replace remaining Gun/gun identifiers with Nostr/network naming.
Skips vendor/ and node_modules. UTF-8 files only.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"vendor", "node_modules", ".git"}

# (old, new) — longest matches first where order matters
REPLACEMENTS: list[tuple[str, str]] = [
    # Locale JSON keys (quoted) — pair with ui. replacements below
    ('"gunAccountRemovedByAdminBody"', '"nostrAccountRemovedByAdminBody"'),
    ('"gunAccountRemovedByAdminTitle"', '"nostrAccountRemovedByAdminTitle"'),
    ('"gunBundleFormatUnsupported"', '"nostrBundleFormatUnsupported"'),
    ('"gunIdentityUnavailable"', '"nostrIdentityUnavailable"'),
    ('"gunLessonLoadEmpty"', '"nostrLessonLoadEmpty"'),
    ('"gunLessonLoadError"', '"nostrLessonLoadError"'),
    ('"gunLoadFailedError"', '"nostrLoadFailedError"'),
    ('"gunNotLoadedHint"', '"nostrNotLoadedHint"'),
    ('"gunPublicWarningBody"', '"nostrPublicWarningBody"'),
    ('"gunPublicWarningCheck"', '"nostrPublicWarningCheck"'),
    ('"gunPublicWarningConfirm"', '"nostrPublicWarningConfirm"'),
    ('"gunPublicWarningTitle"', '"nostrPublicWarningTitle"'),
    ('"gunStructureEditHint"', '"nostrStructureEditHint"'),
    ('"gunUniverseRevokedError"', '"nostrUniverseRevokedError"'),
    ('"governanceForumPolicyNeedGun"', '"governanceForumPolicyNeedNetwork"'),
    ('"governanceGunForumHint"', '"governanceNostrForumHint"'),
    ('"governanceGunIntro"', '"governanceNostrIntro"'),
    ('"governanceGunTree"', '"governanceNostrTree"'),
    ('"governanceNoGun"', '"governanceNoPublicTree"'),
    ('"forumNoGunUniverse"', '"forumNoPublicUniverse"'),
    ('"revokeGunConfirmBody"', '"revokePublicTreeConfirmBody"'),
    ('"revokeGunConfirmButton"', '"revokePublicTreeConfirmButton"'),
    ('"revokeGunConfirmTitle"', '"revokePublicTreeConfirmTitle"'),
    ('"revokeGunDockLabel"', '"revokePublicTreeDockLabel"'),
    ('"revokeGunDockTooltip"', '"revokePublicTreeDockTooltip"'),
    ('"revokeGunError"', '"revokePublicTreeError"'),
    ('"revokeGunNoKeyBody"', '"revokePublicTreeNoKeyBody"'),
    ('"revokeGunNoKeyTitle"', '"revokePublicTreeNoKeyTitle"'),
    ('"revokeGunNoUniverse"', '"revokePublicTreeNoUniverse"'),
    ('"revokeGunSuccessBody"', '"revokePublicTreeSuccessBody"'),
    ('"revokeGunSuccessTitle"', '"revokePublicTreeSuccessTitle"'),
    # ui.* in JS / HTML
    ("ui.gunAccountRemovedByAdminBody", "ui.nostrAccountRemovedByAdminBody"),
    ("ui.gunAccountRemovedByAdminTitle", "ui.nostrAccountRemovedByAdminTitle"),
    ("ui.gunBundleFormatUnsupported", "ui.nostrBundleFormatUnsupported"),
    ("ui.gunIdentityUnavailable", "ui.nostrIdentityUnavailable"),
    ("ui.gunLessonLoadEmpty", "ui.nostrLessonLoadEmpty"),
    ("ui.gunLessonLoadError", "ui.nostrLessonLoadError"),
    ("ui.gunLoadFailedError", "ui.nostrLoadFailedError"),
    ("ui.gunNotLoadedHint", "ui.nostrNotLoadedHint"),
    ("ui.gunPublicWarningBody", "ui.nostrPublicWarningBody"),
    ("ui.gunPublicWarningCheck", "ui.nostrPublicWarningCheck"),
    ("ui.gunPublicWarningConfirm", "ui.nostrPublicWarningConfirm"),
    ("ui.gunPublicWarningTitle", "ui.nostrPublicWarningTitle"),
    ("ui.gunStructureEditHint", "ui.nostrStructureEditHint"),
    ("ui.gunUniverseRevokedError", "ui.nostrUniverseRevokedError"),
    ("ui.governanceForumPolicyNeedGun", "ui.governanceForumPolicyNeedNetwork"),
    ("ui.governanceGunForumHint", "ui.governanceNostrForumHint"),
    ("ui.governanceGunIntro", "ui.governanceNostrIntro"),
    ("ui.governanceGunTree", "ui.governanceNostrTree"),
    ("ui.governanceNoGun", "ui.governanceNoPublicTree"),
    ("ui.forumNoGunUniverse", "ui.forumNoPublicUniverse"),
    ("ui.revokeGunConfirmBody", "ui.revokePublicTreeConfirmBody"),
    ("ui.revokeGunConfirmButton", "ui.revokePublicTreeConfirmButton"),
    ("ui.revokeGunConfirmTitle", "ui.revokePublicTreeConfirmTitle"),
    ("ui.revokeGunDockLabel", "ui.revokePublicTreeDockLabel"),
    ("ui.revokeGunDockTooltip", "ui.revokePublicTreeDockTooltip"),
    ("ui.revokeGunError", "ui.revokePublicTreeError"),
    ("ui.revokeGunNoKeyBody", "ui.revokePublicTreeNoKeyBody"),
    ("ui.revokeGunNoKeyTitle", "ui.revokePublicTreeNoKeyTitle"),
    ("ui.revokeGunNoUniverse", "ui.revokePublicTreeNoUniverse"),
    ("ui.revokeGunSuccessBody", "ui.revokePublicTreeSuccessBody"),
    ("ui.revokeGunSuccessTitle", "ui.revokePublicTreeSuccessTitle"),
    ("store.ui.gunIdentityUnavailable", "store.ui.nostrIdentityUnavailable"),
    ("store.ui.gunNotLoadedHint", "store.ui.nostrNotLoadedHint"),
    # Nostr service loaders
    ("loadGunUniverseBundle", "loadNostrUniverseBundle"),
    ("loadGunSnapshotChunk", "loadNostrSnapshotChunk"),
    ("loadGunForumPack", "loadNostrForumPack"),
    # Store / sync methods
    ("materializeGunReleaseSnapshot", "materializeNetworkReleaseSnapshot"),
    ("syncGunProgressNow", "syncNetworkProgressNow"),
    ("maybeNotifyGunAccountRemoved", "maybeNotifyNetworkAccountRemoved"),
    ("ensureGunForumPlaceLoaded", "ensureTreeForumPlaceLoaded"),
    ("ensureGunForumThreadLoaded", "ensureTreeForumThreadLoaded"),
    ("ensureGunForumThreadWeekLoaded", "ensureTreeForumThreadWeekLoaded"),
    ("getGunForumThreadWeeks", "getTreeForumThreadWeeks"),
    ("searchGunForumV3", "searchTreeForumV3"),
    # Private forum cache fields on Store
    ("_gunForumHydratedForSourceId", "_treeForumHydratedForSourceId"),
    ("_gunForumLoadedPlaces", "_treeForumLoadedPlaces"),
    ("_gunForumLoadedThreads", "_treeForumLoadedThreads"),
    ("_gunForumLoadedThreadWeeks", "_treeForumLoadedThreadWeeks"),
    ("_gunForumPlaceKey", "_treeForumPlaceKey"),
    # UI store presence
    ("gunLiveSeeds", "nostrLiveSeeds"),
    # Bundle meta counters (add nostr* alongside gun* in writer — separate edit)
    # DOM id in tree-info
    ("tree-info-gun-health", "tree-info-network-health"),
    # User-store published URL API
    ("setLocalTreePublishedGunUrl", "setLocalTreePublishedNetworkUrl"),
    ("getLocalTreePublishedGunUrl", "getLocalTreePublishedNetworkUrl"),
    ("clearLocalTreePublishedGunUrl", "clearLocalTreePublishedNetworkUrl"),
    ("publishedGunUrl", "publishedNetworkUrl"),
    # Phrases (comments / user strings) — careful order
    ("GunDB is disabled", "Nostr relays unavailable"),
    ("Enable gun.js + sea.js", "Configure relays and reload"),
    ("gun.js / sea.js", "Nostr client"),
    ("Open your published Gun tree", "Open your published public tree"),
    ("public Gun tree", "public tree"),
    ("public Gun source", "public tree source"),
    ("published Gun", "published public tree"),
    ("Gun tree", "public tree"),
    ("Gun universe", "public universe"),
    ("Gun forums", "Network forums"),
    ("Gun forum", "Network forum"),
    ("Gun-backed", "Nostr-backed"),
    ("Gun bundle", "Nostr bundle"),
    ("Gun metadata", "network metadata"),
    ("Gun may be unavailable", "Relays may be unavailable"),
    ("Gun normalizado", "nostr:// normalizado"),
    ("Gun + HTTPS", "Nostr + HTTPS"),
    ("Gun universe", "Nostr tree"),
    ("--- Gun universe ---", "--- Nostr tree ---"),
    ("Gun progress", "Network progress"),
    ("Gun publisher", "Tree publisher"),
    ("Gun `directoryBump`", "Nostr directory bump"),
    ("Gun trees:", "Nostr trees:"),
    ("Gun / in-memory", "Nostr / in-memory"),
    ("Local / Gun", "Local / Nostr"),
    ("local or Gun tree", "local or public tree"),
    ("Gun SEA", "Nostr keys"),
    ("Gun publication", "Nostr publication"),
    ("Gun CRUD", "graph CRUD"),
    ("Gun lazy", "lazy network"),
]

EXTS = {".js", ".mjs", ".json", ".md", ".html", ".txt", ".css"}


def should_skip(path: Path) -> bool:
    parts = path.parts
    return any(p in SKIP_DIRS for p in parts)


def main() -> int:
    changed = 0
    files = 0
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or should_skip(path):
            continue
        if path.suffix.lower() not in EXTS:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        orig = text
        for old, new in REPLACEMENTS:
            text = text.replace(old, new)
        if text != orig:
            path.write_text(text, encoding="utf-8")
            changed += 1
            files += 1
    print(f"Updated {files} files under {ROOT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
