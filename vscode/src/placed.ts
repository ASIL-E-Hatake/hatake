// 定義の横に置いた行（`preview/<Repository 名>.json`）を読む。在るものだけ。
// YAML の横のプレビューと、ツリーから開く画面の「画面」タブが同じものを使う。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Placed = Record<string, { rows: Record<string, unknown>[]; from: string }>;

export function placedRows(file: string, names: string[]): Placed {
  const out: Placed = {};
  for (const name of names) {
    const path = join(dirname(file), "preview", `${name}.json`);
    if (!existsSync(path)) continue;
    const rows = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (Array.isArray(rows)) out[name] = { rows: rows as Record<string, unknown>[], from: `preview/${name}.json` };
  }
  return out;
}
