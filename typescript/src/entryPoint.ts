// 「このファイルが直に起動されたか」（bin の入口だけで走らせるための判定）。
//
// 0.9.25 までは `process.argv[1]?.endsWith("cli.js")` で見ていた。ところが npm は bin を
// **`hatake` という名前のリンク**（`node_modules/.bin/hatake` → `dist/cli.js`）から
// 起動するので、`argv[1]` は `…/.bin/hatake` で `cli.js` で終わらない。結果、
// `npx -p @hatake-fw/api hatake validate page.yaml` も、`npm i -g` した `hatake` も、**何も出さずに
// 終了コード 0** で終わっていた（`node dist/cli.js …` と直に叩けば動くので、見本も CI も
// そちらで叩いていて気づかなかった）。
//
// 名前ではなく**実体のパス**（リンクを辿った先）で比べる。Windows の npm は `.cmd` から
// 実体のパスで node を呼ぶので、どちらでも同じ答えになる。

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** [moduleUrl]（呼ぶ側の `import.meta.url`）が、いま起動されたファイルそのものか。 */
export function isEntryPoint(moduleUrl: string, invoked: string | undefined = process.argv[1]): boolean {
  if (invoked === undefined || invoked === "") return false;
  try {
    return realpathSync(invoked) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
