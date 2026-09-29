// 固めた `.tgz` が、**貼っていい形になっているか**。
//
// Release に貼る前に見る。貼ったあとに「中身が空だった」と分かっても、tag の中身は
// もう動かせない（0.9.0 の Java で一度やっている）。
//
// `@hatake-fw/api` のほうは `typescript/tool/check-package.mjs` が**入れて叩く**所まで
// 見ている。こちらはブラウザ側の3つで、見るのは3つだけ:
//
//   ・組んだものが入っているか（`dist/index.js` と型）
//   ・runtime には見た目の1枚（`hatake.css`）が入っているか
//   ・名乗っている版が、揃っているか
//
// **組み忘れ**がいちばん起きる（`dist/` が無いまま固めても npm は何も言わない）。

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");

/** そのパッケージに入っていてほしいもの。 */
const MUST = {
  runtime: ["dist/index.js", "dist/index.d.ts", "hatake.css"],
  http: ["dist/index.js", "dist/index.d.ts"],
  vue3: ["dist/index.js", "dist/index.d.ts"],
  react19: ["dist/index.js", "dist/index.d.ts"],
};

const want = process.argv[2];
if (want === undefined) {
  console.error("使い方: node web/tool/check-tarballs.mjs <版>   例: 0.9.16");
  process.exit(1);
}

let bad = 0;
for (const [pkg, files] of Object.entries(MUST)) {
  const dir = join(ROOT, "web", pkg);
  const name = `hatake-fw-${pkg}-${want}.tgz`;
  const path = join(dir, name);

  if (!existsSync(path)) {
    console.error(`✗ ${name} が在りません（先に npm pack してください）`);
    bad += 1;
    continue;
  }

  const declared = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
  if (declared !== want) {
    console.error(`✗ ${pkg} は ${declared} を名乗っていますが、貼ろうとしているのは ${want} です`);
    bad += 1;
    continue;
  }

  // 中身の一覧を見る（展開しない）。
  const listed = execFileSync("tar", ["-tzf", path], { encoding: "utf8" })
    .split("\n")
    .map((one) => one.replace(/^package\//, "").trim())
    .filter(Boolean);

  const missing = files.filter((one) => !listed.includes(one));
  if (missing.length > 0) {
    console.error(`✗ ${name} に入っていません: ${missing.join(", ")}`);
    console.error(`   （組み忘れていませんか。api → runtime の順に組んでから固めます）`);
    bad += 1;
    continue;
  }

  console.log(`  ✓ ${name}（${listed.length} ファイル）`);
}

if (bad > 0) process.exit(1);
console.log(`ブラウザ側の3つは、貼っていい形になっています（${want}）。`);
