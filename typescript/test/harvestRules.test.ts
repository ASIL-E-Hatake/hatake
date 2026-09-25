import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReference,
  findAdvice,
  harvestRules,
  parseAdviceRules,
  renderHarvestRules,
  rulesDraft,
} from "../src/internal.js";
import { parse as parseYamlText } from "yaml";

/**
 * 案件の決めごとを、既にある定義から起こす（`hatake harvest --rules`）。
 *
 * この道具でいちばんまずいのは**起こした物差しが、当てたら鳴る**こと（貼った人の所で
 * いきなり助言が並ぶ＝道具ごと信用されなくなる）。守るのは4つ:
 *   ・全部に書いてあるものだけを起こす（揺れは起こさない・でも捨てない）
 *   ・出したものは `--rules` としてそのまま読める（貼れる形）
 *   ・起こした物差しを同じ定義に当てて**助言が0件**
 *   ・スキーマで必須のキーは起こさない
 */
const reference = buildReference(
  JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
);

const page = (columns: string) => `page:
  type: search
  id: p
  title: 一覧
  repository: r
  key: id
  table:
    columns:
${columns}
`;

const ALL_WIDTH = page(`      - { field: a, label: A, width: 100 }
      - { field: b, label: B, width: 120 }
      - { field: c, label: C, width: 80 }`);

const SOME_WIDTH = page(`      - { field: a, label: A, width: 100 }
      - { field: b, label: B }
      - { field: c, label: C, width: 80 }`);

const inputs = (...sources: string[]) =>
  sources.map((source, i) => ({ file: `p${i}.yaml`, source }));

describe("既にある定義から決めごとを起こす", () => {
  it("全部に書いてあるキーを `require` の下書きにする", () => {
    const result = harvestRules(inputs(ALL_WIDTH), { reference });
    const one = result.candidates.find((c) => c.key === "width");
    expect(one?.node).toBe("column");
    expect(one?.rule).toBe("column-needs-width");
    expect(one?.spots).toBe(3);
    expect(one?.files).toBe(1);
  });

  it("揺れているものは起こさない（けれど捨てない）", () => {
    const result = harvestRules(inputs(SOME_WIDTH), { reference });
    expect(result.candidates.map((c) => c.key)).not.toContain("width");
    const skipped = result.skipped.find((c) => c.key === "width");
    expect(skipped?.written).toBe(2);
    expect(skipped?.spots).toBe(3);
    expect(skipped?.why).toContain("揺れ");
  });

  it("1箇所しか無いものは起こさない（写しであって決めごとではない）", () => {
    const lonely = page("      - { field: a, label: A, width: 100 }");
    expect(harvestRules(inputs(lonely), { reference }).candidates).toEqual([]);
    // --min を下げれば起きる（目盛りは渡す側）。
    expect(
      harvestRules(inputs(lonely), { reference, min: 1 }).candidates.map((c) => c.key),
    ).toContain("width");
  });

  it("**スキーマで必須のキーは起こさない**（当たり前を決めごとにしない）", () => {
    const withReference = harvestRules(inputs(ALL_WIDTH), { reference });
    expect(withReference.candidates.map((c) => c.key)).not.toContain("field");
    // リファレンスを渡さなければ外さない＝そのぶん当たり前が混ざる（黙らない）。
    const without = harvestRules(inputs(ALL_WIDTH));
    expect(without.candidates.map((c) => c.key)).toContain("field");
    expect(
      renderHarvestRules(without, { min: 2, checkedRequired: false }),
    ).toContain("外していません");
  });

  it("読めない定義は、そう言う（この結果は不完全）", () => {
    const result = harvestRules([{ file: "broken.yaml", source: "a:\n  - [\n" }]);
    expect(result.unreadable).toHaveLength(1);
    expect(renderHarvestRules(result, { min: 2, checkedRequired: true })).toContain(
      "不完全",
    );
  });

  it("同じ入力なら同じ結果（走査順で揺れない）", () => {
    const twice = [ALL_WIDTH, SOME_WIDTH];
    expect(JSON.stringify(harvestRules(inputs(...twice), { reference }))).toBe(
      JSON.stringify(harvestRules(inputs(...twice), { reference })),
    );
  });
});

describe("出した物差しは、嘘をつかない", () => {
  const sources = [ALL_WIDTH, page(`      - { field: x, label: X, width: 10 }
      - { field: y, label: Y, width: 20 }`)];
  const result = harvestRules(inputs(...sources), { reference });

  it("**そのまま --rules に渡せる**（貼れる形）", () => {
    const rules = parseAdviceRules(JSON.parse(JSON.stringify(rulesDraft(result))));
    expect(rules.require.map((one) => one.key)).toContain("width");
    expect(rules.require.every((one) => one.every === true)).toBe(true);
  });

  it("**起こした物差しを同じ定義に当てても鳴らない**（鳴ったら数え方が違う）", () => {
    const rules = parseAdviceRules(JSON.parse(JSON.stringify(rulesDraft(result))));
    const names = new Set(rules.require.map((one) => one.rule));
    for (const source of sources) {
      const advice = findAdvice(
        parseYamlText(source) as Record<string, unknown>,
        rules,
      );
      expect(advice.filter((one) => names.has(one.rule))).toEqual([]);
    }
  });

  it("下書きであることが、貼った先でも読める所に残る", () => {
    expect(JSON.stringify(rulesDraft(result))).toContain(
      "人が読んで直すまでは正ではありません",
    );
  });

  it("この道具に言えないことを毎回書く", () => {
    const text = renderHarvestRules(result, { min: 2, checkedRequired: true });
    expect(text).toContain("なぜそう決めたか");
    expect(text).toContain("この定義の山のもの");
  });
});
