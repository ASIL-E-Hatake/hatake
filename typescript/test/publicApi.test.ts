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

describe("CI の中の使い方", () => {
  /**
   * CI には `node -e '…'` で枠組みを直に叩く段がいくつか在る。**そこは試験でも
   * 道具でもないので、口を付け替えるときに見落とす**（実際 0.9.14 で見落として、
   * 手元は全部緑なのに CI だけが `wizardForm is not a function` で落ちた）。
   *
   * ここで見るのは1つ: **`dist/index.js` から取っている名前は、約束した面に在るか**。
   * 無いなら `dist/internal.js` に向ける（名前も形もそのまま使える）。
   *
   * 見るのは `const { … } = require(…)` の形だけ。深い道（`dist/parse.js` のような
   * 個別のファイル）は口を通らないので対象外＝そちらは今までどおり動く。
   */
  it("`dist/index.js` から取っている名前は、約束した面に在る", () => {
    const yml = readFileSync("../.github/workflows/ci.yml", "utf8");
    const door = "dist/index.js";
    const taken: string[] = [];

    for (let at = yml.indexOf(door); at !== -1; at = yml.indexOf(door, at + 1)) {
      const opened = yml.lastIndexOf("const {", at);
      const closed = yml.indexOf("}", opened);
      if (opened === -1 || closed === -1 || closed > at) continue;
      for (const one of yml.slice(opened + "const {".length, closed).split(",")) {
        // `a: b` は別名。**取っている側**の名前が約束の対象。
        const name = one.split(":")[0].trim();
        if (name !== "") taken.push(name);
      }
    }

    // 取っている所が1つも見つからないなら、この試験は**黙って何も見ていない**。
    expect(taken.length).toBeGreaterThan(0);

    const promisedNames = new Set(frozen.exports);
    expect(taken.filter((one) => !promisedNames.has(one))).toEqual([]);
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
