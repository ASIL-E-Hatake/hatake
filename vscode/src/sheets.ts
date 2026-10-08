// AI と同じ紙（hatake_check）を作る。VS Code に依らない（試験から同じ関数を呼ぶ）。
//
// 前書き（hatake.project.yaml）は**定義の隣**のものを読む＝CLI の `hatake check` と同じ規則。
// 0.9.31 は前書きを渡していなかったので、前書きで答えた問いがもう一度並び（見本の受注入力で
// 1件のはずが8件）、名前の決めごとの好みも出なかった＝「人が見る答えと AI が見る答えは同じ」が
// 前書きのある案件で崩れていた（見本を 0.9.31 に上げたときに見つけた）。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Outline } from "./outline";

/** 前書きのファイル名（CLI と同じ）。 */
export const PROJECT_FILE = "hatake.project.yaml";

export interface Sheet {
  ok?: boolean;
  message?: string;
  facts?: { warnings?: { rule: string; path?: string; message: string; fix?: string }[] };
  preferences?: { advice?: { rule: string; where?: string; says: string; add?: string }[] };
  /** `answered` は前書きで答えた問いの印（前書きを渡したときだけ）。 */
  questions?: { list?: { kind: { id: string; ask: string; why?: string } }[]; answered?: string[] };
}

/** 定義に添える前書き。 */
export interface ProjectFile {
  /** 置き場（絶対パス）。 */
  path: string;
  source: string;
}

/** 定義の隣の前書きを読む。無ければ undefined（前書きを書いていない定義は普通にある）。 */
export function projectNear(definitionPath: string): ProjectFile | undefined {
  const path = join(dirname(definitionPath), PROJECT_FILE);
  if (!existsSync(path)) return undefined;
  return { path, source: readFileSync(path, "utf8") };
}

/** hatake_check に渡す引数（app なら画面で絞る。前書きがあれば渡す）。 */
export function checkArgs(source: string, options: { page?: string; project?: string; explain?: boolean } = {}): Record<string, unknown> {
  return {
    source,
    ...(options.page === undefined ? {} : { page: options.page }),
    ...(options.project === undefined ? {} : { project: options.project }),
    ...(options.explain === undefined ? {} : { explain: options.explain }),
  };
}

/** 画面ごとの紙（画面 id → 紙）。ツリーの印と「確認」タブが同じものを使う。 */
export function sheetsOf(
  call: (name: string, args: Record<string, unknown>) => string,
  outline: Outline,
  source: string,
  project?: string,
): Map<string, Sheet> {
  const sheets = new Map<string, Sheet>();
  for (const page of outline.pages) {
    const args = checkArgs(source, { page: outline.kind === "app" ? page.id : undefined, project, explain: false });
    try {
      sheets.set(page.id, JSON.parse(call("hatake_check", args)) as Sheet);
    } catch (error) {
      sheets.set(page.id, { ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return sheets;
}
