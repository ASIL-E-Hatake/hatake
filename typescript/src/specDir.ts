// spec/ の在り処。CLI と MCP サーバが同じ探し方をするための1箇所。
//
// リポジトリを持っている前提の暫定（npm 配布時は `spec/` を同梱する）。見つからない
// ときは呼び出し側が「--spec で渡して」と言えるように null を返す。

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** spec/ の中で「ここが spec だ」と判断する目印。 */
export const SCHEMA_FILE = "hatake-page.schema.json";

/** 例のカタログ（`spec/examples/index.json`）への相対パス。 */
export const CATALOG_PATH = ["examples", "index.json"];

/** よくある間違いの対照表。 */
export const PITFALLS_FILE = "pitfalls.json";

/**
 * spec/ ディレクトリを返す。[explicit] があればそこだけを見る。
 * 無ければ実行時のカレント → このモジュールの位置、の順に上へ辿る。
 */
export function findSpecDir(explicit?: string): string | null {
  if (explicit !== undefined) {
    return existsSync(join(explicit, SCHEMA_FILE)) ? explicit : null;
  }
  for (const start of [process.cwd(), dirname(fileURLToPath(import.meta.url))]) {
    let dir = resolve(start);
    for (let depth = 0; depth < 6; depth++) {
      const candidate = join(dir, "spec");
      if (existsSync(join(candidate, SCHEMA_FILE))) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}
