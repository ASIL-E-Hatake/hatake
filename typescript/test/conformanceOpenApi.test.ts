import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveDto, parsePageJson, toOpenApi } from "../src/index.js";

// Shared OpenAPI emitter fixture (spec/conformance), consumed identically by the
// Java edition. Scalars are compared as strings so numeric representations
// cannot diverge between languages.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/dto_openapi.json", "utf8"),
);

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

describe("conformance: OpenAPI emitter", () => {
  for (const c of fixture.cases as any[]) {
    it(c.name, () => {
      const page = parsePageJson(JSON.stringify(c.page));
      const doc = toOpenApi(deriveDto(page), c.options);
      expect(canonical(doc)).toEqual(canonical(c.expected));
    });
  }
});
