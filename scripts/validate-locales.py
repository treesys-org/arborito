#!/usr/bin/env python3
"""Validate modular locale packs: EN/ES parity and complete manifest coverage."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ROOT / "locales"
LANGS = ["en", "es"]


def load_manifest():
    return json.loads((LOCALES / "manifest.json").read_text(encoding="utf-8"))


def merge_modules(lang: str, namespaces: list) -> dict:
    out = {}
    for ns in namespaces:
        path = LOCALES / lang / f"{ns}.json"
        if not path.exists():
            raise SystemExit(f"Missing module {path}")
        part = json.loads(path.read_text(encoding="utf-8"))
        for k in part:
            if k in out:
                raise SystemExit(f'Duplicate key "{k}" in {path}')
            out[k] = part[k]
    return out


def main():
    manifest = load_manifest()
    namespaces = manifest["namespaces"]
    if not namespaces:
        print("manifest.json has no namespaces")
        return 1

    merged = {lang: merge_modules(lang, namespaces) for lang in LANGS}
    en_keys = set(merged["en"])
    es_keys = set(merged["es"])
    only_en = sorted(en_keys - es_keys)
    only_es = sorted(es_keys - en_keys)
    if only_en or only_es:
        print("EN/ES key mismatch in modules:")
        if only_en:
            print("  only EN:", only_en)
        if only_es:
            print("  only ES:", only_es)
        return 1

    for lang in LANGS:
        lang_dir = LOCALES / lang
        if not lang_dir.is_dir():
            print(f"Missing directory {lang_dir}")
            return 1
        # `pack.json` is the generated monolithic bundle (scripts/build-locale-packs.mjs),
        # not a namespace — exclude it from the manifest coverage check.
        on_disk = {p.stem for p in lang_dir.glob("*.json")} - {"pack"}
        manifest_set = set(namespaces)
        extra = sorted(on_disk - manifest_set)
        missing = sorted(manifest_set - on_disk)
        if extra:
            print(f"{lang}: JSON files not listed in manifest.json: {extra}")
            return 1
        if missing:
            print(f"{lang}: manifest namespaces missing on disk: {missing}")
            return 1

    print(f"OK : {len(en_keys)} keys × {len(LANGS)} langs × {len(namespaces)} namespaces")
    return 0


if __name__ == "__main__":
    sys.exit(main())
