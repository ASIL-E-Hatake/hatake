#!/usr/bin/env node
// 配るときに `spec/` をパッケージの中へ持ち込む。
//
// CLI と MCP サーバは**実行時に** `spec/` を読む（スキーマ・例のカタログ・対照表・
// 規則ごとの転ぶ定義…）。いままでは「リポジトリを持っている前提」で上へ辿っていたので、
// **配った先では何も引けない**（`--spec` を毎回渡すことになる）。
//
// 決めごと3つ:
//   ・**test 専用のものは持ち込まない**（`conformance/` は3版の突き合わせ、`tools/` は
//     python の道具。配る相手は使わない）。それ以外は全部入れる＝「これは要る／要らない」を
//     ファイル単位で判断すると、足したときに入れ忘れる
//   ・**作り直す前に消す。** 前に配ったときの残りが混ざると、消したはずのものが配られる
//   ・**空なら落ちる。** 黙って spec 無しのパッケージを作らない（配ってから気づく）

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FROM = resolve(HERE, "..", "..", "spec");
const INTO = resolve(HERE, "..", "spec");

/** 配らないもの（test 専用）。 */
const SKIP = new Set(["conformance", "tools"]);

/** そこが spec だと分かる目印（`specDir.ts` と同じ字）。 */
const MARK = "hatake-page.schema.json";

if (!existsSync(join(FROM, MARK))) {
  console.error(`spec が見つかりません: ${FROM}`);
  process.exit(1);
}

rmSync(INTO, { recursive: true, force: true });
mkdirSync(INTO, { recursive: true });

let files = 0;
const count = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) count(path);
    else files += 1;
  }
};

for (const name of readdirSync(FROM)) {
  if (SKIP.has(name)) continue;
  cpSync(join(FROM, name), join(INTO, name), { recursive: true });
}

if (!existsSync(join(INTO, MARK))) {
  console.error(`持ち込めませんでした（目印が無い）: ${INTO}`);
  process.exit(1);
}
count(INTO);

// LICENSE はリポジトリの根に1枚しか無く、npm は**パッケージの中**しか見ない
// （入れないと「ライセンス不明」で配ることになる）。
const LICENSE = resolve(HERE, "..", "..", "LICENSE");
if (!existsSync(LICENSE)) {
  console.error(`LICENSE が見つかりません: ${LICENSE}`);
  process.exit(1);
}
cpSync(LICENSE, resolve(HERE, "..", "LICENSE"));

// 進み具合は**標準エラー**に出す。`npm pack --json` の標準出力に混ざると、
// 呼び出し側が JSON として読めなくなる（道具から道具を呼ぶときの定番の事故）。
console.error(
  `配る材料を持ち込みました: spec ${files} ファイル（${[...SKIP].join(" / ")} は除く）＋ LICENSE`,
);
