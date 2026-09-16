// spec/ の在り処。CLI と MCP サーバが同じ探し方をするための1箇所。
//
// 探すのは2つで、**この順**:
//   1. 実行時のカレントから上へ（リポジトリの中で使っているとき＝開発）
//   2. このモジュールの位置から上へ（**配ったとき**。パッケージの根に `spec/` を
//      同梱してあるので、`dist/` の1つ上で当たる）
//
// 2 が効くのは、配るときに [bundle-spec](../tool/bundle-spec.mjs) が `spec/` を
// パッケージへ持ち込んでいるから。**持ち込めているかは口で言わず**、固めて入れて
// 叩くところまで [check-package](../tool/check-package.mjs) が確かめる
// （リポジトリの中で試すと 1 で当たってしまい、同梱できていなくても通る）。
//
// どちらでも見つからないときは、呼び出し側が「--spec で渡して」と言えるように null を返す。

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** spec/ の中で「ここが spec だ」と判断する目印。 */
export const SCHEMA_FILE = "hatake-page.schema.json";

/** 例のカタログ（`spec/examples/index.json`）への相対パス。 */
export const CATALOG_PATH = ["examples", "index.json"];

/** よくある間違いの対照表。 */
export const PITFALLS_FILE = "pitfalls.json";

/** 実際に転んだ実例のカタログ（spec/ からの相対）。 */
export const FAILURES_FILE = "failures.json";

/** 規則ごとの「転ぶ定義」（その規則を実際に出す最小の定義）。 */
export const RULE_CASES_FILE = "rule-cases.json";

/** 担当の割り振り（どこまでを枠組みが持つか）。 */
export const RESPONSIBILITY_FILE = "responsibility.json";

/** 食い違いの印から直し方を引く表（probe / attack の kind）。 */
export const PROBE_KINDS_FILE = "probe-kinds.json";

/** 人が決めないと決まらないことの表（ask の印）。 */
export const QUESTION_KINDS_FILE = "question-kinds.json";

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
