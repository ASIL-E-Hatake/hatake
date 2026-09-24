#!/usr/bin/env node
// **コミットしてある生成物を、まとめて作り直す。**
//
// この一式は「元を直せば絵と表が付いてくる」形にしてあるので、**元を直したら
// 作り直す**のが決まりです。ところが作り直す手順は CI にしか書いておらず、
// どれが生成物なのかは**落ちて初めて分かり**ます。
//
// 実際に2回続けて踏みました。見本の画面にボタンを1つ足したら遷移図が古くなって
// 落ち、それを直した直後に、今度は**サイトに貼ってある図**が古くて落ちました。
// 検証も試験も点検も通していたのに、生成物だけ作り直していなかったからです。
//
// 作り直す相手（CI と同じもの。増やすときは CI にも足すこと）:
//
//   ・docs/diagrams/*.svg    … 元データ（*.json）と定義から描く図
//   ・spec/reference.json    … スキーマからの導出
//   ・site/docs/diagrams.md  … 手書きページに**貼ってある**計算の依存図
//
// 3つ目が曲者です。ページ自体は手書きなのに、**中の囲みだけが生成物**なので、
// ファイルの一覧を見ても生成物だと分かりません。
//
// 使い方:
//   node tool/regen.mjs           … 作り直す
//   node tool/regen.mjs --check   … 作り直して、差分が出たら 1（CI と同じ判定）

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const CLI = join(ROOT, "typescript", "dist", "cli.js");

const argv = process.argv.slice(2);
const check = argv.includes("--check");

const run = (args) =>
  execFileSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    stdio: check ? "pipe" : "inherit",
  });

/** 作り直した1件（どこへ）。 */
const MADE = [];

// ① 元データ（json）から描く図。
const diagrams = join(ROOT, "docs", "diagrams");
for (const name of readdirSync(diagrams).filter((one) => one.endsWith(".json"))) {
  const to = join("docs", "diagrams", `${name.slice(0, -5)}.svg`);
  run(["diagram", join("docs", "diagrams", name), "--out", to]);
  MADE.push(to);
}

// ② 定義から描く図（資料とサイトに出しているので、古いままにしない）。
for (const [from, to, ...rest] of [
  ["spec/examples/sales_app.yaml", "docs/diagrams/sales-app-flow.svg"],
  ["docs/diagrams/roles-app.yaml", "docs/diagrams/roles-app-flow.svg"],
  ["docs/diagrams/roles-app.yaml", "docs/diagrams/roles-app-admin.svg", "--role", "admin"],
]) {
  run(["diagram", from, ...rest, "--out", to]);
  MADE.push(to);
}

// ③ スキーマからの導出。
run(["reference", "--spec", "spec", "--out", "spec/reference.json"]);
MADE.push("spec/reference.json");

// ④ 手書きページに**貼ってある**図（囲みの中だけが生成物）。
//
// 印の位置で切る（正規表現を使わない）。囲みの印はバッククォート3つで、正規表現に
// 書くとエスケープが何段にもなり、**間違えても静かに 0 件になる**＝「直したつもりで
// 直っていない」が起きます。実際1度そうなりました。
{
  const page = join(ROOT, "site", "docs", "diagrams.md");
  const real = execFileSync(
    process.execPath,
    [CLI, "diagram", "spec/examples/order_entry.yaml", "--computed"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();

  const fence = "`".repeat(3);
  const open = `${fence}mermaid`;
  const source = readFileSync(page, "utf8");

  const first = source.indexOf(open);
  const second = first < 0 ? -1 : source.indexOf(open, first + open.length);
  const close = first < 0 ? -1 : source.indexOf(fence, first + open.length);
  const why =
    first < 0
      ? "1つも見つかりません"
      : second >= 0
        ? "2つ以上あります"
        : close < 0
          ? "囲みが閉じていません"
          : null;
  if (why !== null) {
    console.error(
      `site/docs/diagrams.md の mermaid の囲みが1つに決まりません（${why}）。` +
        "どれを差し替えるか機械には決められないので、手で直してください。",
    );
    process.exit(1);
  }
  writeFileSync(
    page,
    `${source.slice(0, first)}${open}\n${real}\n${source.slice(close)}`,
  );
  MADE.push("site/docs/diagrams.md");
}

if (!check) {
  console.log(`作り直しました: ${MADE.length} 件`);
  process.exit(0);
}

// **CI と同じ判定**（改行は Windows のチェックアウトで変わるので揃えて比べる）。
let changed;
try {
  changed = execFileSync(
    "git",
    ["diff", "--name-only", "--ignore-cr-at-eol", "--", ...MADE],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .filter((one) => one.length > 0);
} catch {
  console.log("git が居ないので差分を見られません（作り直しはしました）。");
  process.exit(0);
}

if (changed.length === 0) {
  console.log(`コミットしてある生成物は、いまの元と一致しています（${MADE.length} 件）。`);
  process.exit(0);
}

console.log("**生成物が古いままです:**");
for (const one of changed) console.log(`  - ${one}`);
console.log(
  "\n作り直したので、そのままコミットに入れてください" +
    "（`node tool/regen.mjs` で作り直せます）。元を直したら生成物も付いてきます。",
);
process.exit(1);
