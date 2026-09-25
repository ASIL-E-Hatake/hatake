#!/usr/bin/env node
// 規則ごとの「転ぶ定義」を**全部かける**（説明が中身と合っているかを機械で見る）。
//
// 規則の表は、名前の集合までは突き合わせてある。けれど「こう書くと、こうなります」の
// 中身は誰も見ていない＝**説明だけが古い**規則は緑のまま残る。だから規則1つにつき
// 「その規則を実際に出す定義」を持って、CI で全部走らせる。
//
// 出どころは2つ（優先順位は [ruleCaseEntries] が正）:
//   1. spec/rule-cases.json … この仕掛けのために書いた最小の定義
//   2. spec/failures.json   … 実際に転んだ記録（diagnosis.warnings）
//
// 落とすのは3つ。
//   ・転ぶはずの定義が**転ばなかった**（表と中身の食い違い）
//   ・表に無い規則名の定義が残っている（規則が消えた／名前が変わった）
//   ・覆えた数が **--min を下回った**（覆いを減らす方向の変更を黙って通さない）
//
// 使い方: node tool/check-rules.mjs [--min <数>] [--json]

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  renderRuleCases,
  ruleCaseEntries,
  rulesCatalog,
  runRuleCases,
} from "../dist/internal.js";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SPEC = join(ROOT, "spec");

const argv = process.argv.slice(2);
const minAt = argv.indexOf("--min");
const min = minAt === -1 ? 0 : Number(argv[minAt + 1]);
if (Number.isNaN(min)) {
  console.error("--min には数を渡してください。");
  process.exit(1);
}

const read = (name) => JSON.parse(readFileSync(join(SPEC, name), "utf8"));

const rules = rulesCatalog();
const { entries, unknown } = ruleCaseEntries({
  rules,
  cases: read("rule-cases.json"),
  failures: read("failures.json"),
});
const report = runRuleCases(entries, rules, unknown);

console.log(
  argv.includes("--json")
    ? JSON.stringify(report, null, 2)
    : renderRuleCases(report),
);

if (report.broken.length > 0 || report.unknown.length > 0) process.exit(1);
if (report.covered < min) {
  console.error(
    `転ぶ定義が ${report.covered} 件しかありません（${min} 件を下回りました）。` +
      "**覆いを減らす方向の変更**は通しません。",
  );
  process.exit(1);
}
