#!/usr/bin/env python3
"""Check that the OpenAPI documents the emitter is expected to produce are valid.

The conformance tests only prove TypeScript and Java *agree*; they cannot catch
both agreeing on a malformed document. This validates the fixture's expected
output against the OpenAPI 3.1 specification, and spot-checks the structural
promises the emitter makes.

Usage: python spec/tools/check_openapi.py   (run from the repository root)
"""
import json
import pathlib
import sys

from openapi_spec_validator import validate

SPEC = pathlib.Path(__file__).resolve().parent.parent

fixture = json.loads(
    (SPEC / "conformance" / "dto_openapi.json").read_text(encoding="utf-8")
)

failures = 0


def fail(label: str) -> None:
    global failures
    failures += 1
    print(f"FAIL {label}")


def check(label: str, ok: bool) -> None:
    if ok:
        print(f"OK   {label}")
    else:
        fail(label)


def refs(node) -> list:
    """Every $ref value anywhere in the document."""
    if isinstance(node, dict):
        found = []
        for key, value in node.items():
            if key == "$ref":
                found.append(value)
            else:
                found.extend(refs(value))
        return found
    if isinstance(node, list):
        return [r for item in node for r in refs(item)]
    return []


# (a) every emitted document must be a legal OpenAPI 3.1 description
for case in fixture["cases"]:
    doc = dict(case["expected"])
    # A schemas-only document is a legal fragment, but the validator wants the key.
    doc.setdefault("paths", {})
    try:
        validate(doc)
        print(f"valid OpenAPI 3.1: {case['name'][:56]}")
    except Exception as exc:  # noqa: BLE001 - report whatever the validator raises
        fail(f"invalid document: {case['name'][:56]} "
             f"({type(exc).__name__}: {str(exc)[:200]})")

# (b) the structural promises, checked independently of both implementations
cases = {c["name"]: c["expected"] for c in fixture["cases"]}
crud = cases["crud page with a basePath yields the full CRUD surface"]
search = cases["read-only search page yields the list operation only"]
plain = cases["no basePath yields components.schemas only"]

check("3.1 is declared", str(crud["openapi"]).startswith("3.1"))

all_refs = refs(crud) + refs(search) + refs(plain)
check(
    f"all {len(all_refs)} $refs point into components.schemas",
    all(r.startswith("#/components/schemas/") for r in all_refs),
)
check(
    "every $ref resolves to a declared schema",
    all(
        r.rsplit("/", 1)[-1] in doc["components"]["schemas"]
        for doc in (crud, search, plain)
        for r in refs(doc)
    ),
)
check(
    "crud exposes list/create on the collection and get/update/delete on the item",
    sorted(crud["paths"]["/api/customers"]) == ["get", "post"]
    and sorted(crud["paths"]["/api/customers/{id}"]) == ["delete", "get", "put"],
)
check(
    "the list operation carries the RepositoryQuery contract",
    {"page", "pageSize", "sortField", "sortAscending"}
    <= {p["name"] for p in crud["paths"]["/api/customers"]["get"]["parameters"]},
)
check(
    "the list operation also carries the page's own filters",
    "name" in {p["name"] for p in crud["paths"]["/api/customers"]["get"]["parameters"]},
)
check(
    "the path parameter is declared required and in: path",
    all(
        p["required"] is True and p["in"] == "path"
        for op in crud["paths"]["/api/customers/{id}"].values()
        for p in op["parameters"]
    ),
)
check(
    "mutating operations answer 400 with the validation payload",
    crud["paths"]["/api/customers"]["post"]["responses"]["400"]["content"][
        "application/json"
    ]["schema"]["$ref"]
    == "#/components/schemas/ValidationErrorResponse",
)
check(
    "a read-only page exposes only the list operation",
    list(search["paths"]) == ["/api/orders"]
    and list(search["paths"]["/api/orders"]) == ["get"],
)
check(
    "a read-only page gets no validation-error schema",
    "ValidationErrorResponse" not in search["components"]["schemas"],
)
check("omitting basePath omits paths entirely", "paths" not in plain)
check("omitting basePath still emits schemas", len(plain["components"]["schemas"]) > 0)

print()
print("FAILURES:", failures)
sys.exit(1 if failures else 0)
