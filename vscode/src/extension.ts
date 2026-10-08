// hatake の VS Code 拡張機能。
//
// **AI が書いた定義を、人が見て判断するための道具**（人が手で書くための道具ではない）。
// 0.9.31 は「見る」だけ（書き換えはしない）:
//   ・左のツリー（hatake の欄）… 定義を業務の言葉で並べる。選ぶとエディタ領域にタブ付きで開く
//   ・YAML の横のプレビュー・AI と同じ紙（check）を問題の一覧に・キーの説明・読み返し
//   ・スキーマの紐付けとスニペット（package.json の contributes）
//
// 道具は拡張機能の中で直に呼ぶ（`@hatake-fw/api/tools`＝MCP と同じ道具の束）。AI が MCP で
// 見ている答えと、人がここで見る答えは同じになる。CLI も npx も使わない。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { hatakeTools, type McpTool } from "@hatake-fw/api/tools";

import { placeProblems, type Severity } from "./diagnostics";
import { hoverMarkdown, wordAt } from "./hover";
import { placedRows } from "./placed";
import { previewHtml } from "./preview/html";
import { previewModel, type PreviewModel } from "./previewData";
import { Project } from "./project";
import { checkArgs, projectNear } from "./sheets";
import { versionStatus } from "./status";
import { DefinitionTree, QuestionTree, type Target } from "./tree";
import { ViewPanel } from "./view";

let tools: McpTool[] = [];
/** 開いているプレビュー（定義ファイルの URI → パネル）。 */
const previews = new Map<string, vscode.WebviewPanel>();

export function activate(context: vscode.ExtensionContext): void {
  // spec は同梱したものを使う（固めると枠組みが自分の置き場所を探せないので、明示して渡す）。
  tools = hatakeTools({
    specDir: join(context.extensionPath, "dist", "spec"),
    readFile: (path) => readFileSync(path, "utf8"),
    listDir: (path) =>
      existsSync(path) && statSync(path).isDirectory()
        ? readdirSync(path, { withFileTypes: true }).map((one) => ({ name: one.name, dir: one.isDirectory() }))
        : null,
  });

  const project = new Project(callTool);
  const view = new ViewPanel(context, project, callTool);
  const reload = async () => {
    await project.refresh();
    await view.refresh();
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{yaml,yml}");

  const problems = vscode.languages.createDiagnosticCollection("hatake");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "hatake.openPreview";
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const later = (document: vscode.TextDocument) => {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => check(document, problems), 600));
  };

  context.subscriptions.push(
    problems,
    status,
    watcher,
    vscode.window.registerTreeDataProvider("hatake.definitions", new DefinitionTree(project)),
    vscode.window.registerTreeDataProvider("hatake.questions", new QuestionTree(project)),
    vscode.commands.registerCommand("hatake.showView", (target: Target) => view.show(target)),
    vscode.commands.registerCommand("hatake.refresh", () => reload()),
    watcher.onDidCreate(() => reload()),
    watcher.onDidDelete(() => reload()),
    vscode.commands.registerCommand("hatake.openPreview", () => openPreview(context)),
    vscode.commands.registerCommand("hatake.openReadback", () => openReadback()),
    vscode.workspace.onDidOpenTextDocument((document) => check(document, problems)),
    vscode.workspace.onDidChangeTextDocument((event) => later(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => problems.delete(document.uri)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      check(document, problems);
      const panel = previews.get(document.uri.toString());
      if (panel !== undefined) void post(panel, document);
      if (/(hatake\.version|package\.json|pubspec\.yaml|build\.gradle)$/.test(document.fileName)) showVersion(status);
      if (document.languageId === "yaml") void reload();
    }),
    vscode.languages.registerHoverProvider({ language: "yaml" }, { provideHover: hover }),
    vscode.workspace.registerTextDocumentContentProvider(READBACK, readbackProvider),
  );
  for (const document of vscode.workspace.textDocuments) check(document, problems);
  showVersion(status);
  void project.refresh();
}

/** hatake の定義か（先頭の階層に page: か app:）。ほかの YAML には手を出さない。 */
const isDefinition = (document: vscode.TextDocument): boolean =>
  document.languageId === "yaml" && /^(page|app)\s*:/m.test(document.getText());

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  fact: vscode.DiagnosticSeverity.Warning,
  preference: vscode.DiagnosticSeverity.Information,
  // ヒントにすると問題の一覧に載らない（エディタの点線だけ）。人に一番見てほしい欄なので
  // 情報の重さで載せ、文の頭の「人が決めること:」で見分ける。
  question: vscode.DiagnosticSeverity.Information,
};

/**
 * AI と同じ紙（hatake_check）を回して、問題の一覧に出す。読めない定義は1件の誤りにする。
 * 定義の隣に前書きがあれば渡す（ツリーと同じ紙＝答えた問いは出ない）。
 */
