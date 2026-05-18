#!/usr/bin/env python3
"""
Pass 3: rename identifiers (gunRef → treeRef, gunRows → nostrRows) and scrub
remaining Gun/GunDB wording in comments — does NOT touch vendor/, storage keys,
or bundle JSON field names (gunBundleFormat, gunSnapshotRef, publishedGunUrl, …).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src"
SKIP = {"vendor", "node_modules", ".git"}


def walk_js():
    for p in sorted(ROOT.rglob("*.js")):
        if any(x in p.parts for x in SKIP):
            continue
        yield p


def transform(text: str, path: Path) -> str:
    t = text
    # Identifier: parsed public tree { pub, universeId }
    t = re.sub(r"\bgunRef\b", "treeRef", t)

    # mergeNostrAndTorrentDirectoryRows (this file only)
    if path.name == "global-directory-torrent.js":
        t = re.sub(r"\bgunRows\b", "nostrRows", t)
        t = t.replace("@param {typeof gunRows}", "@param {typeof nostrRows}")
        t = t.replace("@returns {typeof gunRows}", "@returns {typeof nostrRows}")

    # Comments / user-facing fallbacks (safe substrings; avoid touching URLs/keys)
    subs = [
        ("Network/Gun loads only", "Network loads only"),
        ("Start or stop the Gun presence", "Start or stop the Nostr presence"),
        ("Passkey login needs Gun enabled", "Passkey login needs Nostr relays"),
        ("Passkey registration needs Gun enabled", "Passkey registration needs Nostr relays"),
        ("Online account needs Gun enabled", "Online account needs Nostr relays"),
        ("Recovery needs Gun enabled", "Recovery needs Nostr relays"),
        ("Replace sync secret on Gun", "Replace sync secret on the network"),
        ("Removes sync hash from Gun", "Removes sync hash from the network"),
        ("Replace all backup codes on Gun", "Replace all backup codes on the network"),
        ("local always; Gun:", "local always; public tree:"),
        ("return its Gun ref", "return its public tree ref"),
        ("Encrypted progress sync (GunDB)", "Encrypted progress sync (Nostr)"),
        ("Publish an already-signed forum message to WebTorrent + Gun v3", "Publish an already-signed forum message to WebTorrent + Nostr v3"),
        ("Publicación Gun formato", "Publicación Nostr formato"),
        ("Mensajes por nodo Gun bajo", "Mensajes por nodo bajo"),
        ("Gun warns on arrays", "Nostr bundle warns on arrays"),
        ("grafo Gun en construcción", "grafo público en construcción"),
        ("in-memory Gun (or any non-local)", "in-memory public tree (or any non-local)"),
        ("Load Gun without persisting", "Load public tree without persisting"),
        ("Árboles Gun:", "Árboles públicos:"),
        ("/** Gun: mapa inviteePub", "/** Colaboradores: mapa inviteePub"),
        ("Local/Gun saves", "Local/network saves"),
        ("jardín local / Gun (autor)", "jardín local / red (autor)"),
        ("public Gun URL", "public tree URL"),
        ("Mismo shape que Gun", "Mismo shape que filas Nostr"),
        ("Carga invitaciones firmadas desde Gun", "Carga invitaciones firmadas desde la red"),
        ("Mutar grafo Gun", "Mutar grafo publicado"),
        ("--- GunDB (public", "--- Nostr (public"),
        ("Si un par está en la lista decodificada, **esta app no carga** ese `gun://`", "Si un par está en la lista decodificada, **esta app no carga** ese `nostr://`"),
        ("`gun://…` o URL", "`nostr://…` o URL"),
        ("Índices globales Gun", "Índices globales Nostr"),
        ("publicación del curso sigue en Gun", "publicación del curso sigue en Nostr"),
        ("Snapshots para flujo de versiones en Gun", "Snapshots para flujo de versiones en red"),
        ("One-time backup recovery codes for passkey accounts (stored on Gun", "One-time backup recovery codes for passkey accounts (stored on Nostr"),
        ("Canonical message signed for Gun publication", "Canonical message signed for Nostr publication"),
        ("treeGunHealthSeedsLabel", "treeNetworkHealthSeedsLabel"),
    ]
    for old, new in subs:
        t = t.replace(old, new)

    return t


def main() -> int:
    n = 0
    for path in walk_js():
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            continue
        out = transform(raw, path)
        if out != raw:
            path.write_text(out, encoding="utf-8")
            n += 1
    print(f"Updated {n} files", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
