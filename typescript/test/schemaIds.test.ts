import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * スキーマの `$id` が、**実際に引ける1つの形**で揃っていることを見る。
 *
 * `$id` は公開すると利用者の定義ファイルの先頭（`# yaml-language-server: $schema=…`）に
 * 焼き付く＝あとから動かせない。しかも**引けなくても誰も落ちない**（エディタが黙って
 * 補完しなくなるだけ）ので、間違っていても気づけない。実際、page のスキーマだけ
 * `/raw/main/` の無い 404 の URL を名乗っていた。
 */
const BASE = "https://github.com/ASIL-E-Hatake/hatake/raw/main/spec/";

describe("スキーマの $id", () => {
  const files = readdirSync("../spec").filter((name) => name.endsWith(".schema.json"));

  it("スキーマが3枚ある", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (const name of files) {
    it(`${name} の $id が、置いてある場所と一致する`, () => {
      const schema = JSON.parse(readFileSync(`../spec/${name}`, "utf8")) as {
        $id?: string;
      };
      expect(schema.$id).toBe(`${BASE}${name}`);
    });
  }

  it("同梱の例が名乗る $schema も、同じ形を指している", () => {
    const example = readFileSync("../spec/examples/customer_master.yaml", "utf8");
    expect(example).toContain(`$schema=${BASE}hatake-page.schema.json`);
  });
});
