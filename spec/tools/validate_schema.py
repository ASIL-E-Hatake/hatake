#!/usr/bin/env python3
"""Validate hatake definition documents against spec/hatake-page.schema.json.

Usage: python spec/tools/validate_schema.py [file ...]
Defaults to the bundled example documents. Supports YAML and JSON inputs.
"""
import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

SPEC = Path(__file__).resolve().parent.parent
SCHEMA_PATH = SPEC / "hatake-page.schema.json"

DEFAULT_DOCS = [
    SPEC / "examples" / "customer_master.yaml",
    SPEC / "examples" / "product_search.yaml",
    SPEC / "examples" / "dept_master.yaml",
    SPEC / "examples" / "customer_detail.yaml",
    SPEC / "examples" / "customer_form.yaml",
    SPEC / "examples" / "sales_app.yaml",
]


def load(path: Path):
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        return json.loads(text)
    return yaml.safe_load(text)


def main(argv):
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    docs = [Path(a).resolve() for a in argv] or DEFAULT_DOCS
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
