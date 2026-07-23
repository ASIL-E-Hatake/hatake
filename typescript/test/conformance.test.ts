import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildQuery,
  ConverterRegistry,
  FormatterRegistry,
  ValidatorRegistry,
} from "../src/index.js";

// Shared conformance fixtures (spec/conformance), consumed identically by the
// Dart and Java editions.
const DIR = "../spec/conformance";
const load = (file: string): any[] =>
  JSON.parse(readFileSync(`${DIR}/${file}`, "utf8"));

describe("conformance: formatters", () => {
  const fmt = new FormatterRegistry();
  for (const c of load("formatters.json")) {
    it(`${c.name} ${JSON.stringify(c.value)} ${JSON.stringify(c.options ?? {})}`, () => {
      expect(fmt.format(c.name, c.value, c.options ?? {})).toBe(c.expected);
    });
  }
});

describe("conformance: converters", () => {
  const conv = new ConverterRegistry();
  for (const c of load("converters.json")) {
    it(`${c.name} ${JSON.stringify(c.value)}`, () => {
      expect(String(conv.convert(c.name, c.value))).toBe(String(c.expected));
    });
  }
});

describe("conformance: validators", () => {
  const validators = new ValidatorRegistry();
  for (const c of load("validators.json")) {
    it(`${c.type} ${JSON.stringify(c.value)}`, () => {
      const result = validators.run(c.value, { type: c.type, params: c.params ?? {} });
      expect(result === null).toBe(c.valid);
      if (c.message != null) expect(result).toBe(c.message);
    });
  }
});

describe("conformance: queries", () => {
  for (const c of load("queries.json")) {
    it(JSON.stringify(c.params), () => {
      const search = {
        columns: 1,
        filters: c.filters.map((f: any) => ({
          field: f.field,
          label: f.field,
          type: f.type,
          operator: f.operator,
          options: [],
          config: {},
        })),
      };
      const q = buildQuery(search, c.params);
      const e = c.expected;
      expect(q.conditions.length).toBe(e.conditions.length);
      e.conditions.forEach((ec: any, i: number) => {
        expect(q.conditions[i].field).toBe(ec.field);
        expect(q.conditions[i].operator).toBe(ec.operator);
        expect(String(q.conditions[i].value)).toBe(String(ec.value));
      });
      expect(q.sortField ?? null).toBe(e.sortField);
      expect(q.sortAscending).toBe(e.sortAscending);
      expect(q.page).toBe(e.page);
      expect(q.pageSize).toBe(e.pageSize);
    });
  }
});
