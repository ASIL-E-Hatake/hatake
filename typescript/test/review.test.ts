import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADVICE_NOTE, parseAdviceRules, renderReview, reviewSource } from "../src/index.js";

const app = readFileSync("../spec/examples/sales_app.yaml", "utf8");
const master = readFileSync("../spec/examples/customer_master.yaml", "utf8");

describe("レビュー用の1枚", () => {
  it("説明と助言が1枚に入る", () => {
    const review = reviewSource(master);
    expect(review.explain.headline).toContain("顧客マスタ");
    const text = renderReview(review);
    // 説明の節（できないこと）と助言の節が、同じ紙に並ぶ。
    expect(text).toContain("## 書き足したほうがいい所（助言）");
    expect(text).toContain(ADVICE_NOTE);
  });

  it("助言が無くてもその節は出す（見落としではないと分かるように）", () => {
    const clean = `page:
  type: search
  id: product_search
  title: 商品検索
  repository: productRepository
  search:
    filters:
      - { field: code, label: コード }
  table:
    columns:
      - { field: code, label: コード, sortable: true }
      - { field: name, label: 商品名 }
`;
    const text = renderReview(reviewSource(clean));
    expect(text).toContain("## 書き足したほうがいい所（助言）");
    expect(text).toContain("見つかりませんでした");
  });

  it("app の1枚を読むときは、助言もその画面のものだけ", () => {
    const whole = reviewSource(app);
    const one = reviewSource(app, { page: "order_search" });
    expect(one.page).toBe("order_search");
    expect(one.advice.length).toBeGreaterThan(0);
    expect(new Set(one.advice.map((a) => a.page))).toEqual(new Set(["order_search"]));
    // 全体で見たほうが件数は多い（他の画面のぶんが入る）。
    expect(whole.advice.length).toBeGreaterThan(one.advice.length);
  });

  it("app 全体なら、どの画面の話かは場所の道に出ている", () => {
    const review = reviewSource(app);
    const text = renderReview(review);
    expect(text).toMatch(/app\.pages\[\d+\]/);
  });

  it("助言の物差しをそのまま渡せる（レビューも案件の決めごとで読む）", () => {
    const rules = parseAdviceRules({
      require: [
        {
          rule: "team-column-width",
          node: "column",
          key: "width",
          every: true,
          says: "一覧の列幅は決めておく決めごとです。",
          add: "`width` を書く。",
        },
      ],
    });
    const review = reviewSource(master, { rules });
    expect(review.advice.some((one) => one.rule === "team-column-width")).toBe(true);
    const text = renderReview(review, { rulesFrom: "team.json", rules });
    expect(text).toContain("物差しは team.json を使いました");
  });

  it("助言を切れば説明だけになる（1枚の形は変えない）", () => {
    const rules = parseAdviceRules({
      off: [
        "no-sortable-column",
        "no-search-filter",
        "key-not-in-table",
        "no-required-field",
        "open-dangerous-action",
        "money-without-format",
        "subtable-without-parent-key",
        "report-without-totals",
      ],
    });
    const review = reviewSource(app, { rules });
    expect(review.advice).toEqual([]);
    expect(renderReview(review)).toContain("見つかりませんでした");
  });

  it("読めない定義はレビューできない（strict で読む）", () => {
    const typo = master.replace("sortable: true", "sortble: true");
    expect(() => reviewSource(typo)).toThrow();
  });
});
