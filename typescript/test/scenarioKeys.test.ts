import { describe, expect, it } from "vitest";

import {
  describeUnknownScenarioKey,
  findUnknownScenarioKeys,
} from "../src/scenarioKeys.js";

/**
 * シナリオの知らない鍵。
 *
 * 定義には strict が在るのに、シナリオには無かった。値の入り口は `record` なので、
 * `input` と書くと黙って捨てられ、**空のレコードで動いて「1 件すべて期待どおり」**
 * になる。動かして確かめるための道具が、何も入れずに緑を返すのがいちばん困る。
 */
describe("シナリオの知らない鍵", () => {
  it("値の入り口を書き間違えたら言う。正しい名前も添える", () => {
    const found = findUnknownScenarioKeys({
      cases: [{ name: "税込み", input: { amount: 1000 } }],
    });
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe("cases[0].input");
    expect(found[0].instead).toBe("record");
  });

  it("確かめたいことを外側に書いたら、expect の下だと言う", () => {
    const found = findUnknownScenarioKeys({
      cases: [{ name: "a", record: {}, computed: { total: 1 } }],
    });
    expect(found[0].instead).toBe("expect.computed");
  });

  it("expect の中の知らない鍵も見る", () => {
    const found = findUnknownScenarioKeys({
      cases: [{ name: "a", record: {}, expect: { errrors: [] } }],
    });
    expect(found.map((one) => one.path)).toEqual(["cases[0].expect.errrors"]);
  });

  it("**1件目で止めない**（1往復で直せるように全部並べる）", () => {
    const found = findUnknownScenarioKeys({
      cases: [
        { name: "a", input: {} },
        { name: "b", values: {} },
      ],
      extra: 1,
    });
    expect(found.map((one) => one.path)).toEqual([
      "extra",
      "cases[0].input",
      "cases[1].values",
    ]);
  });

  it("正しく書いたシナリオには何も言わない", () => {
    const found = findUnknownScenarioKeys({
      $comment: "覚え書き",
      page: "order",
      cases: [
        {
          name: "税込み",
          record: { amount: 1000 },
          mode: "create",
          $comment: "なぜこの1件か",
          expect: {
            errors: [],
            computed: { total: 1100 },
            enabled: { save: true },
            hidden: ["memo"],
            required: ["orderNo"],
          },
        },
      ],
    });
    expect(found).toEqual([]);
  });

  it("値の中は見ない（業務の値は何でも入る）", () => {
    const found = findUnknownScenarioKeys({
      cases: [{ name: "a", record: { whateverTheBusinessCallsIt: 1 } }],
    });
    expect(found).toEqual([]);
  });

  it("人に見せる1行に、書きたかった名前が入る", () => {
    expect(
      describeUnknownScenarioKey({ path: "cases[0].input", key: "input", instead: "record" }),
    ).toBe('cases[0].input: 知らないキー "input"（record の間違い？）');
    expect(describeUnknownScenarioKey({ path: "zzz", key: "zzz" })).toBe(
      'zzz: 知らないキー "zzz"',
    );
  });
});
