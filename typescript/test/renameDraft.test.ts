import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  impactOf,
  parsePageYaml,
  renameDraft,
  RenameError,
  renameLines,
  RENAME_NOTE,
} from "../src/index.js";

/**
 * 名前を変えた先も辿る（`ask --impact <前>:<後>`）。
 *
 * 守るのは「**指している所だけ**を書き換える」こと。文言の中の同じ言葉を触ると業務の
 * 言葉が壊れ、定義の外を直したふりをすると人が確かめなくなる。だから**下書き**に
 * 留めて、触っていない所を毎回言う。
 */
const PAGE = `dsl_version: "1.0"

page:
  type: crud
  id: order_master
  title: 受注
  repository: orderRepository
  key: id

  search:
    filters:
      - { field: price, label: 単価, type: number, operator: gte }

  table:
    columns:
      - { field: price, label: 単価, type: number, format: currency }
      - { field: amount, label: 金額, type: number }

  form:
    sections:
      - fields:
          - { field: price, label: 単価, type: number, required: true }
          - field: amount
            label: 金額
            type: number
            computed: { op: multiply, fields: [price, count] }
          - field: note
            label: 備考
            visibleWhen: { field: price, operator: gt, value: 0 }
          - field: lines
            label: 明細
            type: subTable
            source: { repository: lineRepository, parentKey: orderNo, key: id }
            columns:
              - { field: price, label: 単価 }

  actions:
    - id: detail
      type: navigate
      label: 詳細
      page: order_detail
      params: { price: $row.price }
      confirm: { message: 単価を見ますか }
`;

const raw = () => parseYaml(PAGE) as Record<string, unknown>;

describe("名前を変えた下書き", () => {
  it("**指している所を全部**書き換える（列・絞り込み・入力欄・計算・条件・明細・遷移）", () => {
    const result = renameDraft(PAGE, raw(), "price", "unitPrice");
    const kinds = result.changes.map((one) => one.kind).sort();
    expect(kinds).toContain("column");
    expect(kinds).toContain("filter");
    expect(kinds).toContain("field");
    expect(kinds).toContain("computed");
    expect(kinds).toContain("condition");
    expect(kinds).toContain("param");
    // 辿った件数と書き換えた件数は同じ（指せなかった所が無い）。
    expect(result.changes).toHaveLength(impactOf(raw(), "price").length);
    expect(result.missed).toEqual([]);
  });

  it("書き換えた下書きは、そのまま読める定義（新しい名前で同じ件数が辿れる）", () => {
    const result = renameDraft(PAGE, raw(), "price", "unitPrice");
    // strict で読める＝知らないキーも壊れた形も作っていない。
    expect(parsePageYaml(result.source, { strict: true }).id).toBe("order_master");
    const after = parseYaml(result.source) as Record<string, unknown>;
    expect(impactOf(after, "unitPrice")).toHaveLength(result.changes.length);
    // 元の名前は、項目名としてはもう出てこない。
    expect(impactOf(after, "price")).toEqual([]);
  });

  it("差し込み（`$row.<項目名>`）は項目名なので直す", () => {
    const result = renameDraft(PAGE, raw(), "price", "unitPrice");
    expect(result.source).toContain("$row.unitPrice");
    expect(result.source).not.toContain("$row.price");
  });

  it("**文言の中の同じ言葉は触らない**（あちらは業務の言葉）", () => {
    const result = renameDraft(PAGE, raw(), "price", "unitPrice");
    // ラベルと確認の文はそのまま。
    expect(result.source).toContain("label: 単価");
    expect(result.source).toContain("message: 単価を見ますか");
    expect(renameLines(result).join("\n")).toContain(RENAME_NOTE);
  });

  it("触っていない所（定義の外）を毎回言う", () => {
    const text = renameLines(renameDraft(PAGE, raw(), "price", "unitPrice")).join("\n");
    expect(text).toContain("定義の外は直していません");
    expect(text).toContain("下書き");
  });

  it("**もう使われている名前には変えない**（衝突を黙って作らない）", () => {
    expect(() => renameDraft(PAGE, raw(), "price", "amount")).toThrow(RenameError);
    try {
      renameDraft(PAGE, raw(), "price", "amount");
    } catch (error) {
      expect((error as Error).message).toContain("もう使われています");
    }
  });

  it("定義のどこにも無い名前は、そう言う（「影響なし」とは言わない）", () => {
    expect(() => renameDraft(PAGE, raw(), "cost", "unitPrice")).toThrow(
      /定義のどこにも出てきません/,
    );
  });

  it("項目名に使えない字は止める（定義の命名に合わせる）", () => {
    expect(() => renameDraft(PAGE, raw(), "price", "unit price")).toThrow(
      /項目名に使えません/,
    );
    expect(() => renameDraft(PAGE, raw(), "price", "price")).toThrow(/同じ名前/);
  });

  it("元の文字列を切り貼りするので、コメントも並びも残る", () => {
    const withComment = PAGE.replace(
      "  table:",
      "  # 一覧は単価から見せる（現場の並び）。\n  table:",
    );
    const result = renameDraft(withComment, parseYaml(withComment) as Record<string, unknown>, "price", "unitPrice");
    expect(result.source).toContain("# 一覧は単価から見せる（現場の並び）。");
    // dsl_version の行も動かない（全体を書き戻していない証拠）。
    expect(result.source.startsWith('dsl_version: "1.0"')).toBe(true);
  });

  it("app の中の1枚でも、画面ごとに道が出る", () => {
    const app = `app:
  id: sales
  title: 販売
  menu:
    - { id: m1, label: 受注, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      table:
        columns:
          - { field: price, label: 単価 }
    - type: search
      id: cost_search
      title: 原価照会
      repository: costRepository
      table:
        columns:
          - { field: price, label: 単価 }
`;
    const result = renameDraft(app, parseYaml(app) as Record<string, unknown>, "price", "unitPrice");
    expect(result.changes.map((one) => one.page)).toEqual([
      "order_search",
      "cost_search",
    ]);
    expect(result.source.match(/unitPrice/g)).toHaveLength(2);
  });

  it("帳票の合計と並びも辿る（配列の要素そのものも書き換える）", () => {
    const report = `page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  report:
    groupBy: [price]
    sort: { field: price, direction: asc }
    totals:
      - { field: price, aggregate: sum }
  table:
    columns:
      - { field: price, label: 単価 }
`;
    const result = renameDraft(
      report,
      parseYaml(report) as Record<string, unknown>,
      "price",
      "unitPrice",
    );
    expect(result.changes.filter((one) => one.kind === "report")).toHaveLength(3);
    expect(result.source).toContain("groupBy: [unitPrice]");
    expect(result.missed).toEqual([]);
  });
});
