import { describe, expect, it } from "vitest";
import {
  DefinitionParseError,
  parsePageJson,
  parsePageYaml,
  type ReportPageDefinition,
} from "../src/index.js";

const yaml = `
dsl_version: "1.0"
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  search:
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額, type: number, format: currency }
  report:
    paper: { size: A4, orientation: landscape }
    rowsPerPage: 25
    limit: 500
    sort: { field: customer, ascending: false }
    groupBy:
      - { field: customer, label: 顧客, pageBreak: true }
    totals:
      - { field: amount, aggregate: sum }
      - { field: amount, aggregate: count }
  actions:
    - { id: csv, type: export, label: CSV出力, config: { bom: true } }
`;

describe("report parse", () => {
  const page = parsePageYaml(yaml) as ReportPageDefinition;

  it("parses conditions, detail columns and the printing structure", () => {
    expect(page.kind).toBe("report");
    expect(page.search?.filters[0].operator).toBe("between");
    expect(page.table.columns.map((c) => c.field)).toEqual(["orderNo", "amount"]);
    expect(page.report.paper).toEqual({ size: "A4", orientation: "landscape" });
    expect(page.report.rowsPerPage).toBe(25);
    expect(page.report.limit).toBe(500);
    // A report has no clickable headers, so its order lives in the definition.
    expect(page.report.sortField).toBe("customer");
    expect(page.report.sortAscending).toBe(false);
    expect(page.report.groups).toEqual([
      { field: "customer", label: "顧客", pageBreak: true },
    ]);
    // Two totals may share a field (sum and count of the same column).
    expect(page.report.totals).toEqual([
      { field: "amount", aggregate: "sum" },
      { field: "amount", aggregate: "count" },
    ]);
    expect(page.actions[0].type).toBe("export");
  });

  it("falls back to A4 portrait, 40 lines and 1000 rows", () => {
    const plain = parsePageJson(
      JSON.stringify({
        page: {
          type: "report",
          id: "order_list",
          title: "受注一覧表",
          repository: "orderRepository",
        },
      }),
    ) as ReportPageDefinition;

    expect(plain.report).toEqual({
      paper: { size: "A4", orientation: "portrait" },
      rowsPerPage: 40,
      limit: 1000,
      sortField: undefined,
      sortAscending: true,
      groups: [],
      totals: [],
    });
  });

  it("a total defaults to sum", () => {
    const page = parsePageJson(
      JSON.stringify({
        page: {
          type: "report",
          id: "r",
          title: "R",
          repository: "orderRepository",
          report: { totals: [{ field: "amount" }] },
        },
      }),
    ) as ReportPageDefinition;

    expect(page.report.totals[0].aggregate).toBe("sum");
  });

  it("rejects a group without a label", () => {
    expect(() =>
      parsePageJson(
        JSON.stringify({
          page: {
            type: "report",
            id: "r",
            title: "R",
            repository: "orderRepository",
            report: { groupBy: [{ field: "customer" }] },
          },
        }),
      ),
    ).toThrow(DefinitionParseError);
  });
});
