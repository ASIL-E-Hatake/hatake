import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  $comment: string;
  count: number;
  exports: string[];
};

describe("約束する面（@hatake-fw/api）", () => {
  it("index から出ている名前が、一覧と完全に一致する", () => {
    // 台帳を書き直すのは「足す・消す」と決めたときだけ（3版とも同じ合図）:
    //   HATAKE_WRITE_PUBLIC_API=1 npx vitest run test/publicApi.test.ts
    if (process.env.HATAKE_WRITE_PUBLIC_API !== undefined) {
      const names = Object.keys(promised).sort();
      writeFileSync(
        "../spec/public-api.ts.json",
        `${JSON.stringify({ $comment: frozen.$comment, count: names.length, exports: names }, null, 2)}
`,
      );
      return;
    }
    expect(Object.keys(promised).sort()).toEqual([...frozen.exports].sort());
  });

  it("一覧の数が本文と合っている", () => {
    expect(frozen.exports.length).toBe(frozen.count);
  });

  it("約束は**内部より狭い**（広くなったら分けた意味が無い）", () => {
    expect(Object.keys(promised).length).toBeLessThan(Object.keys(internal).length);
  });
});

describe("枠組み自身の使い方", () => {
  /**
   * **自分の CI と道具が、自分の口をどう叩いているか。**
   *
   * CI には `node -e '…'` で枠組みを直に叩く段が 60 以上あり、`tool/*.mjs` も
   * `dist/` を直に読む。どちらも**試験ではないので `npm test` では1行も走らない**。
   * 0.9.14 で口を2つに分けたとき、手元は 2354 件すべて緑なのに CI だけが
   * 続けて落ちた（`wizardForm` → `checkFragmentInContext`）。
   *
   * 見るのは1つ: **`index` から取っている名前は、約束した面に在るか**。
   * 無いなら `internal` に向ける（名前も形もそのまま使える）。
   *
   * ここは**速い見張り**で、通し実行の代わりではない。CI の段を本当に走らせるなら
   * `node tool/ci-local.mjs`（落ちても止まらず、落ちた段を全部並べる）。
   */
  const door = (text: string, mark: string): string[] => {
    const taken: string[] = [];
    for (let at = text.indexOf(mark); at !== -1; at = text.indexOf(mark, at + 1)) {
      // **本当に取っている所だけ**を見る。`check-package.mjs` は配る中身の必須として
      // `"dist/index.js"` という字を並べているだけで、取ってはいない。字の一致だけで
      // 拾うと、そこを指して「約束の面に無い」と言い出す（実際に一度言った）。
      // なので、この字が**取り込みの行き先として書かれている**ことを先に確かめる。
      const quote = Math.max(text.lastIndexOf('"', at), text.lastIndexOf("'", at));
      if (quote === -1) continue;
      const before = text.slice(Math.max(0, quote - 12), quote).trimEnd();
      if (!before.endsWith("from") && !before.endsWith("require(")) continue;

      // 直前の `{ … }`（`import { a, b } from` / `const { a } = require(`）。
      const closed = text.lastIndexOf("}", at);
      const opened = text.lastIndexOf("{", closed);
      if (opened === -1 || closed === -1) continue;
      for (const one of text.slice(opened + 1, closed).split(",")) {
        // `a: b` は別名。**取っている側**の名前が約束の対象。`type` は付け外し自由。
        const name = one.split(":")[0].replace(/\btype\b/, "").trim();
        if (name !== "") taken.push(name);
      }
    }
    return taken;
  };

  // 深い道（`dist/parse.js` のような個別のファイル）は口を通らないので対象外。
  const doors = [
    { path: "../.github/workflows/ci.yml", mark: "dist/index.js" },
    ...readdirSync("tool")
      .filter((one) => one.endsWith(".mjs"))
      .map((one) => ({ path: join("tool", one), mark: "dist/index.js" })),
  ];

  const promisedNames = new Set(frozen.exports);

  it.each(doors)("$path が index から取る名前は、約束した面に在る", ({ path, mark }) => {
    const off = door(readFileSync(path, "utf8"), mark).filter((one) => !promisedNames.has(one));
    expect(off).toEqual([]);
  });

  it("`ci.yml` を本当に読めている（黙って何も見ない状態にならない）", () => {
    // 読む所を動かしたときに、試験が**静かに空振り**するのを止める。
    expect(door(readFileSync("../.github/workflows/ci.yml", "utf8"), "dist/index.js").length)
      .toBeGreaterThan(0);
  });
});

describe("ブラウザに載ること", () => {
  /**
   * **ブラウザに載る口は、ブラウザでそのまま動く。**
   *
   * Web の Renderer（`@hatake-fw/vue3` / `@hatake-fw/react19`）と、その下の
   * `@hatake-fw/runtime` / `@hatake-fw/http` は、定義を読む所にこの枠組みを
   * そのまま使う。だから専用の `core` パッケージを切り出していない
   * （→ [Web の Renderer](../../docs/proposals/web-renderers.ja.md)）。
   *
   * 見る口は**2つ**:
   *
   *   ・`index`    … 業務のコードが呼ぶ（約束する）
   *   ・`internal` … 枠組みの中身。土台と Renderer が通る（約束しない）
   *
   * Node 専用のものは [`tools.ts`](../src/tools.ts) に隔離してある。
   *
   * **`index` だけを見ていた頃、これは黙って通った。** 土台が通るのは `internal`
   * のほうで、そこに `specDir` / `mcpTools` / `mcpContract` / `gitRange` が
   * 混ざっていたので、見本を束ねると `node:path` まで引かれてビルドが落ちた
   * （落ちるのは案件側なので、こちらの CI には出ない）。片方だけ見ていると、
   * 見張りが**空振りしていることに気づけない**。
   */
  const reach = (entry: string): { seen: Set<string>; offenders: string[] } => {
    const seen = new Set<string>();
    const offenders: string[] = [];

    const walk = (file: string): void => {
      if (seen.has(file) || !existsSync(file)) return;
      seen.add(file);
      const src = readFileSync(file, "utf8");
      for (const found of src.matchAll(/from "([^"]+)"/g)) {
        const to = found[1];
        if (to.startsWith("node:")) {
          offenders.push(`${file} → ${to}`);
        } else if (to.startsWith(".")) {
          walk(join("src", to.replace(/^\.\//, "").replace(/\.js$/, ".ts")));
        }
      }
    };
    walk(join("src", `${entry}.ts`));
    return { seen, offenders };
  };

  it.each(["index", "internal"])("`%s` から `node:` を引くものを辿れない", (entry) => {
    const { seen, offenders } = reach(entry);
    // 辿れていること自体も見る（歩き方を間違えたら黙って通る）。
    expect(seen.size).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  it("`tools` は Node 専用のままにしてある（隔離が空になっていない）", () => {
    // 逆側。**ここが綺麗になったら、隔離したものが `internal` に戻っている**。
    expect(reach("tools").offenders.length).toBeGreaterThan(0);
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
