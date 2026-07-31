import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ageAt,
  buildQuery,
  computeTax,
  ConverterRegistry,
  fiscalHalf,
  fiscalQuarter,
  fiscalYear,
  FormatterRegistry,
  isBusinessDay,
  nextBusinessDay,
  prevBusinessDay,
  tenure,
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

describe("conformance: tax", () => {
  for (const c of load("tax.json")) {
    it(`${c.amount}@${c.rate} ${c.rounding ?? "floor"}${c.included ? " inc" : ""}`, () => {
      const r = computeTax(c.amount, {
        rate: c.rate,
        included: c.included === true,
        rounding: c.rounding ?? "floor",
      });
      expect(r).toEqual({ net: c.expected.net, tax: c.expected.tax, gross: c.expected.gross });
    });
  }
});

describe("conformance: fiscal", () => {
  for (const c of load("fiscal.json")) {
    it(`${c.date} sm=${c.startMonth ?? 4}`, () => {
      const sm = c.startMonth ?? 4;
      expect(fiscalYear(c.date, sm)).toBe(c.expected.year);
      expect(fiscalQuarter(c.date, sm)).toBe(c.expected.quarter);
      expect(fiscalHalf(c.date, sm)).toBe(c.expected.half);
    });
  }
});

describe("conformance: age/tenure", () => {
  for (const c of load("age.json")) {
    it(`${c.from} -> ${c.to}`, () => {
      expect(tenure(c.from, c.to)).toEqual({ years: c.years, months: c.months });
      expect(ageAt(c.from, c.to)).toBe(c.years);
    });
  }
});

describe("conformance: business day", () => {
  for (const c of load("businessday.json")) {
    it(`${c.date} h=${c.holidays.length}`, () => {
      expect(isBusinessDay(c.date, c.holidays)).toBe(c.expected.isBusinessDay);
      expect(nextBusinessDay(c.date, c.holidays)).toBe(c.expected.next);
      expect(prevBusinessDay(c.date, c.holidays)).toBe(c.expected.prev);
    });
  }
});
