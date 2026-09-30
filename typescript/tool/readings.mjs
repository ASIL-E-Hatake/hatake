#!/usr/bin/env node
// **読み物の漏れ**を差分から見る（CLAUDE.md「読み物の更新」）。
//
// 実装を直して読み物を直し忘れる、はレビューでも試験でも見つからない。読み物は動かない
// ので、古いことが書いてあっても誰も落ちない（0.9.22 まで「ページ自身に roles は書けない」
// が5か所に残り、見本の README は Vue 版が入ったあとも「これから増やす予定: Vue 版」と
// 言っていた）。ここで機械が言えるのは2つ:
//
//   1. **消えた名前**が読み物に残っている（公開 API・規則の id・DSL のキー・CLI の命令）
//      ＝読んだ人が、無いものを探しに行く
//   2. **足した名前**が読み物のどこにも出てこない
//      ＝在るのに誰も知らない（AI は読み物と道具の出力しか見ない）
//
// 言えないのは**言い回しの古さ**（「予定」「まだ無い」「書けない」）。これは人と AI が
// 読んで直す。最後に「この差分で触っていない読み物」を出すので、そこから当たる。
//
// 基準は既定で main。**まだコミットしていない変更も数える**（作業ツリーと比べる）。
//
// 使い方: node typescript/tool/readings.mjs [--base <ref>] [--list] [--json]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const BASE = option("--base") ?? "main";
const LIST = args.includes("--list");
const JSON_OUT = args.includes("--json");

const git = (...rest) =>
  execFileSync("git", rest, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// --- 読み物 --------------------------------------------------------------

/**
 * 読み物＝人と AI が読む文。**生成物は入れない**（直すのは生成元）。
 * `typescript/spec/` は配るときの写し、`site/docs/` はサイトの生成物。
 */
const isReading = (path) =>
  /\.(md|txt)$/.test(path) &&
  !path.startsWith("site/docs/") &&
  !path.startsWith("typescript/spec/") &&
  !path.includes("/node_modules/") &&
  !path.includes("/test/") &&
  !path.includes("/golden/") &&
  !path.startsWith(".claude/worktrees/") &&
  (path.endsWith(".md") || /(^|\/)llms[^/]*\.txt$/.test(path));

/**
 * **起きたことの記録**（書いてある名前が消えていても正しい）。消えた名前の検査からは
 * 外す。足した名前が「ここにだけ」書いてあるのも数えない（記録は使い方の説明ではない）。
 */
const isHistory = (path) =>
  path === "CHANGELOG.md" ||
  path.endsWith("/CHANGELOG.md") ||
  path === "docs/roadmap.ja.md" ||
  path === "docs/roadmap-utils.ja.md" ||
  path.startsWith("docs/blog/") ||
  path.startsWith("docs/proposals/");

const tracked = git("ls-files").split("\n").filter(Boolean);
const untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
const readings = [...new Set([...tracked, ...untracked])].filter(isReading).sort();
const changed = new Set([
  ...git("diff", "--name-only", BASE).split("\n").filter(Boolean),
  ...untracked,
]);

// --- 名前（基準と今） ------------------------------------------------------

const atBase = (path) => {
  try {
    return git("show", `${BASE}:${path}`);
  } catch {
    return undefined; // 基準に無いファイル
  }
};
const now = (path) => (existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : undefined);
const parse = (text) => (text === undefined ? undefined : JSON.parse(text));

/** 公開 API（3版の台帳）。Java は型の単純名（`a.b.C$D` → `C`）。 */
function publicNames(read) {
  const names = new Set();
  const ts = parse(read("spec/public-api.ts.json"));
  for (const one of ts?.exports ?? []) names.add(one);
  const dart = parse(read("spec/public-api.dart.json"));
  for (const list of Object.values(dart?.packages ?? {})) for (const one of list) names.add(one);
  const java = parse(read("spec/public-api.java.json"));
  for (const one of java?.types ?? []) names.add(one.split(".").pop().split("$")[0]);
  return names;
}

/** 診断の id（警告・助言）。 */
function ruleIds(read) {
  const ids = parse(read("spec/rule-ids.json"));
  return new Set([...(ids?.warnings ?? []), ...(ids?.advice ?? [])]);
}

/** DSL のキー（スキーマに出てくる properties の名前ぜんぶ）。 */
function dslKeys(read) {
  const found = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== "object") return;
    if (node.properties !== null && typeof node.properties === "object") {
      for (const key of Object.keys(node.properties)) found.add(key);
    }
    Object.values(node).forEach(walk);
  };
  walk(parse(read("spec/hatake-page.schema.json")));
  return found;
}

