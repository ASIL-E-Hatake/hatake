import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAPERS, paperName, paperSize } from "../src/index.js";

/** 用紙の実寸の正（`spec/papers.json`）。 */
const spec = JSON.parse(readFileSync("../spec/papers.json", "utf8")) as {
  unit: string;
  papers: Record<string, { width: number; height: number; note: string }>;
};

describe("用紙の実寸", () => {
  // ここが要点。同じ数を3か所（spec / TS / Dart）が持つので、ズレたら気づける形にする。
  // ズレると「刷る側は収まると思っているのに、警告は収まらないと言う」が起きる。
  it("spec/papers.json と一致する（転記のズレを許さない）", () => {
    expect(spec.unit).toBe("pt");
    expect(Object.keys(PAPERS).sort()).toEqual(Object.keys(spec.papers).sort());
    for (const [name, size] of Object.entries(spec.papers)) {
      expect(PAPERS[name], name).toEqual({
        width: size.width,
        height: size.height,
      });
    }
  });

  it("既定は A4 縦（size を書かなくても答えが出る）", () => {
    expect(paperSize(undefined)).toEqual(PAPERS.A4);
    expect(paperSize({})).toEqual(PAPERS.A4);
    expect(paperName(undefined)).toBe("A4 縦");
  });

  it("横は縦横が入れ替わる", () => {
    const landscape = paperSize({ size: "A4", orientation: "landscape" });
    expect(landscape).toEqual({
      width: PAPERS.A4.height,
      height: PAPERS.A4.width,
    });
    expect(paperName({ size: "A4", orientation: "landscape" })).toBe("A4 横");
  });

  it("知らない紙は undefined（開いた文字列なので、知らないと言う）", () => {
    // Renderer が独自の紙を知っていてよいので、勝手に A4 と決めつけない
    // （決めつけると、独自の紙に対して嘘の警告を出す）。
    expect(paperSize({ size: "ハトロン判" })).toBeUndefined();
  });

  it("紙の名前は DSL の paper.size と同じ（A4 / A3 / B5 / letter）", () => {
    expect(Object.keys(PAPERS).sort()).toEqual(["A3", "A4", "B5", "letter"]);
  });
});
