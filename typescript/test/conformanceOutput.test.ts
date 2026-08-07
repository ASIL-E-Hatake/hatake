import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReport,
  csvOptionsFromConfig,
  defaultCsvOptions,
  parsePageJson,
  ReportBlockKinds,
  toCsv,
  type ColumnDefinition,
  type ReportBlock,
  type ReportPageDefinition,
} from "../src/index.js";

// Shared output fixtures (spec/conformance), consumed identically by the Dart
// and Java editions: a CSV comes out byte for byte the same, and a 帳票 breaks
// its pages in the same places.
const load = (file: string): any =>
  JSON.parse(readFileSync(`../spec/conformance/${file}`, "utf8"));

const column = (m: any): ColumnDefinition => ({
  field: m.field,
  label: m.label,
  type: m.type ?? "text",
  width: m.width,
  sortable: false,
  format: m.format,
  config: m.config ?? {},
  roles: [],
});

describe("conformance: csv", () => {
  for (const c of load("csv.json").cases as any[]) {
    it(c.name, () => {
      expect(
        toCsv(
          (c.columns as any[]).map(column),
          c.rows,
          c.options ? csvOptionsFromConfig(c.options) : defaultCsvOptions,
        ),
      ).toBe(c.expected);
    });
  }
});

/** Integers print without a decimal point so `300` and `300.0` compare equal. */
const num = (value: number | null | undefined): string =>
  value == null ? "null" : String(value);

/** `G<level>:<label>=<value>` / `D:<field>=<value>|…` / `S<level>:…` / `T:…` */
function encode(block: ReportBlock, page: ReportPageDefinition): string {
  const totals = (): string =>
    page.report.totals
      .map((t, i) => `${t.field}=${num(block.totals[i])}`)
      .join(",");
  switch (block.kind) {
    case ReportBlockKinds.groupHeader:
      return `G${block.level}:${block.label}=${block.value}`;
    case ReportBlockKinds.detail:
      return `D:${page.table.columns
        .map((c) => `${c.field}=${block.row[c.field]}`)
        .join("|")}`;
    case ReportBlockKinds.subtotal:
      return `S${block.level}:${totals()}`;
    case ReportBlockKinds.grandTotal:
      return `T:${totals()}`;
    default:
      return block.kind;
  }
}

describe("conformance: report", () => {
  for (const c of load("report.json").cases as any[]) {
    it(c.name, () => {
      const page = parsePageJson(
        JSON.stringify({ page: c.page }),
      ) as ReportPageDefinition;
      const document = buildReport(page.report, c.rows);
      expect(
        document.sheets.map((s) => s.blocks.map((b) => encode(b, page))),
      ).toEqual(c.expected);
    });
  }
});