/** CLI の命令（ヘルプに並んでいる `hatake <命令>`）。 */
function commands(read) {
  const text = read("typescript/src/cli.ts") ?? "";
  return new Set([...text.matchAll(/^ {2}hatake ([a-z][a-z-]+)/gm)].map((m) => m[1]));
}

const KINDS = [
  { kind: "公開 API", of: publicNames },
  { kind: "規則の id", of: ruleIds },
  { kind: "DSL のキー", of: dslKeys },
  { kind: "CLI の命令", of: commands },
];

const added = [];
const removed = [];
for (const { kind, of } of KINDS) {
  const before = of(atBase);
  const after = of(now);
  for (const name of after) if (!before.has(name)) added.push({ kind, name });
  for (const name of before) if (!after.has(name)) removed.push({ kind, name });
}

// --- 突き合わせ ------------------------------------------------------------

const text = new Map(readings.map((path) => [path, now(path) ?? ""]));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 名前の前後が識別子の続きでないこと（`roles` が `rolesOf` に当たらないように）。
const pattern = (name) => new RegExp(`(^|[^A-Za-z0-9_-])${escape(name)}($|[^A-Za-z0-9_-])`);

const leftovers = [];
for (const one of removed) {
  const re = pattern(one.name);
  for (const [path, body] of text) {
    if (isHistory(path)) continue;
    body.split("\n").forEach((line, index) => {
      if (re.test(line)) leftovers.push({ ...one, at: `${path}:${index + 1}`, line: line.trim() });
    });
  }
}

// DSL のキーはよくある語（`fixed` / `copy`）が多いので、**キーとして書いてある**ときだけ
// 数える（`` `fixed` `` か YAML の `fixed:`）。ただの字面で当てると「書いてある」と誤る。
const keyPattern = (name) => new RegExp(`\`${escape(name)}\`|(^|[\s{,])${escape(name)}:`, "m");

const unmentioned = added.filter((one) => {
  const re = one.kind === "DSL のキー" ? keyPattern(one.name) : pattern(one.name);
  return ![...text].some(([path, body]) => !isHistory(path) && re.test(body));
});

const touched = readings.filter((path) => changed.has(path));
const untouched = readings.filter((path) => !changed.has(path));

// --- 出力 --------------------------------------------------------------------

if (JSON_OUT) {
  console.log(JSON.stringify({ base: BASE, added, removed, leftovers, unmentioned, touched, untouched }, null, 2));
} else {
  const say = (line = "") => console.log(line);
  say(`読み物 ${readings.length} 本（基準 ${BASE} から触ったもの ${touched.length} 本）`);
  say(`足した名前 ${added.length} 個・消えた名前 ${removed.length} 個（公開 API・規則の id・DSL のキー・CLI の命令）`);
  if (leftovers.length > 0) {
    say();
    say(`✗ 消えた名前が読み物に残っています（${leftovers.length} か所）:`);
    for (const one of leftovers) say(`  ${one.at}  ${one.kind} "${one.name}"  … ${one.line.slice(0, 80)}`);
  }
  if (unmentioned.length > 0) {
    say();
    say(`✗ 足した名前が、読み物のどこにも出てきません（${unmentioned.length} 個。CHANGELOG・ロードマップは数えない）:`);
    for (const one of unmentioned) say(`  ${one.kind} "${one.name}"`);
  }
  say();
  say("この差分で触った読み物:");
  for (const path of touched) say(`  ${path}`);
  say();
  say(
    `触っていない読み物 ${untouched.length} 本。**言い回しの古さは機械には分からない**ので、` +
      "変わったこと（名前・振る舞い・「できない」「予定」と書いてあったこと）で検索して当たる。",
  );
  if (LIST) for (const path of untouched) say(`  ${path}`);
  if (leftovers.length === 0 && unmentioned.length === 0) say("名前の漏れはありません。");
}

process.exitCode = leftovers.length > 0 || unmentioned.length > 0 ? 1 : 0;
