import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXPLAIN_DIFF_NOTE,
  explainDiffSources,
  renderExplainDiff,
  subjectOf,
} from "../src/index.js";

/** 前後の定義を作る。[change] は before に対する置換（書き換えたい所だけ書く）。 */
const form = (fields: string, sections = ""): string => `
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - title: 基本情報
        fields:
${fields}
${sections}`;

const KIND = `          - { field: kind, label: 区分, type: select,
              options: [{ value: personal, label: 個人 }, { value: corp, label: 法人 }] }`;

const text = (before: string, after: string): string =>
  renderExplainDiff(explainDiffSources(before, after));

describe("変わったところを画面の言葉で言う", () => {
  it("同じものなら「変わりません」（それでも後方互換の話はしないと言う）", () => {
    const one = form("          - { field: code, label: コード }");
    const diff = explainDiffSources(one, one);
    expect(diff.same).toBe(true);
    expect(diff.changes).toEqual([]);
    expect(renderExplainDiff(diff)).toContain("見え方は変わりません。");
    expect(renderExplainDiff(diff)).toContain(EXPLAIN_DIFF_NOTE);
  });

  it("項目の指定が変わったら、前と後の説明を並べる", () => {
    const out = text(
      form("          - { field: code, label: コード, required: true }"),
      form(
        "          - { field: code, label: コード, required: true, readOnly: true }",
      ),
    );
    expect(out).toContain("「コード」が変わりました");
    expect(out).toContain("前: コード … 必須");
    expect(out).toContain("後: コード … 必須、読み取り専用");
  });

  it("項目が増えた・無くなったは、そう言う", () => {
    const out = text(
      form("          - { field: code, label: コード }"),
      form("          - { field: name, label: 顧客名, required: true }"),
    );
    expect(out).toContain("「コード」が無くなりました");
    expect(out).toContain("「顧客名」が増えました");
  });

  // ロードマップに書いた文がそのまま出ること。ここが「機械の言葉」との違い。
  it("枠に条件が付いたら「…のときだけ出るようになりました」と言う", () => {
    const billing = (condition: string) =>
      form(KIND, `      - title: 請求先
${condition}        fields:
          - { field: billingCode, label: 請求先コード, required: true }`);
    const out = text(
      billing(""),
      billing("        visibleWhen: { field: kind, value: corp }\n"),
    );
    expect(out).toContain(
      "枠「請求先」は、区分 が 法人 のときだけ出るようになりました",
    );
    // 枠が消えて別の枠が増えた、とは言わない（同じ枠の話）。
    expect(out).not.toContain("が増えました");
    expect(out).not.toContain("が無くなりました");
  });

  it("枠の条件が外れたら、いつでも出るようになったと言う", () => {
    const billing = (condition: string) =>
      form(KIND, `      - title: 請求先
${condition}        fields:
          - { field: billingCode, label: 請求先コード }`);
    const out = text(
      billing("        visibleWhen: { field: kind, value: corp }\n"),
      billing(""),
    );
    expect(out).toContain("枠「請求先」は、条件なしでいつでも出るようになりました");
  });

  it("枠ごと消えたら、枠の名前で言う", () => {
    const out = text(
      form(KIND, `      - title: 請求先
        fields:
          - { field: billingCode, label: 請求先コード }`),
      form(KIND),
    );
    expect(out).toContain("「請求先」が無くなりました");
  });

  it("枠ごと増えたら、中身も並べる（何が現れるかが知りたい）", () => {
    const out = text(
      form(KIND),
      form(KIND, `      - title: 請求先
        fields:
          - { field: billingCode, label: 請求先コード, required: true }`),
    );
    expect(out).toContain("「請求先」が増えました");
    expect(out).toContain("「請求先コード」が増えました");
  });

  it("画面の種別が変わったら、位置づけが変わったと言う", () => {
    const one = `
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  table:
    columns: [{ field: code, label: コード }]
  form:
    sections:
      - fields: [{ field: code, label: コード }]
`;
    const out = text(one, one.replace("type: crud", "type: master"));
    expect(out).toContain("画面の位置づけが変わりました");
  });

  it("主語が揃わない行は、書き出しで組んで前後を見せる（出どころの変更）", () => {
    const out = text(
      form("          - { field: code, label: コード }"),
      form("          - { field: code, label: コード }").replace(
        "customerRepository",
        "customerRepo",
      ),
    );
    expect(out).toContain("内容が変わりました");
    expect(out).toContain("後: データの出どころは customerRepo（アプリ側が用意する）。");
  });

  it("列の見せ方が変わったら、例で言う（機械の名前を出さない）", () => {
    const list = (format: string) => `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: amount, label: 金額, type: number${format} }
`;
    const out = text(list(""), list(", format: currency"));
    expect(out).toContain("「金額」が変わりました");
    expect(out).toContain("後: 金額（¥1,234,567 のように見せる）");
    expect(out).not.toContain("currency");
  });
});

