import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rulesCatalog } from "../src/rules.js";

/**
 * 公開した診断の id が、勝手に増減しないことを見る。
 *
 * `rules --json` を配った時点で、id は**利用者の CI に埋まる**（`--warn-as-error` で
 * 落とす・grep で抑える・集計する）。だから**名前を変えることも消すことも破壊的変更**で、
 * 「実装の表が正」だけでは守れない（表を直せば通ってしまう）。
 *
 * 足すのは自由だが、**この一覧に1行足す**のが条件＝意図した追加になる。減る差分が出たら
 * レビューで必ず目に入る。
 */
const frozen = JSON.parse(readFileSync("../spec/rule-ids.json", "utf8")) as {
  warnings: string[];
  advice: string[];
};

describe("公開した診断の id は凍っている", () => {
  const catalog = rulesCatalog();
  const ids = (kind: "warnings" | "advice"): string[] =>
    catalog[kind].map((one) => one.rule).sort();

  it("警告の id が一覧と完全に一致する", () => {
    expect(ids("warnings")).toEqual([...frozen.warnings].sort());
  });

  it("助言の id が一覧と完全に一致する", () => {
    expect(ids("advice")).toEqual([...frozen.advice].sort());
  });

  it("一覧そのものに重複が無い", () => {
    const all = [...frozen.warnings, ...frozen.advice];
    expect(new Set(all).size).toBe(all.length);
  });
});
