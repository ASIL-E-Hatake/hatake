import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

/**
 * 公開 API が、気づかないうちに広がっていないかを見る。
 *
 * 公開したあとに**減らすのは破壊的変更**なので、出ているものは全部「約束」になる。
 * 内部の道具をうっかり `index.ts` から出すと、それも約束に入る＝あとで消せない。
 *
 * この試験は**是非を判定しない**（何を約束すべきかは人が決める）。やるのは1つで、
 * **surface が変わったら必ず目に入る**ようにすること。
 */
const frozen = JSON.parse(readFileSync("../spec/public-api.ts.json", "utf8")) as {
  count: number;
  exports: string[];
};

describe("公開 API の広さ", () => {
  it("index から出ている名前が、一覧と完全に一致する", () => {
    expect(Object.keys(api).sort()).toEqual([...frozen.exports].sort());
  });

  it("一覧の数が本文と合っている", () => {
    expect(frozen.exports.length).toBe(frozen.count);
  });
});
