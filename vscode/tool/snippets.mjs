#!/usr/bin/env node
// スニペットを `hatake new` の雛形から作る（**手で書かない**＝古くならない）。
//
//   node tool/snippets.mjs          … snippets/hatake.code-snippets を書き直す
//   node tool/snippets.mjs --check  … 書いてあるものが雛形と同じか見る（違えば 1。CI 用）
//
// 雛形は MCP の hatake_new_page と同じ関数から出る。id と画面名は置き換え欄（${1} / ${2}）に
// して、書いた人がすぐ自分の名前に直せるようにする。

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hatakeTools } from "@hatake-fw/api/tools";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(HERE, "snippets", "hatake.code-snippets");
const SPEC = resolve(HERE, "..", "spec");

const tools = hatakeTools({ specDir: SPEC, readFile: (path) => readFileSync(path, "utf8") });
const newPage = tools.find((one) => one.name === "hatake_new_page");
const kinds = newPage.inputSchema.properties.kind.enum;

const ID = "my_page";
const TITLE = "画面名";
const snippets = {};
for (const kind of kinds) {
  const yaml = newPage.run({ kind, id: ID, title: TITLE });
  const body = yaml
    .replace(/\$/g, "\\$")
    .replaceAll(ID, "${1:" + ID + "}")
    .replaceAll(TITLE, "${2:" + TITLE + "}")
    .split("\n");
  while (body.length > 0 && body[body.length - 1] === "") body.pop();
  snippets[`hatake: ${kind}`] = {
    prefix: [`hatake-${kind}`, `hatake ${kind}`],
    description: `hatake の ${kind} 画面の雛形（hatake new ${kind} と同じもの）`,
    body,
  };
}

const text = `${JSON.stringify(snippets, null, 2)}\n`;
if (process.argv.includes("--check")) {
  let now = "";
  try {
    now = readFileSync(OUT, "utf8");
  } catch {}
  if (now !== text) {
    console.error(`スニペットが雛形と違います: ${OUT}（node tool/snippets.mjs で作り直してください）`);
    process.exit(1);
  }
  console.log(`スニペットは雛形と同じです（${kinds.length} 種）。`);
} else {
  writeFileSync(OUT, text);
  console.log(`書きました: ${OUT}（${kinds.length} 種）`);
}
