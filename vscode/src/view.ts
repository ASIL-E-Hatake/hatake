// ツリーから開く画面（エディタ領域のタブ付きのパネル）。VS Code 側。
//
// パネルは1枚を使い回す（ツリーで選ぶたびに中身を入れ替える）。最初に開くタブは設定
// `hatake.view.defaultTab`（既定は「画面」）。ツリーで項目や操作を選んだときは、その表のタブを
// 開いて行を光らせる。中身は全部、今ある道具の答え（check・explain・previewModel）から作る。

import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

import { rangeOf } from "./diagnostics";
import { placedRows } from "./placed";
import { viewHtml } from "./preview/html";
import { previewModel, type PreviewModel } from "./previewData";
import type { Project } from "./project";
import type { Target } from "./tree";
import { asTab, tabFor, viewTables } from "./viewModel";

type Call = (name: string, args: Record<string, unknown>) => string;

export class ViewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private ready = false;
  private last: Target | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly project: Project,
    private readonly call: Call,
  ) {}

  /** ツリーで選んだ所を開く。 */
  async show(target: Target): Promise<void> {
    this.last = target;
    if (this.panel === undefined) this.create();
    this.panel?.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Active, false);
    if (this.ready) await this.post(target);
  }

  /** 定義が変わったら、開いている画面を描き直す（タブと光らせる所はそのまま）。 */
  async refresh(): Promise<void> {
    if (this.panel !== undefined && this.ready && this.last !== undefined) await this.post(this.last);
  }

  private create(): void {
    const dist = vscode.Uri.joinPath(this.context.extensionUri, "dist");
    const panel = vscode.window.createWebviewPanel("hatake.view", "hatake", vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [dist],
      retainContextWhenHidden: true,
    });
    // 受け取り口を先に作る（器が先に読み込まれて「準備できた」を取りこぼさないように）。
    panel.webview.onDidReceiveMessage(async (message: { type?: string; path?: string }) => {
      if (message.type === "ready") {
        this.ready = true;
        if (this.last !== undefined) await this.post(this.last);
      }
      if (message.type === "open" && typeof message.path === "string" && this.last !== undefined) {
        await this.reveal(this.last.uri, message.path);
      }
    });
    panel.webview.html = viewHtml({
      script: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, "view.js")).toString(),
      style: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, "view.css")).toString(),
      cspSource: panel.webview.cspSource,
      nonce: randomBytes(16).toString("hex"),
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.ready = false;
    });
    this.panel = panel;
  }

  /** 定義のその場所を開く（エディタの横に）。 */
  private async reveal(uri: string, path: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
    const [from, to] = rangeOf(document.getText(), path);
    const range = new vscode.Range(document.positionAt(from), document.positionAt(to));
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, selection: range });
  }

  private async post(target: Target): Promise<void> {
    const def = this.project.find(target.uri);
    const outline = def?.outline;
    if (def === undefined || outline === undefined || this.panel === undefined) return;
    // app の根を選んだときは、画面は app ぜんぶ（メニューつき）、表は最初の画面。
    const page = outline.pages.find((one) => one.id === target.page) ?? outline.pages[0];
    if (page === undefined) return;
    const isApp = outline.kind === "app";
    const whole = isApp && target.page === undefined;

    let screen: PreviewModel = { kind: outline.kind, repositories: {}, roles: [] };
    try {
      const names = (JSON.parse(this.call("hatake_refs", { source: def.source })) as { all?: { repositories?: string[] } }).all?.repositories ?? [];
      screen = previewModel(def.source, names, placedRows(def.uri.fsPath, names));
    } catch {
      // 読めない定義は、描く側が理由を出す。
    }
    let readback = "";
    try {
      readback = this.call("hatake_explain", isApp ? { source: def.source, page: page.id } : { source: def.source });
    } catch (error) {
      readback = `読み返せませんでした: ${error instanceof Error ? error.message : String(error)}`;
    }
    const fallback = asTab(vscode.workspace.getConfiguration("hatake").get("view.defaultTab"));
    this.panel.title = whole ? outline.title : page.title;
    await this.panel.webview.postMessage({
      type: "show",
      file: def.relative,
      title: whole ? outline.title : page.title,
      subtitle: whole
        ? `${def.relative} ・ app（画面 ${outline.pages.length} 枚。表は「${page.title}」）`
        : `${def.relative} ・ ${page.type}${isApp ? `（${outline.title} の画面）` : ""}`,
      path: whole ? "app" : page.path,
      source: def.source,
      screen,
      ...(whole || !isApp ? {} : { page: page.id }),
      tab: tabFor(target.kind, fallback),
      ...(target.key === undefined || target.kind === undefined ? {} : { highlight: { kind: target.kind, key: target.key } }),
      tables: viewTables(outline, page, screen.roles, def.sheets.get(page.id) ?? {}, readback, def.project),
    });
  }
}
