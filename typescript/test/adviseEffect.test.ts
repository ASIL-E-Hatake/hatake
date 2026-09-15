import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  adviceEffect,
  adviceRuleNames,
  EFFECT_NOTE,
  effectLines,
  type EffectPair,
} from "../src/index.js";

/**
 * 助言の効き目（`advise --effect`）。
 *
 * 守るのは**言えないことを言わない**こと: 黙らせたものを「直った」に入れない・画面ごと
 * 消えたものを「直った」に入れない・1組では見立てを言わない。
 */
const SEARCH = (extra: string): string => `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  table:
    columns:
      - { field: orderNo, label: 受注番号${extra} }
      - { field: customer, label: 顧客 }
      - { field: amount, label: 金額 }
`;

const doc = (yaml: string): Record<string, unknown> =>
  parseYaml(yaml) as Record<string, unknown>;

/** 1組（後の版の生の文字も渡す＝印を読むため）。 */
const pair = (before: string, after: string, label = "前 → 後"): EffectPair => ({
  label,
  before: doc(before),
  after: doc(after),
  afterSource: after,
});

describe("助言の効き目", () => {
  const noSortable = SEARCH("");
  const sortable = SEARCH(", sortable: true");

  it("直った規則は「効いている」", () => {
    const report = adviceEffect([pair(noSortable, sortable)]);
    const one = report.rules.find((r) => r.rule === "no-sortable-column");
    expect(one?.rang).toBe(1);
    expect(one?.fixed).toBe(1);
    expect(one?.verdict).toBe("効いている");
    expect(report.drop).toEqual([]);
  });

  it("鳴り続けている規則は「残った」（1組では見立てを言わない）", () => {
    const report = adviceEffect([pair(noSortable, noSortable)]);
    const one = report.rules.find((r) => r.rule === "no-sortable-column");
    expect(one?.kept).toBe(1);
    expect(one?.fixed).toBe(0);
    // 既定の --min は 3＝1組で規則の値打ちは決めない。
    expect(one?.verdict).toBe("まだ言えない");
  });

  it("**鳴ったのに1回も直っていない**規則が切る候補", () => {
    const three = [1, 2, 3].map((i) =>
      pair(noSortable, noSortable, `${i} 組目`),
    );
    const report = adviceEffect(three);
    const one = report.rules.find((r) => r.rule === "no-sortable-column");
    expect(one?.rang).toBe(3);
    expect(one?.verdict).toBe("切る候補");
    expect(report.drop).toContain("no-sortable-column");
    // そのまま物差しに書ける形で出す。
    const off = effectLines(report).find((line) => line.includes('"off"'));
    expect(off).toContain('"no-sortable-column"');
  });

  it("**黙らせたものは「直った」に入れない**（鳴らなかったのではなく読まれなかった）", () => {
    const silenced = `# advise-off: no-sortable-column # 並べ替えは使わない案件
${noSortable}`;
    const report = adviceEffect([pair(noSortable, silenced)]);
    const one = report.rules.find((r) => r.rule === "no-sortable-column");
    expect(one?.silenced).toBe(1);
    expect(one?.fixed).toBe(0);
    expect(one?.kept).toBe(0);
    expect(effectLines(report).join("\n")).toContain("黙らせた 1");
  });

  it("黙らせた回数は切る候補の根拠として残る", () => {
    const silenced = `# advise-off: no-sortable-column # 使わない
${noSortable}`;
    const report = adviceEffect(
      [1, 2, 3].map((i) => pair(noSortable, silenced, `${i} 組目`)),
    );
    const one = report.rules.find((r) => r.rule === "no-sortable-column");
    expect(one?.verdict).toBe("切る候補");
    expect(effectLines(report).join("\n")).toContain("うち 3 回は黙らされました");
  });

  it("**画面ごと消えたものは「直った」に入れない**", () => {
    const app = (pages: string): string => `app:
  id: sales
  title: 販売
  menu:
    - { id: m1, label: 受注, page: order_search }
  pages:
${pages}`;
    const two = `    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: customer, label: 顧客 }
          - { field: amount, label: 金額 }
    - type: search
      id: old_search
      title: 旧照会
      repository: orderRepository
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: customer, label: 顧客 }
          - { field: amount, label: 金額 }
`;
    const one = two.slice(0, two.indexOf("    - type: search", 10));
    const report = adviceEffect([pair(app(two), app(one))]);
    const found = report.rules.find((r) => r.rule === "no-sortable-column");
    expect(found?.rang).toBe(2);
    expect(found?.pageGone).toBe(1);
    expect(found?.kept).toBe(1);
    expect(found?.fixed).toBe(0);
  });

  it("後で新しく鳴ったものは、鳴った数には混ぜない", () => {
    const before = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  table:
    columns:
      - { field: orderNo, label: 受注番号, sortable: true }
`;
    const report = adviceEffect([pair(before, noSortable)]);
    const one = report.rules.find((r) => r.rule === "no-sortable-column");
    expect(one?.appeared).toBe(1);
    expect(one?.rang).toBe(0);
    expect(one?.verdict).toBe("まだ言えない");
  });

  it("1回も鳴らなかった規則は別に並べる（切る根拠にはしない）", () => {
    const report = adviceEffect([pair(noSortable, sortable)]);
    expect(report.neverRang).toContain("report-without-totals");
    expect(report.drop).not.toContain("report-without-totals");
    expect(effectLines(report).join("\n")).toContain("切る根拠にはなりません");
  });

  it("出てくる規則名は、全部 hatake rules に在るもの", () => {
    const known = new Set(adviceRuleNames());
    const report = adviceEffect([pair(noSortable, noSortable)]);
    for (const one of [...report.rules.map((r) => r.rule), ...report.neverRang]) {
      expect(known, one).toContain(one);
    }
  });

  it("--min を下げれば1組でも言う（決めるのは渡す側）", () => {
    const report = adviceEffect([pair(noSortable, noSortable)], { min: 1 });
    expect(report.drop).toContain("no-sortable-column");
  });

  it("何を数えていないかを毎回書く", () => {
    const text = effectLines(adviceEffect([pair(noSortable, sortable)])).join("\n");
    expect(text).toContain(EFFECT_NOTE);
    expect(text).toContain("1 組を比べました");
  });
});
