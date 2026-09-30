import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterDefaultProblem, filterDefaults, parsePageYaml } from "../src/internal.js";

/**
 * 検索欄の既定値の共有フィクスチャを、Dart 版と同じ契約で回す。画面（Flutter / Vue /
 * React）が同じ初期値で最初の一覧を読むことが値打ち（片方だけ「今月」がずれると、同じ定義で
 * 出てくる件数が違う）。
 */
const fixture = JSON.parse(
  readFileSync("../spec/conformance/filter_defaults.json", "utf8"),
) as {
  cases: {
    name: string;
    today: string;
    filters: { field: string; operator: string; defaultValue?: unknown }[];
    expected: Record<string, unknown>;
  }[];
};

/** "2026-02-14" → その日のローカル日付（時刻は昼にして、時差で日がずれないように）。 */
const day = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

describe("conformance: filter defaults", () => {
  for (const one of fixture.cases) {
    it(one.name, () => {
      expect(filterDefaults({ filters: one.filters }, day(one.today))).toEqual(one.expected);
    });
  }
});

describe("既定値の書き間違い（validate の filter-default-unusable が使う）", () => {
  it("フィクスチャで『出さない』ものは全部、理由が言える", () => {
    const shapes = fixture.cases.find((one) => one.name === "形の合わない書き方は出さない")!;
    for (const filter of shapes.filters) {
      const problem = filterDefaultProblem(filter);
      if (filter.field === "ok") expect(problem).toBeUndefined();
      else expect(problem, filter.field).toBeDefined();
    }
  });

  it("正しい書き方には何も言わない", () => {
    for (const one of fixture.cases.filter((c) => c.name !== "形の合わない書き方は出さない")) {
      for (const filter of one.filters) expect(filterDefaultProblem(filter), filter.field).toBeUndefined();
    }
  });

  it("定義から読める（defaultValue と search.fixed が strict を通る）", () => {
    const page = parsePageYaml(
      `page:
  type: search
  id: orders
  title: 受注
  repository: orderRepository
  search:
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between, defaultValue: $thisMonth }
      - { field: status, label: 状態, type: select, operator: equals, defaultValue: active }
    fixed:
      - { field: cancelled, operator: notEquals, value: true }
      - { field: deleted, value: false }
  table:
    columns: [{ field: orderNo, label: 受注番号 }]`,
      { strict: true },
    );
    expect(page.kind === "search" && page.search?.filters[0].defaultValue).toBe("$thisMonth");
    expect(page.kind === "search" && page.search?.fixed).toEqual([
      { field: "cancelled", operator: "notEquals", value: true },
      { field: "deleted", operator: "equals", value: false },
    ]);
  });
});

describe("読み返し（explain）と警告（validate）", async () => {
  const { explainPage, findWarnings } = await import("../src/internal.js");
  const { parse } = await import("yaml");
  const source = `page:
  type: search
  id: orders
  title: 受注
  repository: orderRepository
  search:
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between, defaultValue: $thisMonth }
      - { field: status, label: 状態, type: select, operator: equals, defaultValue: open,
          options: [{ value: open, label: 未出荷 }, { value: shipped, label: 出荷済 }] }
      - { field: shippedAt, label: 出荷日, type: date, operator: gte, defaultValue: $thisMonth }
    fixed:
      - { field: cancelled, operator: notEquals, value: true }
  table:
    columns: [{ field: orderNo, label: 受注番号 }, { field: cancelled, label: 取消 }]`;

  it("既定値と固定条件を人の言葉で言う", () => {
    const text = JSON.stringify(explainPage(parsePageYaml(source), parse(source).page));
    expect(text).toContain("最初は 今月 で絞ってある（外せる）");
    expect(text).toContain("最初は 未出荷 で絞ってある（外せる）");
    expect(text).toContain("いつも 取消 が true でないものだけ（画面からは外せない）");
  });

  it("範囲の語を範囲でない条件に書くと警告（既定値が付かない）", () => {
    const found = findWarnings(parse(source)).filter((one) => one.rule === "filter-default-unusable");
    expect(found.map((one) => one.path)).toEqual(["page.search.filters[2].defaultValue"]);
  });
});
