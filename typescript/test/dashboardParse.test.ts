import { describe, expect, it } from "vitest";
import {
  DefinitionParseError,
  parsePageJson,
  parsePageYaml,
  type DashboardPageDefinition,
} from "../src/index.js";

// A dashboard has no single record: no `key`, and `repository` is only the
// default for cards that omit one.
const yaml = `
dsl_version: "1.0"
page:
  type: dashboard
  id: sales_dashboard
  title: 売上ダッシュボード
  repository: orderRepository
  layout: { columns: 4 }
  search:
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  items:
    - id: total
      title: 受注金額
      span: 2
      value: { aggregate: sum, field: amount }
      format: currency
      config: { symbol: "¥" }
      filters: { status: 未出荷 }
      limit: 500
    - id: recent
      type: table
      title: 直近の受注
      sort: { field: orderDate, ascending: false }
      limit: 5
      columns:
        - { field: orderNo, label: 受注番号 }
    - id: byStatus
      type: chart
      title: 状態別
      repository: orderSummaryRepository
      chart: { kind: pie, labelField: status, valueField: amount, aggregate: sum }
  actions:
    - { id: openOrders, type: navigate, label: 受注照会, page: order_search }
`;

const json = JSON.stringify({
  dsl_version: "1.0",
  page: {
    type: "dashboard",
    id: "sales_dashboard",
    title: "売上ダッシュボード",
    repository: "orderRepository",
    layout: { columns: 4 },
    search: {
      filters: [
        { field: "orderDate", label: "受注日", type: "date", operator: "between" },
      ],
    },
    items: [
      {
        id: "total",
        title: "受注金額",
        span: 2,
        value: { aggregate: "sum", field: "amount" },
        format: "currency",
        config: { symbol: "¥" },
        filters: { status: "未出荷" },
        limit: 500,
      },
      {
        id: "recent",
        type: "table",
        title: "直近の受注",
        sort: { field: "orderDate", ascending: false },
        limit: 5,
        columns: [{ field: "orderNo", label: "受注番号" }],
      },
      {
        id: "byStatus",
        type: "chart",
        title: "状態別",
        repository: "orderSummaryRepository",
        chart: {
          kind: "pie",
          labelField: "status",
          valueField: "amount",
          aggregate: "sum",
        },
      },
    ],
    actions: [
      { id: "openOrders", type: "navigate", label: "受注照会", page: "order_search" },
    ],
  },
});

describe("dashboard parse", () => {
  const page = parsePageYaml(yaml) as DashboardPageDefinition;

  it("parses the board and its cards", () => {
    expect(page.kind).toBe("dashboard");
    expect(page.repository).toBe("orderRepository");
    expect(page.columns).toBe(4);
    expect(page.items.map((i) => i.id)).toEqual(["total", "recent", "byStatus"]);
    expect(page.search?.filters[0].operator).toBe("between");
  });

  it("defaults a card to a metric and keeps its query settings", () => {
    const metric = page.items[0];
    expect(metric.type).toBe("metric");
    expect(metric.value).toEqual({ aggregate: "sum", field: "amount" });
    expect(metric.span).toBe(2);
    expect(metric.limit).toBe(500);
    expect(metric.filters).toEqual({ status: "未出荷" });
    // No repository of its own: the page's default applies.
    expect(metric.repository).toBeUndefined();
  });

  it("reads sort, columns and chart per card", () => {
    expect(page.items[1].sortField).toBe("orderDate");
    expect(page.items[1].sortAscending).toBe(false);
    expect(page.items[1].columns.map((c) => c.field)).toEqual(["orderNo"]);
    expect(page.items[2].chart).toEqual({
      kind: "pie",
      labelField: "status",
      valueField: "amount",
      aggregate: "sum",
    });
    expect(page.items[2].repository).toBe("orderSummaryRepository");
  });

  it("YAML and JSON converge on an identical definition", () => {
    expect(parsePageJson(json)).toEqual(page);
  });

  it("rejects a board with no cards", () => {
    expect(() =>
      parsePageJson(
        JSON.stringify({ page: { type: "dashboard", id: "x", title: "x" } }),
      ),
    ).toThrow(DefinitionParseError);
  });
});