function check(document: vscode.TextDocument, problems: vscode.DiagnosticCollection): void {
  if (!isDefinition(document)) return;
  const source = document.getText();
  let sheet: { ok?: boolean; message?: string; hints?: string[] } & Record<string, unknown>;
  try {
    const project = document.uri.scheme === "file" ? projectNear(document.uri.fsPath)?.source : undefined;
    sheet = JSON.parse(callTool("hatake_check", checkArgs(source, { project })));
  } catch (error) {
    sheet = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  if (sheet.ok === false) {
    const one = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), `定義を読めません: ${sheet.message ?? ""}`, vscode.DiagnosticSeverity.Error);
    one.source = "hatake";
    problems.set(document.uri, [one]);
    return;
  }
  problems.set(
    document.uri,
    placeProblems(source, sheet as Parameters<typeof placeProblems>[1]).map((p) => {
      const one = new vscode.Diagnostic(
        new vscode.Range(p.start.line, p.start.character, p.end.line, p.end.character),
        p.message,
        SEVERITY[p.severity],
      );
      one.source = "hatake";
      one.code = p.rule;
      return one;
    }),
  );
}

/** カーソルの下のキー（か値）を reference で引く。 */
function hover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
  if (!isDefinition(document)) return undefined;
  const word = wordAt(document.getText(), document.offsetAt(position));
  if (word === undefined) return undefined;
  try {
    const text = hoverMarkdown(JSON.parse(callTool("hatake_reference", { name: word })));
    return text === "" ? undefined : new vscode.Hover(new vscode.MarkdownString(text));
  } catch {
    return undefined; // 引けない字（業務の値など）は黙る＝説明しないのが正しい
  }
}

/** 読み返し（hatake_explain＝AI が MCP で読むのと同じ文）を横に開く。 */
async function openReadback(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined || !isDefinition(editor.document)) {
    void vscode.window.showInformationMessage("hatake の定義（page: か app: で始まる YAML）を開いてから呼んでください。");
    return;
  }
  let text: string;
  try {
    text = callTool("hatake_explain", { source: editor.document.getText() });
  } catch (error) {
    text = `読み返せませんでした: ${error instanceof Error ? error.message : String(error)}`;
  }
  // **読むだけの文書**として開く（保存していない新しいファイルにすると、閉じるたびに
  // 「保存しますか」と聞かれ、タブに残り続ける＝手引きの画像を撮って気づいた）。
  const uri = vscode.Uri.from({ scheme: READBACK, path: `/${basename(editor.document.fileName)} の読み返し.md` });
  readbacks.set(uri.toString(), text);
  readbackChanged.fire(uri);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(document, "markdown");
  await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, preview: true });
}

/** 読み返しの文書（読むだけ）。URI → 本文。 */
const READBACK = "hatake-readback";
const readbacks = new Map<string, string>();
const readbackChanged = new vscode.EventEmitter<vscode.Uri>();
export const readbackProvider: vscode.TextDocumentContentProvider = {
  onDidChange: readbackChanged.event,
  provideTextDocumentContent: (uri) => readbacks.get(uri.toString()) ?? "",
};

/** 状態バーの版（物差しは doctor の1つ）。 */
function showVersion(status: vscode.StatusBarItem): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (root === undefined) return;
  try {
    const shown = versionStatus(JSON.parse(callTool("hatake_doctor", { root })));
    status.text = `$(${shown.differs ? "warning" : "check"}) ${shown.text}`;
    status.tooltip = shown.tooltip;
    status.backgroundColor = shown.differs ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    status.show();
  } catch {
    status.hide();
  }
}

export function deactivate(): void {}

/** 道具を1つ呼ぶ（MCP と同じ道具・同じ答え）。 */
export function callTool(name: string, args: Record<string, unknown>): string {
  const tool = tools.find((one) => one.name === name);
  if (tool === undefined) throw new Error(`道具 ${name} がありません。`);
  return tool.run(args);
}

function openPreview(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined || editor.document.languageId !== "yaml") {
    void vscode.window.showInformationMessage("hatake の定義（YAML）を開いてから呼んでください。");
    return;
  }
  const document = editor.document;
  const key = document.uri.toString();
  const opened = previews.get(key);
  if (opened !== undefined) {
    opened.reveal(vscode.ViewColumn.Beside);
    return;
  }
  const dist = vscode.Uri.joinPath(context.extensionUri, "dist");
  const panel = vscode.window.createWebviewPanel(
    "hatake.preview",
    `プレビュー: ${basename(document.fileName)}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, localResourceRoots: [dist], retainContextWhenHidden: true },
  );
  // 受け取り口を先に作る（器が先に読み込まれて「準備できた」を取りこぼさないように）。
  panel.webview.onDidReceiveMessage((message: { type?: string }) => {
    if (message.type === "ready") void post(panel, document);
  });
  panel.webview.html = previewHtml({
    script: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, "preview.js")).toString(),
    style: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, "preview.css")).toString(),
    cspSource: panel.webview.cspSource,
    nonce: randomBytes(16).toString("hex"),
  });
  previews.set(key, panel);
  panel.onDidDispose(() => previews.delete(key));
}

async function post(panel: vscode.WebviewPanel, document: vscode.TextDocument): Promise<void> {
  const source = document.getText();
  let model: PreviewModel = { kind: /^\s*app\s*:/m.test(source) ? "app" : "page", repositories: {}, roles: [] };
  try {
    const refs = JSON.parse(callTool("hatake_refs", { source })) as { all?: { repositories?: string[] } };
    const names = refs.all?.repositories ?? [];
    model = previewModel(source, names, placedRows(document.fileName, names));
  } catch {
    // 読めない定義は、描く側が理由を出す（ここで黙って止めない）。
  }
  await panel.webview.postMessage({ type: "render", file: basename(document.fileName), source, model });
}
