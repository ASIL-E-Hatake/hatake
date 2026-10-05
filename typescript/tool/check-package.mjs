#!/usr/bin/env node
// **配る形のまま動かす。**
//
// `npm pack` で固めて、**リポジトリの外**に展開して、そこから CLI を叩く。リポジトリの
// 中で試すと `spec/` が上に見つかってしまい、**同梱できていなくても通る**（配ってから
// 「引けません」と言われる形の事故）。だから展開先は OS の一時置き場にする。
//
// 見るのは4つ:
//   1. 固めた中に `spec/` と `dist/` と LICENSE が入っている
//   2. **spec を読む道具**が、その中の spec を見つけて答える（引けなければ落とす）
//   3. 定義を1枚通す（配った形で普通に使える）
//   4. **bin を名前で叩いて**答えが返る（`npx hatake` と同じ道。0.9.25 まで、bin から
//      起動すると何も出さずに 0 で終わっていた。ここは `node dist/cli.js` で叩いていたので
//      bin が張られていることしか見ておらず、気づけなかった）

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...options });

const fail = (message, detail) => {
  console.error(`✗ ${message}`);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
};

// 1. 固める（prepack が spec と LICENSE を持ち込み、tsc をかける）
const packed = JSON.parse(run("npm", ["pack", "--json", "--silent"], { cwd: PKG }));
const tarball = join(PKG, packed[0].filename);
const inside = new Set(packed[0].files.map((one) => one.path));

// `dist/internal.js` も要る。**`exports` が指している口は、配った中に在ること。**
// 無ければ `@hatake-fw/api/internal` が入れた先で解決できず、しかも壊れ方が
// 「入れるまで分からない」（リポジトリの中では in-place で見えてしまう）。
for (const must of [
  "dist/cli.js",
  "dist/index.js",
  "dist/internal.js",
  "spec/hatake-page.schema.json",
  "LICENSE",
]) {
  if (!inside.has(must)) fail(`固めた中に ${must} が入っていません`, [...inside].slice(0, 20).join("\n"));
}
console.log(`固めました: ${packed[0].filename}（${inside.size} ファイル / ${Math.round(packed[0].unpackedSize / 1024)} KB）`);

// 2. **リポジトリの外**に、使う側と同じやり方で入れる（`npm i <tarball>`）。
//    リポジトリの中で試すと `spec/` が上に見つかって、同梱できていなくても通る。
//    展開して直接叩くのではなく**入れる**のは、依存（yaml）と `bin` の張り方まで
//    配った形で確かめるため。
const work = mkdtempSync(join(tmpdir(), "hatake-pack-"));
try {
  writeFileSync(
    join(work, "package.json"),
    JSON.stringify({ name: "hatake-pack-check", private: true, type: "module" }, null, 2),
  );
  run("npm", ["install", "--no-audit", "--no-fund", "--silent", tarball], { cwd: work });

  const root = join(work, "node_modules", "@hatake-fw", "api");
  if (!existsSync(join(root, "spec", "hatake-page.schema.json"))) {
    fail("入れた中に spec がありません", readdirSync(root).join(" "));
  }
  // bin が張られているか（`npx hatake …` が効く形かどうか）。
  for (const name of ["hatake", "hatake-mcp"]) {
    if (!existsSync(join(work, "node_modules", ".bin", name))) {
      fail(`bin が張られていません: ${name}`, readdirSync(join(work, "node_modules", ".bin")).join(" "));
    }
  }

  const cli = join(root, "dist", "cli.js");
  const call = (args) => {
    try {
      return run(process.execPath, [cli, ...args], { cwd: work });
    } catch (e) {
      fail(`配った形で "${args.join(" ")}" が落ちました`, `${e.stdout ?? ""}${e.stderr ?? ""}`);
      return "";
    }
  };

  // 3. spec を読む道具が、同梱の spec を見つけて答えるか。
  const checks = [
    { args: ["reference", "rowsPerPage"], want: "rowsPerPage" },
    { args: ["examples", "帳票"], want: "report" },
    { args: ["rules", "groupby-without-sort"], want: "groupBy" },
  ];
  for (const one of checks) {
    const out = call(one.args);
    if (!out.includes(one.want)) {
      fail(`"${one.args.join(" ")}" の答えに ${one.want} がありません`, out.slice(0, 400));
    }
  }

  // 4. 定義を1枚通す（雛形を出して、そのまま検証する）。
  const page = join(work, "page.yaml");
  writeFileSync(page, call(["new", "crud", "--id", "customer_master", "--title", "顧客マスタ"]));
  const validated = call(["validate", page]);
  if (!validated.includes("OK")) fail("配った形で雛形が検証に通りません", validated);

  // 5. **bin を名前で**叩く（使う人と同じ道）。答えが空なら落とす＝黙って 0 を通さない。
  const binOf = (name) =>
    join(work, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
  const viaBin = (name, args, input) =>
    spawnSync(binOf(name), args, {
      cwd: work,
      encoding: "utf8",
      input,
      shell: process.platform === "win32",
    });
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const said = viaBin("hatake", ["--version"]);
  if (said.status !== 0 || said.stdout.trim() !== version) {
    fail(
      `bin の hatake が版を言いません（${JSON.stringify(said.stdout)}、終了コード ${said.status}）`,
      said.stderr,
    );
  }
  const checked = viaBin("hatake", ["validate", page]);
  if (!checked.stdout.includes("OK")) {
    fail("bin の hatake で雛形を検証しても、何も返りません", `${checked.stdout}${checked.stderr}`);
  }
  // MCP は標準入力が閉じれば終わる。起動したことは標準エラーの1行で分かる。
  const served = viaBin("hatake-mcp", [], "");
  if (!served.stderr.includes("hatake MCP サーバ")) {
    fail("bin の hatake-mcp が起動しません", `${served.stdout}${served.stderr}`);
  }

  console.log(
    "入れた形のまま、spec を読む道具も定義の検証も動きました（bin を名前で叩いても答えが返ります）。",
  );
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(tarball, { force: true });
}
