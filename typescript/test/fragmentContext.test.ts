import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkFragmentInContext,
  describeFragmentFinding,
  type DslReference,
  fragmentContexts,
  UnknownFragmentContextError,
} from "../src/internal.js";

/**
 * 手引きの**断片**を、書ける場所まで見る。
 *
 * ここでいちばんまずいのは「キーは在るが、その場所には書けない」を**通してしまう**こと
 * （読んだ人の所で初めて効かないと分かる）。だから通る／落ちるの両方を見る。
 * 場所の正は `spec/reference.json`＝実際に `hatake reference` が引く1枚を読む
 * （作り物の表で試すと、表と実装がズレたときにここが黙る）。
 */
const reference = JSON.parse(
  readFileSync("../spec/reference.json", "utf8"),
) as DslReference;

const check = (value: unknown, context: string) =>
  checkFragmentInContext(value, context, reference);

describe("断片は、囲む場所の中で見る", () => {
  it("その場所に書けるキーは通る", () => {
    const found = check(
      { columns: [{ field: "orderNo", label: "受注番号", width: 120 }] },
      "table",
    );
    expect(found).toEqual([]);
  });

  it("**キーは在るが、その場所には書けない**を落とす（どこなら書けるかまで言う）", () => {
    const found = check({ columns: [{ field: "orderNo" }] }, "filter");
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe("columns");
    expect(found[0].in).toEqual(["filter"]);
    expect(found[0].writableIn).toEqual([
      "dashboardItem",
      "field",
      "layout",
      "table",
    ]);
    expect(describeFragmentFinding(found[0])).toContain(
      "filter の下には書けません",
    );
    expect(describeFragmentFinding(found[0])).toContain("書けるのは");
  });

  it("入れ子の中まで見る（道も出す）", () => {
    const found = check(
      { columns: [{ field: "orderNo" }, { field: "amount", repository: "x" }] },
      "table",
    );
    expect(found).toHaveLength(1);
    expect(found[0].at).toBe("columns[1].repository");
    expect(found[0].in).toEqual(["column"]);
  });

  it("要素が並んだ断片は、その要素のノードを印にする", () => {
    expect(check([{ field: "orderNo", label: "受注番号" }], "column")).toEqual([]);
    expect(check([{ field: "orderNo", pagination: {} }], "column")).toHaveLength(1);
  });

  it("DSL のどこにも無いキーは、そう言う（綴り違いの候補つき）", () => {
    const found = check({ colums: [] }, "table");
    expect(found).toHaveLength(1);
    expect(found[0].writableIn).toEqual([]);
    expect(found[0].near).toBe("columns");
    expect(describeFragmentFinding(found[0])).toContain("DSL にありません");
  });

  it("中身が自由な所から下は見ない（プラグインの語彙）", () => {
    // `config` も条件式も `closed: false`＝DSL の語彙ではない。
    expect(check({ field: "amount", config: { anything: 1 } }, "column")).toEqual(
      [],
    );
    expect(
      check({ field: "amount", visibleWhen: { field: "kind", eq: "x" } }, "field"),
    ).toEqual([]);
  });

  it("**候補が複数の所は `type:` で絞る**（検索画面に帳票のキーは書けない）", () => {
    expect(
      check({ page: { type: "report", report: { groupBy: "x" } } }, "document"),
    ).toEqual([]);
    const found = check(
      { page: { type: "search", report: { groupBy: "x" } } },
      "document",
    );
    expect(found).toHaveLength(1);
    expect(found[0].in).toEqual(["searchPage"]);
    expect(found[0].writableIn).toEqual(["reportPage"]);
  });

  it("`type:` が無ければ絞らない（抜粋には書いていないので、言えない側に倒す）", () => {
    expect(check({ page: { report: { groupBy: "x" } } }, "document")).toEqual([]);
  });

  it("**知らない場所の名前は落とす**（印を付けたまま誰も見ていない、を作らない）", () => {
    expect(() => check({}, "tabel")).toThrow(UnknownFragmentContextError);
    expect(() => check({}, "tabel")).toThrow(/table の間違い/);
  });

  it("印に書ける名前は、reference のノード名と同じ", () => {
    const names = fragmentContexts(reference);
    expect(names).toEqual(Object.keys(reference.nodes).sort());
    expect(names).toContain("table");
    expect(names).toContain("document");
  });
});
