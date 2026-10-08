#!/usr/bin/env node
// 固めた .vsix の中身を確かめる（貼る前に落とす）。
//
//   node tool/check-vsix.mjs <file.vsix> [<期待する版>]
//
// .vsix は zip。依存を足さずに**目次（central directory）だけ**読む。見るのは:
//   ・要るものが入っているか（extension.js・spec・スキーマ3枚・スニペット・README・LICENSE）
//   ・入れてはいけないものが入っていないか（src・test・tool・node_modules）
//   ・package.json の版が期待どおりか（tag と揃っているか）
//   ・大きさが上限を超えていないか（枠組みを丸ごと同梱しているので、膨らんだら気づきたい）

import { readFileSync, statSync } from "node:fs";
import { readZipEntry, readZipIndex } from "./zip.mjs";

const [file, want] = process.argv.slice(2);
if (file === undefined) {
  console.error("使い方: node tool/check-vsix.mjs <file.vsix> [<版>]");
  process.exit(1);
}
const LIMIT = 8 * 1024 * 1024;

const buffer = readFileSync(file);
const entries = readZipIndex(buffer);
const names = [...entries.keys()];
const problems = [];

const MUST = [
  "extension/package.json",
  "extension/dist/extension.js",
  "extension/dist/preview.js",
  "extension/dist/view.js",
  "extension/dist/view.css",
  "extension/media/hatake.svg",
  "extension/dist/spec/hatake-page.schema.json",
  "extension/dist/spec/reference.json",
  "extension/dist/schema/hatake-page.schema.json",
  "extension/dist/schema/hatake-project.schema.json",
  "extension/dist/schema/hatake-intent.schema.json",
  "extension/snippets/hatake.code-snippets",
  "extension/readme.md",
  "extension/LICENSE.txt",
];
for (const one of MUST) {
  if (!names.some((name) => name.toLowerCase() === one.toLowerCase())) problems.push(`入っていない: ${one}`);
}
for (const bad of ["extension/src/", "extension/test/", "extension/tool/", "extension/node_modules/"]) {
  if (names.some((name) => name.startsWith(bad))) problems.push(`入れてはいけないものが入っている: ${bad}`);
}

const manifest = JSON.parse(readZipEntry(buffer, entries.get("extension/package.json")).toString("utf8"));
if (want !== undefined && manifest.version !== want.replace(/^v/, "")) {
  problems.push(`版が違う: .vsix は ${manifest.version}、期待は ${want}`);
}
const size = statSync(file).size;
if (size > LIMIT) problems.push(`大きすぎる: ${(size / 1024 / 1024).toFixed(1)}MB（上限 ${LIMIT / 1024 / 1024}MB）`);

if (problems.length > 0) {
  console.error(`${file} を貼れません:`);
  for (const one of problems) console.error(`  - ${one}`);
  process.exit(1);
}
console.log(`${file}: ${names.length} 件・${(size / 1024).toFixed(0)}KB・版 ${manifest.version}（中身は期待どおり）`);
