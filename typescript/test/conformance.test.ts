import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ageAt,
  buildQuery,
  computeInvoice,
  ComputedRegistry,
  computeTax,
  ConverterRegistry,
  eraOf,
  evaluateCondition,
  fiscalHalf,
  fiscalQuarter,
  fiscalYear,
  FormatterRegistry,
  isAllowed,
  isBusinessDay,
  nextBusinessDay,
  optionValueIsStale,
  prevBusinessDay,
  tenure,
  visibleOptions,
  type FieldDefinition,
  type FilterDefinition,
  type OptionsOwner,
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

describe("conformance: era", () => {
  for (const c of load("era.json")) {
    it(`${c.date}`, () => {
      expect(eraOf(c.date)).toEqual({
        name: c.expected.name,
        abbr: c.expected.abbr,
        year: c.expected.year,
      });
    });
  }
});

describe("conformance: invoice", () => {
  for (const c of load("invoice.json")) {
    it(`${c.lines.length} lines${c.included ? " inc" : ""}`, () => {
      const inv = computeInvoice(c.lines, {
        included: c.included === true,
        rounding: c.rounding ?? "floor",
      });
      expect(inv.byRate.length).toBe(c.expected.byRate.length);
      c.expected.byRate.forEach((er: any, i: number) => {
        expect(String(inv.byRate[i].rate)).toBe(String(er.rate));
        expect(inv.byRate[i].net).toBe(er.net);
        expect(inv.byRate[i].tax).toBe(er.tax);
        expect(inv.byRate[i].gross).toBe(er.gross);
      });
      expect(inv.total).toEqual({
        net: c.expected.total.net,
        tax: c.expected.total.tax,
        gross: c.expected.total.gross,
      });
    });
  }
});

describe("conformance: conditions", () => {
  for (const c of load("conditions.json")) {
    it(`${JSON.stringify(c.condition)} on ${JSON.stringify(c.record)} (mode: ${c.mode})`, () => {
      expect(evaluateCondition(c.condition, c.record, c.mode)).toBe(c.expected);
    });
  }
});

describe("conformance: option filter", () => {
  // 選択肢の連動。Dart 版と同じ fixture を食う（定義だけで決まる純粋なロジック）。
  const fixture = JSON.parse(
    readFileSync(`${DIR}/option_filter.json`, "utf8"),
  ) as { cases: any[] };
  for (const c of fixture.cases) {
    it(c.name, () => {
      // `as: filter` のケースは検索条件の形で確認する（判定は共有＝OptionsOwner）。
      const field: OptionsOwner =
        c.as === "filter"
          ? ({
              field: c.field.field,
              label: c.field.field,
              type: "select",
              operator: "equals",
              options: c.field.options,
              optionsFrom: c.field.optionsFrom,
              config: {},
            } satisfies FilterDefinition)
          : ({
              field: c.field.field,
              label: c.field.field,
              type: "select",
              required: false,
              readOnly: false,
              validators: [],
              options: c.field.options,
              optionsFrom: c.field.optionsFrom,
              normalize: [],
              config: {},
              roles: [],
              columns: [],
              rowFields: [],
            } satisfies FieldDefinition);
      expect(visibleOptions(field, c.record).map((o) => o.value)).toEqual(
        c.visible,
      );
      expect(optionValueIsStale(field, c.record)).toBe(c.stale);
    });
  }
});

describe("conformance: computed", () => {
  const reg = new ComputedRegistry();
  for (const c of load("computed.json")) {
    it(`${JSON.stringify(c.computed)} on ${JSON.stringify(c.record)}`, () => {
      expect(reg.compute(c.computed, c.record)).toBe(c.expected);
    });
  }
});

describe("conformance: access", () => {
  for (const c of load("access.json")) {
    it(`${JSON.stringify(c.roles)} / ${JSON.stringify(c.userRoles)}`, () => {
      expect(isAllowed(c.roles, c.userRoles)).toBe(c.expected);
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
