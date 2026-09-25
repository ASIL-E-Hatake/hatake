// CI の「TypeScript edition」を**そのままローカルで回す**。
//
// なぜ要るか。このジョブは 70 段以上あって、その多くが `node -e '…'` で枠組みを
// 直に叩く。**試験でも道具でもないので、手元の `npm test` では1行も走らない。**
// 0.9.14 で公開 API の口を2つに分けたとき、手元は 2354 件すべて緑なのに CI だけが
// 3回続けて落ちた（`wizardForm` / `checkFragmentInContext` / …）。
// 1回直して push して待って、また落ちる、を繰り返すのが高くつく。
//
// **止まらずに最後まで走って、落ちた段を全部並べる**のがこの道具の主旨。
// 1回で全部見えれば、横櫛で直せる。
//
// 回し方（Windows からは Docker で。CI と同じ Linux で走らせる）:
//
//   docker run --rm -v "$(pwd -W):/w" -w /w/typescript node:22-slim sh -c '
//     apt-get update -qq && apt-get install -y -qq git curl python3 python3-pip >/dev/null
//     git config --global --add safe.directory "*"
//     node tool/ci-local.mjs'
//
// **道具を入れ忘れると、中身が正しくても落ちます**（`curl: command not found` /
// `pip: command not found`）。GitHub の ubuntu には最初から在るので、CI では起きない。
// `--list` で番号を見て、落ちた段が exit 127 ならまずこれを疑うこと。
// なお Debian の pip は外から入れるのを嫌がるので、要るなら
// `pip install --break-system-packages …` にする（CI 側は素の `pip install`）。
//
//   node tool/ci-local.mjs --list          … 段の一覧（番号つき）
//   node tool/ci-local.mjs --from 30       … 30 番目から
//   node tool/ci-local.mjs --only wizard   … 名前に wizard を含む段だけ
//   node tool/ci-local.mjs --stop          … 最初に落ちた所で止める
//
// `npm install` と `npm test` を含む最初の段は重いので、口の付け替えのような
// 「枠組みの外側」を確かめたいときは `--from 2` で飛ばしてよい。

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname, "..", "..");
const JOB = "typescript";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};

const workflow = parse(readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8"));
const job = workflow.jobs?.[JOB];
if (job === undefined) {
  console.error(`✗ ci.yml に job "${JOB}" が在りません`);
  process.exit(1);
}

// `uses:`（checkout / setup-node）は手元では要らない。走らせるのは `run:` だけ。
const steps = job.steps
  .filter((one) => typeof one.run === "string")
  .map((one, index) => ({
    no: index + 1,
    name: one.name ?? "(名無し)",
    run: one.run,
    cwd: resolve(ROOT, one["working-directory"] ?? "."),
  }));

if (flag("--list")) {
  for (const one of steps) console.log(`${String(one.no).padStart(2)} ${one.name}`);
  console.log(`\n${steps.length} 段`);
  process.exit(0);
}

const from = Number(value("--from") ?? 1);
const only = value("--only");
const chosen = steps.filter(
  (one) => one.no >= from && (only === undefined || one.name.includes(only)),
);

if (chosen.length === 0) {
  console.error("✗ 走らせる段が1つも選ばれていません（--from / --only を確かめてください）");
  process.exit(1);
}

// CI が用意している環境変数のうち、段が実際に読んでいるものだけ。
const env = {
  ...process.env,
  CI: "true",
  GITHUB_WORKSPACE: ROOT,
  GITHUB_OUTPUT: "/tmp/ci-local-output.txt",
  GITHUB_STEP_SUMMARY: "/tmp/ci-local-summary.md",
};

const failed = [];
const started = Date.now();

for (const one of chosen) {
  process.stdout.write(`\n\u001b[1m── ${String(one.no).padStart(2)} ${one.name}\u001b[0m\n`);
  // CI の shell と同じ（`-e` で段の途中の失敗も落とす）。
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", one.run], {
    cwd: one.cwd,
    env,
    encoding: "utf8",
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status === 0) {
    console.log("   ✓");
    continue;
  }
  // **落ちても次へ進む**（止めると1回に1件しか分からない）。
  failed.push({ ...one, out });
  console.log(`   ✗ 落ちました（exit ${result.status ?? result.signal}）`);
  console.log(
    out
      .split("\n")
      .slice(-25)
      .map((line) => `   │ ${line}`)
      .join("\n"),
  );
  if (flag("--stop")) break;
}

const minutes = Math.round((Date.now() - started) / 600) / 100;
console.log(`\n${"─".repeat(60)}`);
console.log(`走らせた段: ${chosen.length} / ${steps.length}（${minutes} 分）`);

if (failed.length === 0) {
  console.log("\u001b[32m✓ ぜんぶ通りました\u001b[0m");
  process.exit(0);
}

console.log(`\u001b[31m✗ ${failed.length} 段が落ちています\u001b[0m\n`);
for (const one of failed) console.log(`  ${String(one.no).padStart(2)} ${one.name}`);
console.log("\n（↑ここを横櫛で直してから、もう一度回してください）");
process.exit(1);
