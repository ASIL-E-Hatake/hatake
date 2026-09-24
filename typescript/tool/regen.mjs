#!/usr/bin/env node
// **コミットしてある生成物を、まとめて作り直す。**
//
// この一式は「元を直せば絵と表が付いてくる」形にしてあるので、**元を直したら
// 作り直す**のが決まりです。ところが作り直す手順は CI にしか書いておらず、
// どれが生成物なのかは**落ちて初めて分かり**ます。
//
// 実際に踏みました。見本の画面にボタンを1つ足したところ、遷移図（`docs/diagrams/`）
// が古いままで CI が落ちました。検証・試験・点検は全部通していたのに、
// **生成物だけ作り直していなかった**からです。
//
// 作り直す相手（CI と同じもの。増やすときは CI にも足すこと）:
//
//   ・docs/diagrams/*.svg   … 元データ（*.json）と定義から描く図
//   ・spec/reference.json   … スキーマからの導出
//
// 使い方:
//   node tool/regen.mjs           … 作り直す
//   node tool/regen.mjs --check   … 作り直して、差分が出たら 1（CI と同じ判定）

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
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

/** 作り直す1件（何を、どこへ）。 */
const MADE = [];

// ① 元データ（json）から描く図。
const diagrams = join(ROOT, "docs", "diagrams");
for (const name of readdirSync(diagrams).filter((one) => one.endsWith(".json"))) {
  const from = join("docs", "diagrams", name);
  const to = join("docs", "diagrams", `${name.slice(0, -5)}.svg`);
  run(["diagram", from, "--out", to]);
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
