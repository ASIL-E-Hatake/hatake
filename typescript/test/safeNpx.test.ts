import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 手引き・道具の文に、**名前だけの `npx hatake`** を書かない（0.9.27）。
 *
 * 枠組みは npm の registry に出していない（Release の tarball で配っている）。registry には
 * `hatake` という**別の人の、名前が同じだけの道具**が在るので、手元に入っていない場所で
 * `npx hatake …` と打つと、それを取ってきて、こちらの引数で走らせる。
 *
 * 書くときは `npx -p @hatake-fw/api hatake …`。`@hatake-fw` の名前は押さえてあるので
 * 別の人が出すことはできず、入っていなければ 404 で止まる（何も走らない）。
 *
 * 履歴（CHANGELOG・ロードマップ）は起きたことの記録なので数えない。**危なさを説明している行**
 * （同じ行に `registry` か正しい書き方が在る）は数えない＝注意書きは名前だけの形を見せないと書けない。
 */
const ROOT = join(process.cwd(), "..");
const SKIP_DIRS = new Set([
  "node_modules", ".git", "build", "dist", ".dart_tool", ".gradle", ".vitepress", "worktrees",
]);
const TEXT = /\.(md|txt|ts|tsx|mjs|js|json|ya?ml|dart|java|sh)$/;
const HISTORY = new Set(["CHANGELOG.md"]);
// この試験自身（危なさを説明するために書いている）。
const HISTORY_PATHS = new Set(["docs/roadmap.ja.md", "typescript/test/safeNpx.test.ts"]);
/**
 * 生成物（作り直せば直る）。サイトは**生成するフォルダだけ**（docs/site/protocol.ja.md）。
 * 0.9.29 まで `site/docs/` を丸ごと外していたので、手書きの `ai.md` / `index.md` ほか7枚に
 * 名前だけの書き方が 70 行近く残っていた（サイトの AI 向けのページそのもの）。
 */
const GENERATED = ["site/docs/dsl/", "site/docs/partials/", "site/docs/public/", "typescript/spec/"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (TEXT.test(name) && !HISTORY.has(name)) out.push(path);
  }
  return out;
}

// この試験自身が書く字に当たらないよう、つないで作る。
const BARE = new RegExp(`\\bnpx\\s+(?:--yes\\s+|-y\\s+)?${"hat"}ake(?:-mcp)?\\b`);

describe("名前だけの npx hatake を書かない", () => {
  it("手引き・道具の文のどこにも無い", () => {
    const found: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (HISTORY_PATHS.has(rel) || GENERATED.some((one) => rel.startsWith(one))) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!BARE.test(line)) return;
          if (line.includes("registry") || line.includes("-p @hatake-fw/api")) return;
          found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
        });
    }
    expect(found, "`npx -p @hatake-fw/api hatake …` と書いてください").toEqual([]);
  });
});
