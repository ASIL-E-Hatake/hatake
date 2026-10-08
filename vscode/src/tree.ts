// 左のツリー（hatake の欄）。定義を業務の言葉で並べる。
//
//   定義           … ファイルごと → （app なら）メニュー・画面 → 画面の中（検索条件・一覧の列・入力欄・操作…）
//   人が決めること … 全部の定義から集めた問い（人がまず目を通す所）
//
// 選ぶと、エディタ領域にその画面をタブ付きで開く（view.ts）。

import * as vscode from "vscode";

import type { OutlineItem, OutlineMenu, OutlinePage } from "./outline";
import { counts, type Definition, type Project } from "./project";

/** 開くときに渡すもの（どのファイルの・どの画面の・どこを）。 */
export interface Target {
  uri: string;
  page?: string;
  kind?: string;
  key?: string;
}

type Node =
  | { type: "file"; def: Definition }
  | { type: "folder"; def: Definition; label: string; icon: string; children: Node[] }
  | { type: "menu"; def: Definition; menu: OutlineMenu }
  | { type: "page"; def: Definition; page: OutlinePage }
  | { type: "group"; def: Definition; page: OutlinePage; group: OutlinePage["groups"][number] }
  | { type: "item"; def: Definition; page: OutlinePage; item: OutlineItem }
  | { type: "question"; def: Definition; page: OutlinePage; rule: string; ask: string }
  | { type: "asks"; def: Definition; page: OutlinePage; children: Node[] };

const PAGE_ICONS: Record<string, string> = {
  crud: "table",
  master: "database",
  search: "search",
  detail: "file",
  form: "edit",
  wizard: "list-ordered",
  dashboard: "graph",
  report: "output",
};
const GROUP_ICONS: Record<string, string> = {
  filter: "filter",
  column: "list-flat",
  field: "symbol-field",
  action: "zap",
  card: "dashboard",
};

const open = (target: Target): vscode.Command => ({ command: "hatake.showView", title: "開く", arguments: [target] });

function badge(def: Definition, page: OutlinePage): string {
  const c = counts(def.sheets.get(page.id));
  const marks = [c.facts > 0 ? `⚠${c.facts}` : "", c.questions > 0 ? `？${c.questions}` : "", c.preferences > 0 ? `ⓘ${c.preferences}` : ""];
  return marks.filter(Boolean).join(" ");
}

