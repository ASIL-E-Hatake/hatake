// ブラウザに載る側が、**Node でしか動かないものを引いていない**ことを見る。
//
// なぜ要るか。`@hatake-fw/api` には口が3つある:
//
//   ・`@hatake-fw/api`          … 約束する面
//   ・`@hatake-fw/api/internal` … 枠組みの中身。**ブラウザで動く**
//   ・`@hatake-fw/api/tools`    … CLI・MCP・git。**Node 専用**
//
// 土台（`runtime` / `http`）も Renderer（`vue3` / `react19`）も `internal` を通る。
// 以前は `tools` の中身が `internal` に混ざっていて、見本を束ねた瞬間に
// `node:path` まで引かれて**案件のビルドが落ちた**。落ちるのは案件側なので、
// こちらの CI には何も出ない —— だからここで見る。
//
// 枠組みの中の辿り（`internal` から `node:` に届かないか）は
// `typescript/test/publicApi.test.ts` が見ている。ここが見るのは**web 側の字**。

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// **どこから呼んでも同じものを見る**（この道具の場所から数える）。cwd に頼ると、
// パッケージの中から呼んだときに「見つかりません」で落ちる＝検査が通ったのか
// 落ちたのか分からない。
const WEB = dirname(dirname(fileURLToPath(import.meta.url)));

const PACKAGES = ["runtime", "http", "vue3", "react19"];

/** Node 専用と分かっている行き先。 */
const NODE_ONLY = ["@hatake-fw/api/tools"];

const files = (dir) => {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...files(path));
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) found.push(path);
  }
  return found;
};

/** 出す字は短く（絶対パスを並べても読めない）。 */
const short = (path) => path.slice(WEB.length + 1).split("\\").join("/");

const offenders = [];
let looked = 0;

for (const name of PACKAGES) {
  const dir = join(WEB, name, "src");
  for (const path of files(dir)) {
    looked += 1;
    const text = readFileSync(path, "utf8");
    for (const found of text.matchAll(/from "([^"]+)"/g)) {
      const to = found[1];
      if (to.startsWith("node:")) offenders.push(`${path} → ${to}`);
      else if (NODE_ONLY.includes(to)) offenders.push(`${short(path)} → ${to}（Node 専用の口）`);
    }
  }
}

// 見ていること自体も見る（置き場所を動かしたら黙って空振りする）。
if (looked < 20) {
  console.error(`ブラウザ側の字を ${looked} 本しか見ていません。置き場所が変わっていませんか。`);
  process.exit(1);
}

if (offenders.length > 0) {
  console.error("ブラウザに載る側が Node 専用のものを引いています:");
  for (const one of offenders) console.error(`  ${one}`);
  console.error("");
  console.error("`@hatake-fw/api/internal` に寄せるか、その処理をサーバ側に置いてください。");
  process.exit(1);
}

console.log(`ブラウザ側 ${looked} 本: Node 専用の引き込みは在りません。`);
