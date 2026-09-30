import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ReportDefinition } from "../src/internal.js";
import { reportTotalDepth, reportTotalLines } from "../src/internal.js";

/**
 * 帳票の小計・総計の升の字の共有フィクスチャを、Dart 版と同じ契約で回す。
 *
 * 画面（Flutter / Vue / React）と紙（hatake_print）と AI に読ませる紙（TS）が
 * 同じ字を出すことが値打ち。0.9.20 まで Web は同じ列の2つ目の合計を黙って落としていた。
 */
const fixture = JSON.parse(
  readFileSync("../spec/conformance/report_totals.json", "utf8"),
) as {
  cases: {
    name: string;
    totals: { field: string; aggregate: string }[];
    field: string;
    values: (number | null)[];
    expected: string[];
    depth: number;
  }[];
};

// 列の書式の代わり（フィクスチャの約束: `¥` + 数、整数なら小数点なし）。
const yen = (value: number): string => `¥${value}`;

describe("conformance: report totals", () => {
  for (const one of fixture.cases) {
    it(one.name, () => {
      const report = { totals: one.totals } as ReportDefinition;
      expect(reportTotalLines(report, one.field, { totals: one.values }, yen)).toEqual(
        one.expected,
      );
      expect(reportTotalDepth(report)).toBe(one.depth);
    });
  }
});