export class DefinitionTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly project: Project) {
    project.onDidChange(() => this.changed.fire());
  }

  getChildren(node?: Node): Node[] {
    if (node === undefined) return this.project.definitions.map((def) => ({ type: "file", def }));
    const def = node.def;
    const outline = def.outline;
    switch (node.type) {
      case "file": {
        if (outline === undefined) return [];
        if (outline.kind === "page") return this.pageChildren(def, outline.pages[0]);
        const out: Node[] = [];
        if (outline.menu.length > 0) {
          out.push({ type: "folder", def, label: "メニュー", icon: "menu", children: outline.menu.map((menu) => ({ type: "menu", def, menu })) });
        }
        out.push({ type: "folder", def, label: `画面（${outline.pages.length}）`, icon: "window", children: outline.pages.map((page) => ({ type: "page", def, page })) });
        return out;
      }
      case "folder":
        return node.children;
      case "menu":
        return node.menu.children.map((menu) => ({ type: "menu", def, menu }));
      case "page":
        return this.pageChildren(def, node.page);
      case "group":
        return node.group.items.map((item) => ({ type: "item", def, page: node.page, item }));
      case "asks":
        return node.children;
      default:
        return [];
    }
  }

  private pageChildren(def: Definition, page: OutlinePage): Node[] {
    return page.groups.map((group) => ({ type: "group", def, page, group }));
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const C = vscode.TreeItemCollapsibleState;
    const uri = node.def.uri.toString();
    switch (node.type) {
      case "file": {
        const outline = node.def.outline;
        const item = new vscode.TreeItem(outline?.title ?? node.def.relative, outline === undefined ? C.None : C.Expanded);
        if (outline === undefined) {
          item.description = "読めません";
          item.tooltip = node.def.error;
          item.iconPath = new vscode.ThemeIcon("error");
          item.command = { command: "vscode.open", title: "開く", arguments: [node.def.uri] };
          return item;
        }
        const page = outline.kind === "page" ? outline.pages[0] : undefined;
        item.description = `${node.def.relative}${page ? `  ${badge(node.def, page)}` : ""}`;
        item.iconPath = new vscode.ThemeIcon(outline.kind === "app" ? "window" : (PAGE_ICONS[page?.type ?? ""] ?? "file"));
        item.command = open({ uri, page: page?.id });
        item.contextValue = "hatake.file";
        return item;
      }
      case "folder": {
        const item = new vscode.TreeItem(node.label, C.Expanded);
        item.iconPath = new vscode.ThemeIcon(node.icon);
        return item;
      }
      case "menu": {
        const item = new vscode.TreeItem(node.menu.label, node.menu.children.length > 0 ? C.Expanded : C.None);
        item.iconPath = new vscode.ThemeIcon(node.menu.children.length > 0 ? "folder" : "link");
        if (node.menu.roles.length > 0) item.description = `見える人: ${node.menu.roles.join("・")}`;
        if (node.menu.page !== undefined) item.command = open({ uri, page: node.menu.page });
        return item;
      }
      case "page": {
        const item = new vscode.TreeItem(node.page.title, C.Collapsed);
        item.description = `${node.page.type}  ${badge(node.def, node.page)}`;
        item.iconPath = new vscode.ThemeIcon(PAGE_ICONS[node.page.type] ?? "file");
        item.command = open({ uri, page: node.page.id });
        return item;
      }
      case "group": {
        const item = new vscode.TreeItem(`${node.group.title}（${node.group.items.length}）`, C.Collapsed);
        item.iconPath = new vscode.ThemeIcon(GROUP_ICONS[node.group.kind] ?? "symbol-misc");
        item.command = open({ uri, page: node.page.id, kind: node.group.kind });
        return item;
      }
      case "item": {
        const item = new vscode.TreeItem(node.item.label, C.None);
        item.description = node.item.key === node.item.label ? undefined : node.item.key;
        item.iconPath = new vscode.ThemeIcon(GROUP_ICONS[node.item.kind] ?? "symbol-misc");
        item.command = open({ uri, page: node.page.id, kind: node.item.kind, key: node.item.key });
        return item;
      }
      case "asks": {
        const item = new vscode.TreeItem(`${node.page.title}（${node.children.length}）`, C.Expanded);
        item.description = node.def.relative;
        item.iconPath = new vscode.ThemeIcon(PAGE_ICONS[node.page.type] ?? "file");
        item.command = open({ uri, page: node.page.id, kind: "question" });
        return item;
      }
      case "question": {
        const item = new vscode.TreeItem(node.ask, C.None);
        item.description = node.page.title;
        item.tooltip = `${node.ask}\n（${node.def.relative} の ${node.page.title}・${node.rule}）`;
        item.iconPath = new vscode.ThemeIcon("question");
        item.command = open({ uri, page: node.page.id, kind: "question", key: node.rule });
        return item;
      }
    }
  }
}

/** 人が決めること（全部の定義から集める）。 */
export class QuestionTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  /** 行の描き方は定義のツリーと同じ（1つだけ作って使い回す）。 */
  private readonly items: DefinitionTree;

  constructor(private readonly project: Project) {
    this.items = new DefinitionTree(project);
    project.onDidChange(() => this.changed.fire());
  }

  /** 画面ごとにまとめる（同じ問いが画面ごとに出るので、平たく並べると読めない）。 */
  getChildren(node?: Node): Node[] {
    if (node !== undefined) return node.type === "asks" ? node.children : [];
    const out: Node[] = [];
    for (const def of this.project.definitions) {
      for (const page of def.outline?.pages ?? []) {
        const children: Node[] = (def.sheets.get(page.id)?.questions?.list ?? []).map((one) => ({
          type: "question",
          def,
          page,
          rule: one.kind.id,
          ask: one.kind.ask.replace(/\*\*/g, ""),
        }));
        if (children.length > 0) out.push({ type: "asks", def, page, children });
      }
    }
    return out;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return this.items.getTreeItem(node);
  }
}
