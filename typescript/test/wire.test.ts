import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { wireApp } from "../src/index.js";

/// 定義から出す「アプリ側の配線」の下書き。
///
/// ここで見るのは**何を並べるか**と**空ける所を空けているか**。生成物が本当に
/// コンパイルできるかは、コミットしてある2枚（`flutter/packages/hatake_example/tool/`）を
/// `flutter analyze` に通すことで確かめている（型の話は Dart に言わせるのが確実）。
const wire = (yaml: string, options = {}) =>
  wireApp(parseYaml(yaml) as Record<string, unknown>, options);

const APP = `
app:
  id: sales_admin
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
      actions:
        - { id: csv, type: export, label: CSV出力 }
        - { id: approve, type: plugin, plugin: approveOrders, label: 承認 }
`;

describe("hatake wire", () => {
  it("定義が要求している登録を全部並べる", () => {
    const code = wire(APP);
    expect(code).toContain("'orderRepository':");
    expect(code).toContain("'approveOrders':");
    expect(code).toContain("exportSink:");
    // 要求していないものは並べない（空の登録を置くと、読む人が探し始める）。
    expect(code).not.toContain("printSink:");
    expect(code).not.toContain("validators:");
  });

  it("app なら HatakeApp、単票なら HatakePageView", () => {
    expect(wire(APP)).toContain("HatakeApp(app: definition)");
    expect(wire(APP)).toContain("parseAppYaml");
    const page = wire(`
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  table:
    columns: [{ field: id, label: ID }]
  form:
    sections: [{ fields: [{ field: id, label: ID }] }]
`);
    expect(page).toContain("HatakePageView(definition: definition)");
    expect(page).toContain("parsePageYaml");
    expect(page).toContain("class CustomerMasterPage");
  });

  it("クラス名は id から作る（--class で上書きできる）", () => {
    expect(wire(APP)).toContain("class SalesAdminApp");
    expect(wire(APP, { className: "MyApp" })).toContain("class MyApp");
  });

  it("中身は空けて TODO。埋め忘れは実行時に落ちる", () => {
    const code = wire(APP);
    expect(code).toContain("UnimplementedError('approveOrders: 何をするか')");
    // 「黙って何もしない」実装を置かない。
    expect(code).not.toContain("async {}");
  });

  it("--base を渡すと REST で組む（collection は複数形を推測）", () => {
    const code = wire(APP, { baseUrl: "/api" });
    expect(code).toContain("import 'package:hatake_http/hatake_http.dart';");
    expect(code).toContain("restRepositories(");
    expect(code).toContain("baseUrl: '/api'");
    expect(code).toContain("'orderRepository': 'orders'");
    // 推測だと見出しに書く（当たっていないことがある）。
    expect(code).toContain("複数形を推測");
    // 通信そのものはアプリの担当なので、そこが TODO になる。
    expect(code).toContain("Future<HttpResponse> _send(");
  });

  it("--base が無ければ Repository は自分で書く形（5メソッドの stub）", () => {
    const code = wire(APP);
    expect(code).toContain("class _UnwiredRepository implements Repository");
    expect(code).toContain("Future<PageResult> search(RepositoryQuery query)");
    // hatake_http は入れない（コメントでは触れるが、依存としては足さない）。
    expect(code).not.toContain("import 'package:hatake_http/hatake_http.dart';");
  });

  it("役割は空で出す（遮断は API 側だと書く）", () => {
    const code = wire(APP);
    expect(code).toContain("roles: const {}, // TODO: ログインから取る");
    expect(code).toContain("遮断は API 側");
  });

  it("複数形の推測（当たらないこともあるので、規則を固定しておく）", () => {
    const code = wire(
      `
app:
  id: masters
  title: マスタ
  menu: [{ id: a, label: A, page: a }]
  pages:
    - type: search
      id: a
      title: A
      repository: companyRepository
      key: id
      table:
        columns: [{ field: id, label: ID }]
    - type: search
      id: b
      title: B
      repository: taxRepository
      key: id
      table:
        columns: [{ field: id, label: ID }]
`,
      { baseUrl: "/api" },
    );
    expect(code).toContain("'companyRepository': 'companies'");
    expect(code).toContain("'taxRepository': 'taxes'");
  });

  it("登録する口が無いものは、コードにせず末尾で言う", () => {
    const code = wire(`
page:
  type: dashboard
  id: board
  title: 分析
  repository: orderRepository
  items:
    - id: t
      type: chart
      title: 推移
      chart: { kind: radar, aggregate: sum, valueField: amount }
`);
    expect(code).toContain("登録する口がまだ無いもの");
    expect(code).toContain("radar");
  });

  it("コミットしてある2枚と、いま生成したものが一致する", () => {
    // 生成器を直したら生成物も更新する（CI も同じことを見る）。
    const cases = [
      {
        source: "../flutter/packages/hatake_example/assets/sales_app.yaml",
        out: "../flutter/packages/hatake_example/tool/wired_sales_app.dart",
        options: { source: "sales_app.yaml" },
      },
      {
        source: "../flutter/packages/hatake_example/tool/wire_everything.yaml",
        out: "../flutter/packages/hatake_example/tool/wired_everything.dart",
        options: {
          source: "wire_everything.yaml",
          baseUrl: "/api",
          assets: "tool/wire_everything.yaml",
        },
      },
    ];
    for (const one of cases) {
      const generated = wireApp(
        parseYaml(readFileSync(one.source, "utf8")) as Record<string, unknown>,
        one.options,
      );
      expect(
        readFileSync(one.out, "utf8").split("\r\n").join("\n"),
        one.out,
      ).toBe(generated);
    }
  });
});
