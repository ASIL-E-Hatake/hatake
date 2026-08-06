#!/usr/bin/env python3
"""Check the JSON Schema documents that the DTO emitter is expected to produce.

The 3-language conformance tests only prove TypeScript and Java *agree*; they
cannot catch both agreeing on a malformed schema. This checks the fixture's
expected output independently: every document must be a legal JSON Schema
2020-12, and it must actually accept/reject the payloads the DSL promises.

Usage: python spec/tools/check_dto_schema.py   (run from the repository root)
"""
import json
import pathlib

from jsonschema import Draft202012Validator

SPEC = pathlib.Path(__file__).resolve().parent.parent

fixture = json.loads(
    (SPEC / "conformance" / "dto_json_schema.json").read_text(encoding="utf-8")
)

# (a) every emitted document must itself be a legal JSON Schema
for case in fixture["cases"]:
    doc = case["expected"]
    Draft202012Validator.check_schema(doc)
    print(f"valid schema: {case['name'][:52]}")

# (b) spot-check the semantics we care about
docs = {c["expected"]["title"]: c["expected"] for c in fixture["cases"]}

checks = [
    # (title, shape, payload, should_pass, why)
    ("customer_master", "CustomerMasterRequest",
     {"code": "C001", "name": "山田商事"}, True, "minimal valid request"),
    ("customer_master", "CustomerMasterRequest",
     {"name": "山田商事"}, False, "missing required code"),
    ("customer_master", "CustomerMasterRequest",
     {"code": "C0000001", "name": "x"}, False, "maxLength 6 exceeded"),
    ("customer_master", "CustomerMasterRequest",
     {"code": "C001", "name": "x", "credit": -1}, False, "minimum 0 violated"),
    ("customer_master", "CustomerMasterRequest",
     {"code": "C001", "name": "x", "email": "nope"}, False, "format email"),
    ("customer_master", "CustomerMasterRequest",
     {"code": "C001", "name": "x", "surprise": 1}, False,
     "request is closed to unknown keys"),
    ("customer_master", "CustomerMasterRow",
     {"id": "1", "name": "x", "credit": 1, "extra": True}, True,
     "response stays open to extra keys"),
    ("customer_master", "CustomerMasterListResponse",
     {"items": [{"id": "1", "name": "x", "credit": 1}], "totalCount": 1}, True,
     "list response resolves the row $ref"),
    ("customer_master", "CustomerMasterQuery",
     {"openedAt": ["2026-01-01", "2026-12-31"]}, True, "between as a 2-element array"),
    ("customer_master", "CustomerMasterQuery",
     {"openedAt": "2026-01-01"}, False, "between must be an array"),
    ("order_entry", "OrderEntryRequest",
     {"orderNo": "SO-1", "lines": [{"item": "鉛筆", "qty": 2}]}, True,
     "child rows via $ref"),
    ("order_entry", "OrderEntryRequest",
     {"orderNo": "SO-1", "lines": [{"item": "鉛筆", "qty": 0}]}, False,
     "child row minimum 1 violated"),
    ("order_entry_paged", "OrderEntryPagedRequest",
     {"orderNo": "SO-1", "lines": []}, False,
     "source-backed lines are not part of the parent request"),
    ("order_entry_paged", "OrderEntryPagedLinesRow",
     {"item": "x", "zip": "1234567"}, True, "postalCode pattern accepts 7 digits"),
    ("order_entry_paged", "OrderEntryPagedLinesRow",
     {"item": "x", "zip": "12-34"}, False, "postalCode pattern rejects junk"),
]

# format checks need the format assertion turned on
FORMAT_CHECKER = Draft202012Validator.FORMAT_CHECKER

failures = 0
for title, shape, payload, should_pass, why in checks:
    doc = docs[title]
    v = Draft202012Validator(
        {**doc, "$ref": f"#/$defs/{shape}"}, format_checker=FORMAT_CHECKER
    )
    errors = list(v.iter_errors(payload))
    passed = not errors
    ok = passed == should_pass
    if not ok:
        failures += 1
    print(f"{'OK  ' if ok else 'FAIL'} {shape}: {why}"
          + ("" if ok else f"  (expected pass={should_pass}, got {passed}: "
                          f"{[e.message for e in errors][:1]})"))

print()
print("FAILURES:", failures)
raise SystemExit(1 if failures else 0)
