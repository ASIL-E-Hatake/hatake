import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { minimizeSource, SAME_NOTE, sameLines, sameSources } from "../src/internal.js";
import { buildReference } from "../src/internal.js";

/**
 * 書き方が違っても同じ画面か（`hatake same`）。
 *
 * この道具の値打ちは「意味を変えていない直し」をレビューから外せること。だから守るのは
 * 2つ:
 *   ・**書き方の違いは差にしない**（キーの並び・既定値の明示・囲みの書き方）
 *   ・**意味の違いは必ず差にする**（1文字でも変えたら「違う」と言い、どこが違うかを出す）
 * 前者を緩めると道具が嘘をつき、後者を緩めるとレビューを飛ばせる口になる。
 */
const reference = buildReference(
  JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
);

const BASE = `dsl_version: "1.0"
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
  table:
    columns:
      - { field: orderNo, label: 受注番号, sortable: true }
      - { field: amount, label: 金額, format: { type: currency } }
`;

describe("書き方の違いは差にしない", () => {
  it("キーの並びを変えても同じ", () => {
    const shuffled = `dsl_version: "1.0"
page:
  repository: orderRepository
  title: 受注照会
  id: order_search
  type: search
  key: orderNo
  table:
    columns:
      - { label: 受注番号, field: orderNo, sortable: true }
      - { format: { type: currency }, label: 金額, field: amount }
  search:
    filters:
      - { label: 受注番号, field: orderNo }
`;
    expect(sameSources(BASE, shuffled).same).toBe(true);
  });

  it("既定値を明示しても同じ", () => {
    const explicit = BASE.replace(
      "- { field: amount, label: 金額, format: { type: currency } }",
      "- { field: amount, label: 金額, type: text, sortable: false, " +
        "format: { type: currency } }",
    );
    expect(sameSources(BASE, explicit).same).toBe(true);
  });

  it("囲みの書き方（フロー／ブロック）を変えても同じ", () => {
    const block = BASE.replace(
      "      - { field: orderNo, label: 受注番号, sortable: true }",
      `      - field: orderNo
        label: 受注番号
        sortable: true`,
    );
    expect(sameSources(BASE, block).same).toBe(true);
  });

  it("**同梱の例を最小化したものは、必ず同じと言う**（別の道具で言い直せる）", () => {
    const dir = "../spec/examples";
    for (const file of readdirSync(dir).filter((one) => one.endsWith(".yaml"))) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      const short = minimizeSource(source, reference).source;
      expect(sameSources(source, short).same, file).toBe(true);
    }
  });
});

describe("意味の違いは必ず差にする", () => {
  it("ラベルを1つ変えたら、どこが違うかを道つきで言う", () => {
    const result = sameSources(
      BASE,
      BASE.replace("label: 金額", "label: 金額（税込）"),
    );
    expect(result.same).toBe(false);
    const one = result.changes.find((c) => c.path.endsWith(".label"));
    expect(one?.before).toBe("金額");
    expect(one?.after).toBe("金額（税込）");
  });

  it("項目を1つ足したら差になる（片方に無いことも言う）", () => {
    const added = BASE.replace(
      "      - { field: amount, label: 金額, format: { type: currency } }",
      "      - { field: amount, label: 金額, format: { type: currency } }\n" +
        "      - { field: customer, label: 顧客名 }",
    );
    const result = sameSources(BASE, added);
    expect(result.same).toBe(false);
    expect(result.changes.some((c) => c.before === undefined)).toBe(true);
  });

  it("**等価な条件の書き換えは「違う」と言う**（条件の代数は入れない）", () => {
    const form = (condition: string) => `page:
  type: form
  id: f
  title: t
  repository: r
  form:
    sections:
      - fields:
          - { field: a, label: A }
          - field: b
            label: B
            visibleWhen: ${condition}
`;
    const result = sameSources(
      form("{ field: a, operator: equals, value: x }"),
      form("{ all: [{ field: a, operator: equals, value: x }] }"),
    );
    expect(result.same).toBe(false);
  });

  it("比べる相手が違えば、「違う」ではなく**比べられない**と言う", () => {
    const app = `app:
  id: a
  title: t
  pages:
    - { type: search, id: s, title: t, repository: r, table: { columns: [{ field: a, label: A }] } }
`;
    expect(() => sameSources(app, BASE)).toThrow(/比べられません/);
  });

  it("読めない定義は比べない（strict で読む）", () => {
    expect(() => sameSources(BASE, BASE.replace("sortable", "sortble"))).toThrow();
  });
});

describe("出力", () => {
  it("同じときも違うときも、見ていないものを毎回書く", () => {
    for (const other of [BASE, BASE.replace("label: 金額", "label: 円")]) {
      const text = sameLines(sameSources(BASE, other), ["a.yaml", "b.yaml"]).join("\n");
      expect(text).toContain(SAME_NOTE);
      expect(text).toContain("同じ＝正しい、ではありません");
    }
  });
});
