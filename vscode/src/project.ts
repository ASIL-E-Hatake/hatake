// 作業場の hatake の定義を集めて、ツリーと画面が使う形にためておく。
//
// 定義かどうかは中身で決める（先頭の階層に page: か app:）。ファイル名では決めない。
// 画面ごとの AI と同じ紙（hatake_check）もここで1回だけ作る（ツリーの印と「確認」タブが
// 同じ答えを使う＝言うことが食い違わない）。前書きは定義の隣のもの（sheets.ts）。

import * as vscode from "vscode";

import { outlineOf, type Outline } from "./outline";
import { projectNear, sheetsOf, type Sheet } from "./sheets";

export type { Sheet } from "./sheets";

export interface Definition {
  uri: vscode.Uri;
  /** 作業場からの道（ツリーに出す）。 */
  relative: string;
  source: string;
  outline?: Outline;
  /** 読めなかった理由。 */
  error?: string;
  /** 画面 id → その画面に絞った紙。 */
  sheets: Map<string, Sheet>;
  /** 隣の前書き（作業場からの道）。無ければ undefined。 */
  project?: string;
}

export const isDefinitionText = (text: string): boolean => /^(page|app)\s*:/m.test(text);

export class Project {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  definitions: Definition[] = [];

  constructor(private readonly call: (name: string, args: Record<string, unknown>) => string) {}

  /** 作業場をもう一度読む（YAML を保存・作成・削除したとき）。 */
  async refresh(): Promise<void> {
    const found = await vscode.workspace.findFiles("**/*.{yaml,yml}", "**/{node_modules,dist,build,.dart_tool,.git}/**", 500);
    const out: Definition[] = [];
    for (const uri of found.sort((a, b) => a.fsPath.localeCompare(b.fsPath))) {
      const source = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      if (!isDefinitionText(source)) continue;
      out.push(this.load(uri, source));
    }
    this.definitions = out;
    this.changed.fire();
  }

  private load(uri: vscode.Uri, source: string): Definition {
    const one: Definition = { uri, relative: vscode.workspace.asRelativePath(uri), source, sheets: new Map() };
    try {
      one.outline = outlineOf(source);
    } catch (error) {
      one.error = error instanceof Error ? error.message : String(error);
      return one;
    }
    let project: string | undefined;
    try {
      const near = projectNear(uri.fsPath);
      if (near !== undefined) {
        one.project = vscode.workspace.asRelativePath(near.path);
        project = near.source;
      }
    } catch {
      // 読めない前書きは渡さない（紙のほうで「前書きなし」と分かる）。
    }
    one.sheets = sheetsOf(this.call, one.outline, source, project);
    const broken = [...one.sheets.values()].find((sheet) => sheet.ok === false && sheet.message !== undefined);
    if (broken !== undefined) one.error = broken.message;
    return one;
  }

  find(uri: string): Definition | undefined {
    return this.definitions.find((one) => one.uri.toString() === uri);
  }
}

/** 紙の数（ツリーの印）。 */
export function counts(sheet: Sheet | undefined): { facts: number; questions: number; preferences: number } {
  return {
    facts: sheet?.facts?.warnings?.length ?? 0,
    questions: sheet?.questions?.list?.length ?? 0,
    preferences: sheet?.preferences?.advice?.length ?? 0,
  };
}
