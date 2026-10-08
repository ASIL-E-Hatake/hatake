// 作業場の hatake の定義を集めて、ツリーと画面が使う形にためておく。
//
// 定義かどうかは中身で決める（先頭の階層に page: か app:）。ファイル名では決めない。
// 画面ごとの AI と同じ紙（hatake_check）もここで1回だけ作る（ツリーの印と「確認」タブが
// 同じ答えを使う＝言うことが食い違わない）。

import * as vscode from "vscode";

import { outlineOf, type Outline } from "./outline";

export interface Sheet {
  ok?: boolean;
  facts?: { warnings?: { rule: string; path?: string; message: string; fix?: string }[] };
  preferences?: { advice?: { rule: string; where?: string; says: string; add?: string }[] };
  questions?: { list?: { kind: { id: string; ask: string; why?: string } }[] };
}

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
    for (const page of one.outline.pages) {
      try {
        const args = one.outline.kind === "app" ? { source, page: page.id, explain: false } : { source, explain: false };
        one.sheets.set(page.id, JSON.parse(this.call("hatake_check", args)) as Sheet);
      } catch (error) {
        one.sheets.set(page.id, { ok: false });
        one.error = error instanceof Error ? error.message : String(error);
      }
    }
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
