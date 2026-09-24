import { describe, expect, it } from "vitest";

import { parseAppSource } from "../src/explainSource.js";
import { toOpenApiApp } from "../src/openApiApp.js";

/**
 * app 1枚から、サーバの受け口を1つの OpenAPI にする。
 *
 * これまで `openapi` は画面1枚しか読めず、業務システムの定義（画面が5〜10枚）を
 * 渡すと API 一覧が出せなかった。見本1本目では結局手で書いた。
 */
const source = `
dsl_version: "1.0"
app:
  id: sales
  title: 販売管理
  home: orders
  menu:
    - { id: orders, label: 受注照会, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
    - type: crud
      id: order_entry
      title: 受注入力
      repository: orderRepository
      key: orderNo
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
      form:
        sections:
          - fields:
              - { field: orderNo, label: 受注番号, type: text, required: true }
    - type: master
      id: customer_master
      title: 顧客マスタ
      repository: customerRepository
      key: customerCode
      table:
        columns:
          - { field: customerCode, label: 顧客コード }
      form:
        sections:
          - fields:
              - { field: customerCode, label: 顧客コード, type: text, required: true }
`;

/** 受け口を持たない画面（ページに `repository` が無い）。 */
const withDashboard = `${source}
    - type: dashboard
      id: sales_dashboard
      title: 売上
      items:
        - id: total
          type: metric
          title: 売上
          repository: orderRepository
          value: { aggregate: sum, field: amount }
`;

const build = (base?: string, from = source) =>
  toOpenApiApp(parseAppSource(from).pages, { basePath: base });

describe("app ぜんたいの OpenAPI", () => {
  it("Repository ごとに1つの資源にまとまる（画面の数ではない）", () => {
    const { document } = build("/api");
    // 受注は2画面あるが、叩く先は1つ。
    expect(Object.keys(document.paths as object).sort()).toEqual([
      "/api/customers",
      "/api/customers/{customerCode}",
      "/api/orders",
      "/api/orders/{orderNo}",
    ]);
  });

  it("集合の名前は wire / probe と同じ推測（orderRepository → orders）", () => {
    const { document } = build("/api");
    expect(document.paths).toHaveProperty("/api/orders");
  });

  it("同じ口がぶつかったら、黙って捨てずに言う", () => {
    const { clashes } = build("/api");
    // 一覧は検索画面が先に取り、受注入力も同じ所を指す。
    const list = clashes.find(
      (one) => one.method === "get" && one.path === "/api/orders",
    );
    expect(list).toBeDefined();
    expect(list!.kept).toBe("order_search");
    expect(list!.dropped).toBe("order_entry");
  });

  it("書き込みの口は、入力を持つ画面から入る", () => {
    const { document } = build("/api");
    const orders = (document.paths as any)["/api/orders"];
    expect(Object.keys(orders).sort()).toEqual(["get", "post"]);
  });

  it("型は全画面ぶんが1か所に集まる", () => {
    const { document } = build("/api");
    const schemas = (document.components as any).schemas;
    expect(Object.keys(schemas).length).toBeGreaterThan(3);
  });

  it("基点を渡さなければ型だけ（道は呼ぶ側が決める）", () => {
    const { document } = build(undefined);
    expect(document.paths).toBeUndefined();
    expect(document.components).toBeDefined();
  });

  it("受け口を持たない画面は、入れなかったと言う", () => {
    const { skipped } = build("/api", withDashboard);
    expect(skipped.map((one) => one.page)).toEqual(["sales_dashboard"]);
  });
});
