#!/usr/bin/env node
// **同梱の例から出る画面の枚数**が、書いてある所ぜんぶで揃っているかを見る。
//
// 枚数は「3版で同じ答えが出る」ことの確かめに使っていて、**4か所に直に書いて**ある:
//
//   ・.github/workflows/ci.yml                                  （grep で見ている）
//   ・flutter/packages/hatake_yaml/test/screen_index_source_test.dart
//   ・java/src/test/java/io/hatake/core/ScreenIndexTest.java
//   ・typescript/README.md                                      （見本の出力）
//
// 例を1枚足すと**4つとも**直すことになります。実際、複合キーの例を足したときに
// Java と Dart は直したのに CI と README を取りこぼして、**CI で落ちてから**
// 気づきました。落ちること自体は正しいのですが、**どこを直せばいいかは落ちたログに
// 出てきません**（3か所目・4か所目は、直して回し直してから分かる）。
//
// なので、ここで**数え直して突き合わせ、食い違っている所を一度に名指し**します。
// 枚数そのものは持ちません（例から数える）ので、この道具を直す必要はありません。
//
// 使い方: node tool/check-screen-count.mjs

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// **`dist/` が無いと素の stack trace が出る**（`tool/` はどれも組み立て済みを読む）。
// 何をすればいいかが読めないので、先に一言で言う。CI でも一度ここで止まった。
if (!existsSync(join(HERE, "..", "dist", "internal.js"))) {
  console.error(
    "組み立てたものが在りません（dist/）。先に `npm run build` を回してください" +
      "（tool/ の道具はどれも dist/ を読みます）。",
  );
  process.exit(1);
}

const { buildIndex } = await import("../dist/internal.js");

const ROOT = resolve(HERE, "..", "..");
const EXAMPLES = join(ROOT, "spec", "examples");

/** いま実際に出る枚数（例から数える＝これが正）。 */
const actual = buildIndex(
  readdirSync(EXAMPLES)
    .filter((name) => /\.(ya?ml|json)$/.test(name))
    .map((name) => ({
      file: name,
      source: readFileSync(join(EXAMPLES, name), "utf8"),
    })),
).screens.length;

/**
 * 枚数を書いてある所の目印。
 *
 * **印の次に出てくる数**という決めごとだけで突き合わせます。同じ数がそのファイルの
 * 別の所にも出てくる（他の試験が使う枚数・別の例の出力）ので、書き方を当てにいくと
 * **別の数を拾って嘘の食い違いを言います**。実際そうなったので、当てにいくのを
 * やめて印を置きました。
 */
const MARK = "hatake:shipped-screen-count";

const PLACES = [
  { path: ".github/workflows/ci.yml", how: "grep の文字列を直してください" },
  {
    path: "flutter/packages/hatake_yaml/test/screen_index_source_test.dart",
    how: "expect の数と、その上の試験名を直してください",
  },
  {
    path: "java/src/test/java/io/hatake/core/ScreenIndexTest.java",
    how: "assertEquals の数を直してください",
  },
  {
    path: "typescript/README.md",
    how: "見本の出力の枚数を直してください（中身の行まで合わせる必要はありません）",
  },
];

/** 印のあとに最初に出てくる数（同じ行か、その先の数行）。 */
function writtenIn(path) {
  const lines = readFileSync(join(ROOT, path), "utf8").split("\n");
  const at = lines.findIndex((line) => line.includes(MARK));
  if (at < 0) return null;
  for (const line of lines.slice(at, at + 5)) {
    const found = /(\d+)/.exec(line.split(MARK).join(""));
    if (found !== null) return Number(found[1]);
  }
  return null;
}

const wrong = [];
for (const place of PLACES) {
  const written = writtenIn(place.path);
  if (written !== actual) wrong.push({ ...place, written });
}

console.log(`同梱の例から出る画面は **${actual} 枚**です。`);

if (wrong.length === 0) {
  console.log(`枚数を書いてある ${PLACES.length} か所とも揃っています。`);
  process.exit(0);
}

console.log(`\n**${wrong.length} か所が食い違っています:**`);
for (const one of wrong) {
  console.log(
    one.written === null
      ? `  - ${one.path}: 印（${MARK}）が見つかりません`
      : `  - ${one.path}: ${one.written} 枚と書いてあります → ${one.how}`,
  );
}
console.log(
  "\n例を足した／減らしたときは、**ここに挙がった所を全部**直してください" +
    "（1か所ずつ CI に教えてもらうと、そのたびに回し直すことになります）。",
);
process.exit(1);
