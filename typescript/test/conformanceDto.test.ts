import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveDto, parsePageJson, type DtoSpec } from "../src/index.js";

// Shared DTO derivation fixture (spec/conformance), consumed identically by the
// Java edition. Constraint values are compared as strings so numeric
// representations cannot diverge between languages.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/dto_spec.json", "utf8"),
);

/** Renders a DtoSpec into the fixture's comparable form. */
function canonical(spec: DtoSpec): unknown {
  return {
    page: spec.page,
    shapes: spec.shapes.map((s) => ({
      name: s.name,
      role: s.role,
      members: s.members.map((m) => {
        const out: Record<string, unknown> = {
          name: m.name,
          label: m.label,
          type: m.type,
          optional: m.optional,
          readOnly: m.readOnly,
          computed: m.computed,
        };
        if (m.itemType !== undefined) out.itemType = m.itemType;
        if (m.shape !== undefined) out.shape = m.shape;
        out.constraints = Object.fromEntries(
          Object.entries(m.constraints).map(([k, v]) => [k, String(v)]),
        );
        return out;
      }),
    })),
  };
}

/** Normalizes the fixture's expectation to the same key order / string values. */
function expectedCanonical(expected: any): unknown {
  return {
    page: expected.page,
    shapes: expected.shapes.map((s: any) => ({
      name: s.name,
      role: s.role,
      members: s.members.map((m: any) => {
        const out: Record<string, unknown> = {
          name: m.name,
          label: m.label,
          type: m.type,
          optional: m.optional,
          readOnly: m.readOnly,
          computed: m.computed,
        };
        if (m.itemType !== undefined) out.itemType = m.itemType;
        if (m.shape !== undefined) out.shape = m.shape;
        out.constraints = Object.fromEntries(
          Object.entries(m.constraints ?? {}).map(([k, v]) => [k, String(v)]),
        );
        return out;
      }),
    })),
  };
}

describe("conformance: DTO derivation", () => {
  for (const c of fixture.cases as any[]) {
    it(c.name, () => {
      const page = parsePageJson(JSON.stringify(c.page));
      expect(canonical(deriveDto(page))).toEqual(expectedCanonical(c.expected));
    });
  }
});
