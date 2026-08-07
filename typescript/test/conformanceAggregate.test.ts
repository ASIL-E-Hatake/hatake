import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AggregateRegistry } from "../src/index.js";

// Shared dashboard aggregate fixture (spec/conformance), consumed identically by
// the Dart and Java editions, so a metric card shows the same number wherever it
// is computed.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/dashboard_aggregate.json", "utf8"),
);

/** Numbers are compared as normalized strings to absorb language differences. */
const num = (v: number | null | undefined): string =>
  v == null ? "null" : String(v);

describe("conformance: dashboard aggregate", () => {
  const registry = new AggregateRegistry();
  for (const c of fixture.aggregate as any[]) {
    it(c.name, () => {
      expect(num(registry.aggregate(c.op, c.rows, c.field))).toBe(
        num(c.expected),
      );
    });
  }
});

describe("conformance: dashboard aggregateBy", () => {
  const registry = new AggregateRegistry();
  for (const c of fixture.groupBy as any[]) {
    it(c.name, () => {
      const actual = registry.aggregateBy(
        c.op,
        c.rows,
        c.labelField,
        c.valueField,
      );
      expect(actual.map((b) => `${b.label}=${num(b.value)}`)).toEqual(
        (c.expected as any[]).map((b) => `${b.label}=${num(b.value)}`),
      );
    });
  }
});
