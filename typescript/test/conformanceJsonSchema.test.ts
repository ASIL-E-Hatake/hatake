import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveDto, parsePageJson, toJsonSchema } from "../src/index.js";

// Shared JSON Schema emitter fixture (spec/conformance), consumed identically by
// the Java edition. Scalars are compared as strings so numeric representations
// cannot diverge between languages.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/dto_json_schema.json", "utf8"),
);

/** Recursively stringifies scalars so 6 and 6.0 compare equal across languages. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        canonical(v),
      ]),
    );
  }
  return String(value);
}

describe("conformance: JSON Schema emitter", () => {
  for (const c of fixture.cases as any[]) {
    it(c.name, () => {
      const page = parsePageJson(JSON.stringify(c.page));
      const schema = toJsonSchema(deriveDto(page));
      expect(canonical(schema)).toEqual(canonical(c.expected));
    });
  }
});
