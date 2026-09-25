import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as promised from "../src/index.js";
import * as internal from "../src/internal.js";

/**
 * 公開 API が、気づかないうちに広がっていないかを見る。
 *
 * 口は2つに分けてある:
 *
 *   ・`@hatake-fw/api`          … **約束する**（ここが広がったら目に入る）
 *   ・`@hatake-fw/api/internal` … 使えるが**約束しない**（断りなく変わる）
 *
 * 分ける前は `index.ts` が 142 モジュールを `export *` で丸ごと出していたので、
 * **内部に定数を1つ足すだけで約束が1つ増えて**いた（8日で 586 → 588、どちらも
 * 検証規則の内部の表）。全部を約束すると、人に見せる字を良くするだけで
 * 「約束を破った」ことになる。
 *
 * この試験は**是非を判定しない**（何を約束すべきかは人が決める）。やるのは1つで、
 * **約束の面が変わったら必ず目に入る**ようにすること。
 */
const frozen = JSON.parse(readFileSync("../spec/public-api.ts.json", "utf8")) as {
  count: number;
  exports: string[];
};

describe("約束する面（@hatake-fw/api）", () => {
  it("index から出ている名前が、一覧と完全に一致する", () => {
    expect(Object.keys(promised).sort()).toEqual([...frozen.exports].sort());
  });

  it("一覧の数が本文と合っている", () => {
    expect(frozen.exports.length).toBe(frozen.count);
  });

  it("約束は**内部より狭い**（広くなったら分けた意味が無い）", () => {
    expect(Object.keys(promised).length).toBeLessThan(Object.keys(internal).length);
  });
});

describe("内部の口（@hatake-fw/api/internal）", () => {
  it("約束したものは、内部からも引ける（道を2つに割らない）", () => {
    // 同じものを2か所から出しているのではなく、**内部が上位集合**という関係。
    // ここが崩れると「約束された名前が internal に無い」＝使う側が口を選べなくなる。
    const inside = new Set(Object.keys(internal));
    const missing = Object.keys(promised).filter((one) => !inside.has(one));
    expect(missing).toEqual([]);
  });
});
