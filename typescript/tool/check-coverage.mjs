#!/usr/bin/env node
// **DSL のどこがまだ一度も書かれていないか**を数える。
//
// 単体試験が在ることと、**通しで動くアプリで一度でも書かれたこと**は別です。
// 実際、外から使って出た不具合4件は、3版の試験が全部緑の状態で存在していました。
// 一度も書かれていないキーは「動かしたことがない」ということなので、
// **1.0 で凍らせる前に、全部いちど書いて動かす**ための台帳がこれです。
//
// 数える単位は**キー名ではなく (ノード, キー) の組**にしてあります。`roles` は
// 項目・列・ボタン・メニュー・カードの5か所に書けますが、1か所で書いたからといって
// 残り4か所を試したことにはならないからです。
//
// 見る相手（`--from`、既定は同梱の例）:
//   spec/examples/*.yaml … 配っている例
// 見本リポジトリの定義を足すこともできます:
//   node tool/check-coverage.mjs --from ../../hatake-example/apps/*/definitions/app.yaml
//
// **書けない／書かないと決めたもの**は `spec/coverage-exclusions.json` に
// **理由つきで**書きます。理由を書かせるのが肝で、書かせないと
// 「たまたま漏れた」と「意図して外した」が区別できず、凍結の判断に使えません。
//
// 使い方:
//   node tool/check-coverage.mjs            … 一覧を出す
//   node tool/check-coverage.mjs --json     … 機械が読む形
//   node tool/check-coverage.mjs --check    … 未着手が1件でも在れば 1（CI 用）

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REFERENCE = join(ROOT, "spec", "reference.json");
const EXCLUSIONS = join(ROOT, "spec", "coverage-exclusions.json");

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argsOf = (name) => {
  const at = argv.indexOf(name);
  if (at < 0) return [];
  const out = [];
  for (let i = at + 1; i < argv.length && !argv[i].startsWith("--"); i += 1) {
    out.push(argv[i]);
  }
  return out;
};

const reference = JSON.parse(readFileSync(REFERENCE, "utf8"));
const nodes = reference.nodes;

/** 除外表（理由つき）。無ければ空。 */
const exclusions = existsSync(EXCLUSIONS)
  ? JSON.parse(readFileSync(EXCLUSIONS, "utf8"))
  : { excluded: [] };
const excludedOf = new Map(
  (exclusions.excluded ?? []).map((one) => [`${one.node}.${one.key}`, one.why]),
);

/** 数える相手ぜんぶ（ノード, キー）。 */
const wanted = [];
for (const [node, body] of Object.entries(nodes)) {
  for (const one of body.keys ?? []) wanted.push({ node, key: one.key });
}

/** 書かれた所（`ノード.キー` → どのファイルで）。 */
const seen = new Map();
const mark = (node, key, where) => {
  const at = `${node}.${key}`;
  if (!seen.has(at)) seen.set(at, new Set());
  seen.get(at).add(where);
};

const isMap = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 候補のノードのうち、その値を説明しているものを返す。
 *
 * 画面は `type:` で決まる（`crud` → `crudPage`）。それ以外で候補が複数あるのは、
 * 同じ形に別名のノードが付いているだけ（`maxRows` は `action.maxRows` と
 * `maxRows` の両方に紐づいている）なので、**全部に降りる**。降りた先で
 * 「そのノードが declare しているキー」だけに印を付けるので、水増しにはならない。
 */
function pickNodes(candidates, value) {
  if (isMap(value) && typeof value.type === "string") {
    const byType = `${value.type}Page`;
    if (candidates.includes(byType)) return [byType];
  }
  return candidates;
}

/** 定義を1つ歩いて、書かれている (ノード, キー) に印を付ける。 */
function walk(value, node, where) {
  if (Array.isArray(value)) {
    for (const one of value) walk(one, node, where);
    return;
  }
  if (!isMap(value)) return;
  const body = nodes[node];
  if (body === undefined) return;
  const declared = new Map((body.keys ?? []).map((one) => [one.key, one]));

  for (const [key, child] of Object.entries(value)) {
    const entry = declared.get(key);
    if (entry === undefined) continue; // 知らないキーは validate の担当
    mark(node, key, where);
    const candidates = entry.nodes ?? [];
    if (candidates.length === 0) continue;
    const children = Array.isArray(child) ? child : [child];
    for (const one of children) {
      for (const next of pickNodes(candidates, one)) walk(one, next, where);
    }
  }
}

const given = argsOf("--from");
const files =
  given.length > 0
    ? given
    : globSync("spec/examples/*.yaml", { cwd: ROOT }).map((one) => join(ROOT, one));

for (const file of files) {
  let document;
  try {
    document = parseYaml(readFileSync(file, "utf8"));
  } catch {
    continue; // 読めないものは数えない（validate の担当）
  }
  if (!isMap(document)) continue;
  walk(document, "document", file.replace(`${ROOT}/`, "").replace(/\\/g, "/"));
}

const covered = [];
const missing = [];
const excluded = [];
for (const one of wanted) {
  const at = `${one.node}.${one.key}`;
  if (seen.has(at)) {
    covered.push({ ...one, where: [...seen.get(at)] });
  } else if (excludedOf.has(at)) {
    excluded.push({ ...one, why: excludedOf.get(at) });
  } else {
    missing.push(one);
  }
}

if (has("--json")) {
  console.log(
    JSON.stringify(
      {
        total: wanted.length,
        covered: covered.length,
        excluded: excluded.length,
        missing,
        files: files.length,
      },
      null,
      2,
    ),
  );
} else {
  const rate = ((covered.length / (wanted.length - excluded.length)) * 100).toFixed(1);
  console.log(
    `(ノード, キー) は ${wanted.length} 組。` +
      `書かれている ${covered.length} ／ 除外 ${excluded.length} ／ ` +
      `**まだ一度も書かれていない ${missing.length}**（${rate}%）`,
  );
  console.log(`見た定義: ${files.length} 枚`);
  if (missing.length > 0) {
    console.log("\nまだ一度も書かれていない所:");
    const byNode = new Map();
    for (const one of missing) {
      if (!byNode.has(one.node)) byNode.set(one.node, []);
      byNode.get(one.node).push(one.key);
    }
    for (const [node, keys] of [...byNode].sort()) {
      console.log(`  ${node}: ${keys.sort().join(" / ")}`);
    }
    console.log(
      "\n書けないものは spec/coverage-exclusions.json に**理由つきで**書いてください" +
        "（理由が無いと、漏れたのか外したのかが後から分かりません）。",
    );
  }
  if (excluded.length > 0) {
    console.log(`\n除外（理由つき）${excluded.length} 件:`);
    for (const one of excluded) console.log(`  ${one.node}.${one.key} … ${one.why}`);
  }
}

if (has("--check") && missing.length > 0) process.exit(1);
