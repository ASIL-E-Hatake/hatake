import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type AppBrief,
  briefSource,
  isAppSource,
  type PageBrief,
  renderBrief,
} from "../src/index.js";

const brief = (source: string, page?: string): PageBrief =>
  briefSource(source, { page }) as PageBrief;

const CRUD = `
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  search:
    filters:
      - { field: name, label: 顧客名, operator: contains }
      - { field: kind, label: 区分, type: select, operator: equals }
  table:
    columns:
      - { field: code, label: コード }
      - { field: name, label: 顧客名 }
      - { field: amount, label: 売上, format: currency, roles: [admin] }
  form:
    sections:
      - title: 基本
        fields:
          - { field: code, label: コード, required: true }
          - { field: name, label: 顧客名, required: true }
      - title: 詳細
        fields:
          - { field: note, label: 備考, type: textarea }
          - { field: memberNo, label: 会員番号,
              readOnlyWhen: { field: kind, value: personal } }
  actions:
    - { id: create, type: create, label: 新規登録 }
`;

describe("1行の要約", () => {
  it("種別・規模・出どころを1行で言う", () => {
    expect(brief(CRUD).line).toBe(
      "顧客マスタ（customer_master）… 検索＋一覧＋登録・修正・削除。" +
        "条件 2、列 3、2 枠に項目 4（必須 2）、ボタン 1、条件で出し分け 1 項目、" +
        "権限で出し分けあり、customerRepository から",
    );
  });

  it("数は機械でも引ける形で持つ（多い画面を探すため）", () => {
    expect(brief(CRUD).counts).toEqual({
      filters: 2,
      columns: 3,
      sections: 2,
      fields: 4,
      required: 2,
      controlled: 1,
      actions: 1,
    });
  });

  it("全文とは語彙を変える（1行に収めるため）", () => {
    // 全文は「検索して一覧に出し、その場で登録・修正・削除までできる画面」。
    expect(brief(CRUD).what).toBe("検索＋一覧＋登録・修正・削除");
    expect(brief(CRUD).line.length).toBeLessThan(120);
  });

  it("無いものは言わない（照会に「必須」は出ない）", () => {
    const search = `
page:
  type: search
  id: product_search
  title: 商品照会
  repository: productRepository
  key: id
  table:
    columns:
      - { field: code, label: コード }
`;
    const one = brief(search);
    expect(one.line).toBe("商品照会（product_search）… 照会（読み取り専用）。列 1、productRepository から");
    expect(one.counts.required).toBeUndefined();
  });

  it("ステップ入力は段数と項目数で言う", () => {
    const wizard = `
page:
  type: wizard
  id: customer_wizard
  title: 顧客登録
  repository: customerRepository
  steps:
    - id: basic
      title: 基本
      fields:
        - { field: code, label: コード, required: true }
    - id: address
      title: 住所
      fields:
        - { field: zip, label: 郵便番号 }
        - { field: city, label: 市区町村 }
`;
    expect(brief(wizard).line).toContain("段階入力。ステップ 2（項目 3）");
  });
});

describe("アプリ全体の要約", () => {
  const source = readFileSync("../spec/examples/sales_app.yaml", "utf8");

  it("画面一覧の表になる（そのまま貼れる）", () => {
    const app = briefSource(source) as AppBrief;
    expect(app.headline).toBe("販売管理（sales_admin）— 画面 8 枚");
    expect(app.pages).toHaveLength(8);
    const rendered = renderBrief(app).split("\n");
    expect(rendered[0]).toBe(app.headline);
    // id は左端に揃える（目で追えるように）。
    expect(rendered[2]).toMatch(/^ {2}sales_dashboard {4}売上ダッシュボード/);
  });

  it("--page でその1枚だけ", () => {
    expect(brief(source, "order_search").line).toContain("受注照会（order_search）…");
  });

  it("app に無いページ id は、何があるかまで言って落ちる", () => {
    expect(() => brief(source, "order_detials")).toThrow("この app にありません");
  });
});

describe("同梱の例", () => {
  it("どの例も1行に要約できて、種別と規模が入る", () => {
    const dir = "../spec/examples";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      if (isAppSource(source)) {
        const app = briefSource(source) as AppBrief;
        expect(app.pages.length, file).toBeGreaterThan(0);
        continue;
      }
      const one = brief(source);
      expect(one.line, file).toContain(one.title);
      expect(one.what, file).not.toBe(one.kind); // 種別名を素で出していない
      expect(one.parts.length, file).toBeGreaterThan(0);
      // 1行なので改行が混ざってはいけない（貼る先が崩れる）。
      expect(one.line, file).not.toContain("\n");
    }
  });
});