describe("アプリ全体", () => {
  const app = (menu: string, columns = "          - { field: id, label: ID }") => `
dsl_version: "1.0"
app:
  id: sales
  title: 販売管理
  menu:
${menu}
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: id
      table:
        columns:
${columns}
`;
  const flat = "    - { id: orders, label: 受注, page: order_search }";

  it("メニューの札を変えただけなら「変わった」と言う（消えて増えたにしない）", () => {
    const out = text(
      app(flat),
      app("    - { id: orders, label: 受注照会, page: order_search }"),
    );
    expect(out).toContain("「受注」は「受注照会」に変わりました（開く先は同じ）");
  });

  it("入れ子に移したら、移った先の道で言う", () => {
    const out = text(
      app(flat),
      app(`    - group: 販売
      items:
        - { label: 受注, page: order_search }`),
    );
    expect(out).toContain("「受注」は「販売 > 受注」に変わりました（開く先は同じ）");
  });

  it("両方にあるページは1枚ずつ比べ、見出しに画面名を付ける", () => {
    const out = text(
      app(flat),
      app(
        flat,
        `          - { field: id, label: ID }
          - { field: amount, label: 金額, format: currency }`,
      ),
    );
    expect(out).toContain("## 受注照会 / 一覧に出る列");
    expect(out).toContain("「金額」が増えました");
  });

  it("app と単票を混ぜたら、差分ではなく指定間違いとして落ちる", () => {
    expect(() =>
      explainDiffSources(app(flat), form("          - { field: code, label: コード }")),
    ).toThrow("同じ種類のもの同士");
  });

  it("同梱のアプリを自分自身と比べても、何も変わらない", () => {
    const source = readFileSync("../spec/examples/sales_app.yaml", "utf8");
    expect(explainDiffSources(source, source).same).toBe(true);
  });
});

describe("行の主語", () => {
  it("説明の書き方（… / → / （…））から主語を取る", () => {
    expect(subjectOf("コード … 必須、20 文字以内")).toBe("コード");
    expect(subjectOf("マスタ > 商品 → product_master")).toBe("マスタ > 商品");
    expect(subjectOf("金額（¥1,234,567 のように見せる）")).toBe("金額");
    expect(subjectOf("50 件ずつページングする")).toBe("50 件ずつページングする");
  });
});

describe("後方互換の話はしない", () => {
  // ここを混ぜると「見え方が変わっただけ」で CI が落ちる道具になる。判定は
  // hatake diff の担当なので、こちらは注意書きを必ず出す。
  it("変わっていても、変わっていなくても注意書きを出す", () => {
    const before = form("          - { field: code, label: コード }");
    const after = form("          - { field: code, label: コード, required: true }");
    expect(text(before, after)).toContain(EXPLAIN_DIFF_NOTE);
    expect(text(before, before)).toContain(EXPLAIN_DIFF_NOTE);
    expect(EXPLAIN_DIFF_NOTE).toContain("hatake diff");
  });
});
