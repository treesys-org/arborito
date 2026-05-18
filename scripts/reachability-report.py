#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable


IMPORT_RE = re.compile(
    r"""(?x)
    (?:^|\s)
    (?:
        import\s+(?:[\w*\s{},]*\s+from\s+)?   # import ... from
      | export\s+[\w*\s{},]*\s+from\s+        # export ... from
    )
    ["'](?P<spec>[^"']+)["']
    """
)

DYNAMIC_IMPORT_RE = re.compile(r"""import\(\s*["'](?P<spec>[^"']+)["']\s*\)""")
REQUIRE_RE = re.compile(r"""require\(\s*["'](?P<spec>[^"']+)["']\s*\)""")
WORKER_URL_RE = re.compile(
    r"""new\s+Worker\(\s*new\s+URL\(\s*["'](?P<spec>[^"']+)["']\s*,\s*import\.meta\.url\s*\)""",
)
URL_META_RE = re.compile(r"""new\s+URL\(\s*["'](?P<spec>[^"']+)["']\s*,\s*import\.meta\.url\s*\)""")


def _iter_specs(source: str) -> Iterable[str]:
    for m in IMPORT_RE.finditer(source):
        yield m.group("spec")
    for m in DYNAMIC_IMPORT_RE.finditer(source):
        yield m.group("spec")
    for m in REQUIRE_RE.finditer(source):
        yield m.group("spec")
    for m in WORKER_URL_RE.finditer(source):
        yield m.group("spec")
    for m in URL_META_RE.finditer(source):
        yield m.group("spec")


def _resolve_spec(from_file: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None

    base = (from_file.parent / spec).resolve()
    if base.is_file():
        return base

    for ext in (".js", ".mjs", ".cjs"):
        p = Path(str(base) + ext)
        if p.is_file():
            return p

    if base.is_dir():
        for idx in ("index.js", "index.mjs", "index.cjs"):
            p = (base / idx)
            if p.is_file():
                return p

    return None


def _read_text(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return p.read_text(encoding="utf-8", errors="replace")


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    knip_path = repo / "knip.json"
    pkg_path = repo / "package.json"

    entries: list[str] = []
    if knip_path.is_file():
        knip = json.loads(_read_text(knip_path))
        entries = list(knip.get("entry", []))
    else:
        entries = ["src/boot.js", "src/main.js", "electron-main.js"]

    # Add HTML entrypoint because it contains script/module tags in practice.
    entries.append("index.html")
    # Add Electron preload explicitly (referenced via path, not import/require).
    entries.append("preload.js")

    # Add node scripts referenced by package.json scripts (node ./scripts/*.mjs)
    if pkg_path.is_file():
        try:
            pkg = json.loads(_read_text(pkg_path))
            scripts = pkg.get("scripts", {}) if isinstance(pkg, dict) else {}
            for cmd in scripts.values():
                if not isinstance(cmd, str):
                    continue
                for m in re.finditer(r"""node\s+(\.\/scripts\/[^\s]+)""", cmd):
                    entries.append(m.group(1))
        except Exception:
            pass

    ignore_prefixes = {
        (repo / "src" / "vendor").resolve(),
        (repo / "vendor").resolve(),
        (repo / "node_modules").resolve(),
        (repo / "dist").resolve(),
        (repo / "release").resolve(),
        (repo / "package").resolve(),
    }

    def is_ignored(path: Path) -> bool:
        rp = path.resolve()
        if rp.name.endswith(".min.js"):
            return True
        if rp.name in {"tailwind.config.js", "postcss.config.js"}:
            return True
        return any(str(rp).startswith(str(pref) + os.sep) or rp == pref for pref in ignore_prefixes)

    queue: list[Path] = []
    reachable: set[Path] = set()

    for e in entries:
        p = (repo / e).resolve()
        if p.exists() and not is_ignored(p):
            queue.append(p)

    while queue:
        cur = queue.pop()
        if cur in reachable or is_ignored(cur) or not cur.exists():
            continue
        reachable.add(cur)

        if cur.suffix in {".js", ".mjs", ".cjs"}:
            src = _read_text(cur)
            for spec in _iter_specs(src):
                resolved = _resolve_spec(cur, spec)
                if resolved and resolved.exists() and not is_ignored(resolved):
                    queue.append(resolved)
        elif cur.suffix == ".html":
            html = _read_text(cur)
            for m in re.finditer(r"""<script[^>]+src=["']([^"']+)["']""", html, flags=re.IGNORECASE):
                src = m.group(1)
                if src.startswith("./") or src.startswith("../"):
                    p = (cur.parent / src).resolve()
                    if p.exists() and not is_ignored(p):
                        queue.append(p)

    candidates: list[Path] = []
    for p in repo.rglob("*.js"):
        if is_ignored(p):
            continue
        candidates.append(p.resolve())
    for p in repo.rglob("*.mjs"):
        if is_ignored(p):
            continue
        candidates.append(p.resolve())

    unreachable = sorted({p for p in candidates if p not in reachable})

    print("Reachable entrypoints:")
    for e in sorted({(repo / x).resolve() for x in entries if (repo / x).exists()}):
        print(f"  - {e.relative_to(repo)}")

    print("\nUnreachable JS modules (by import graph):")
    for p in unreachable:
        print(f"  - {p.relative_to(repo)}")

    print(f"\nCounts: reachable={len(reachable)} unreachable_js={len(unreachable)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

