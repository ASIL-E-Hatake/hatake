#!/usr/bin/env python3
"""Validate hatake documents against a spec/ schema.

Usage: python spec/tools/validate_schema.py [--schema <name>] [file ...]
Defaults to hatake-page.schema.json and the bundled example documents.
`--schema hatake-intent.schema.json` checks the intent documents (what a human
asked for) and `--schema hatake-project.schema.json` the project preambles
(what kind of system this is) instead. Supports YAML and JSON inputs.
"""
import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

SPEC = Path(__file__).resolve().parent.parent
DEFAULT_SCHEMA = "hatake-page.schema.json"

CATALOG_PATH = SPEC / "examples" / "index.json"

# The example catalog is the list of examples — deriving the default set from it
# means a new example cannot be validated here but missing from the catalog (or
# the other way round).
DEFAULT_DOCS = [
    SPEC / "examples" / entry["file"]
    for entry in json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["examples"]
] + sorted(
    # The public demo's own definitions (the same app plus a demo-only viewer
    # action, and the standalone samples the playground offers) — keep them
    # schema-valid too, since they are what visitors actually see. Every asset,
    # not a named one: a second asset used to sit here unchecked.
    (SPEC.parent / "flutter" / "packages" / "hatake_example" / "assets").glob("*.yaml")
)


def load(path: Path):
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        return json.loads(text)
    return yaml.safe_load(text)


# 定義の他に、人が手で書く hatake の紙が2種類ある（言ったこと＝意図、案件の前書き）。
# 同じ道具で見るのは、検証の書き方を増やさないため（--schema を渡さなければ従来どおり
# 定義を見る）。置き場を表で持つので、3種類目が来ても道具は増えない。
DOCS_BY_SCHEMA = {
    "hatake-intent.schema.json": SPEC / "intents",
    "hatake-project.schema.json": SPEC / "projects",
}


def main(argv):
    schema_name = DEFAULT_SCHEMA
    if argv[:1] == ["--schema"]:
        schema_name = argv[1]
        argv = argv[2:]
    schema = json.loads((SPEC / schema_name).read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    folder = DOCS_BY_SCHEMA.get(schema_name)
    default_docs = DEFAULT_DOCS if folder is None else sorted(folder.glob("*.yaml"))
    docs = [Path(a).resolve() for a in argv] or default_docs
    failures = 0
    for doc in docs:
        data = load(doc)
        errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
        rel = doc.relative_to(SPEC) if doc.is_relative_to(SPEC) else doc
        if not errors:
            print(f"OK   {rel}")
            continue
        failures += 1
        print(f"FAIL {rel}")
        for e in errors:
            location = "/".join(str(p) for p in e.path) or "(root)"
            print(f"     - at {location}: {e.message}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
