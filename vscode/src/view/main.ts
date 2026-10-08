// ツリーから開く画面（タブ付き。Webview の中で動く側）。
//
//   画面 … 動く画面（YAML の横のプレビューと同じ部品＝render.ts）
//   項目 … 入力欄・一覧の列・検索条件・カードを表で（ラベル・種類・決めごと・選択肢・見える人）
//   操作 … ボタンごとに、何をする・確認・押せる条件・押せる人
//   権限 … 役割ごとに、見える・押せるの表
//   確認 … AI と同じ紙（読み返し・事実・好み・人が決めること）
//
// 拡張機能（view.ts）から `show` を受け取って描く。ツリーで選んだ所は `highlight` で光らせる。
// 字は全部 textContent で入れる（定義の字をそのまま HTML にしない）。
// 拡張機能の外（試験の puppeteer）でも同じ口で動く: window に `show` を postMessage すれば描く。

import { mountScreen, type ScreenModel } from "../preview/render";
import type { ActionRow, ItemRow, Note, Tab, ViewTables } from "../viewModel";

import "../preview/preview.css";
import "./view.css";

interface ShowMessage {
  type: "show";
  file: string;
  title: string;
  subtitle: string;
  /** その画面の定義の場所（「定義を開く」で飛ぶ所）。 */
  path: string;
  source: string;
  screen: ScreenModel;
  page?: string;
  tab: Tab;
  highlight?: { kind: string; key: string };
  tables: ViewTables;
}

declare function acquireVsCodeApi(): { postMessage(message: unknown): void; getState(): unknown; setState(state: unknown): void };
const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;

let unmount: () => void = () => undefined;
let last: ShowMessage | undefined;
let role = (vscode?.getState() as { role?: string } | undefined)?.role ?? "";

const byId = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`#${id} がありません`);
  return found;
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] => {
  const one = document.createElement(tag);
  if (text !== undefined) one.textContent = text;
  if (cls !== undefined) one.className = cls;
  return one;
};
const open = (path: string) => vscode?.postMessage({ type: "open", path });

/** 定義のその行へ飛ぶ小さなボタン。 */
function jump(path: string | undefined): HTMLElement {
  const cell = el("td", undefined, "hatake-view-jump");
  if (path === undefined) return cell;
  const button = el("button", "↗");
  button.type = "button";
  button.title = "定義のこの行を開く";
  button.addEventListener("click", () => open(path));
  cell.append(button);
  return cell;
}

function table(title: string, kind: string, heads: string[], rows: { key: string; cells: string[]; path?: string }[]): HTMLElement {
  const box = el("div", undefined, "hatake-view-block");
  box.append(el("h2", `${title}（${rows.length}）`));
  if (rows.length === 0) return box;
  const grid = el("table", undefined, "hatake-view-table");
  const head = el("tr");
  for (const one of [...heads, ""]) head.append(el("th", one));
  grid.append(head);
  for (const row of rows) {
    const line = el("tr");
    line.setAttribute("data-hatake", `view-row:${kind}:${row.key}`);
    for (const cell of row.cells) line.append(el("td", cell));
    line.append(jump(row.path));
    grid.append(line);
  }
  box.append(grid);
  return box;
}

const itemCells = (one: ItemRow) => [one.label, one.key, one.type, one.rules || "—", one.options || "—", one.roles];
const ITEM_HEADS = ["名前", "項目", "種類", "決めごと", "選択肢", "見える人"];

function fieldsPane(tables: ViewTables): void {
  const pane = byId("pane-fields");
  pane.replaceChildren();
  const groups: [string, string, ItemRow[]][] = [
    ["入力欄", "field", tables.fields],
    ["一覧の列", "column", tables.columns],
    ["検索条件", "filter", tables.filters],
    ["カード", "card", tables.cards],
  ];
  for (const [title, kind, rows] of groups) {
    if (rows.length === 0) continue;
    pane.append(table(title, kind, ITEM_HEADS, rows.map((one) => ({ key: one.key, cells: itemCells(one), path: one.path }))));
  }
  if (pane.childElementCount === 0) pane.append(el("p", "この画面には項目がありません。", "hatake-view-empty"));
}

function actionsPane(rows: ActionRow[]): void {
  const pane = byId("pane-actions");
  pane.replaceChildren(
    table(
      "操作",
      "action",
      ["名前", "id", "何をする", "確認", "決めごと", "押せる人"],
      rows.map((one) => ({ key: one.key, cells: [one.label, one.key, one.what, one.confirm, one.rules || "—", one.roles], path: one.path })),
    ),
  );
  if (rows.length === 0) pane.append(el("p", "この画面にはボタンがありません。", "hatake-view-empty"));
}

function rolesPane(tables: ViewTables): void {
  const pane = byId("pane-roles");
  pane.replaceChildren();
  const { roles, rows } = tables.roles;
  if (roles.length === 0 || rows.length === 0) {
    pane.append(el("p", "役割による出し分けはありません（誰にでも同じものが見えます）。", "hatake-view-empty"));
    return;
  }
  const box = el("div", undefined, "hatake-view-block");
  box.append(el("h2", "役割ごとに見える・押せる"));
  const grid = el("table", undefined, "hatake-view-table hatake-view-matrix");
  const head = el("tr");
  for (const one of ["どこ", "名前", ...roles]) head.append(el("th", one));
  grid.append(head);
  for (const row of rows) {
    const line = el("tr");
    line.append(el("td", row.where), el("td", row.label));
    for (const ok of row.cells) line.append(el("td", ok ? "○" : "－", ok ? "hatake-view-yes" : "hatake-view-no"));
    grid.append(line);
  }
  box.append(grid, el("p", "見え方の確認だけです。本当の遮断はサーバの仕事です。", "hatake-view-note"));
  pane.append(box);
}

function notes(title: string, kind: string, mark: string, list: Note[], moreTitle: string): HTMLElement {
  const box = el("div", undefined, `hatake-view-block hatake-view-notes hatake-view-${kind}`);
  box.append(el("h2", `${mark} ${title}（${list.length}）`));
  if (list.length === 0) box.append(el("p", "ありません。", "hatake-view-empty"));
  for (const one of list) {
    const card = el("div", undefined, "hatake-view-note-card");
    card.setAttribute("data-hatake", `view-note:${kind}:${one.rule}`);
    card.append(el("div", one.text, "hatake-view-note-text"));
    if (one.more !== "") card.append(el("div", `${moreTitle}: ${one.more}`, "hatake-view-note-more"));
    const foot = el("div", undefined, "hatake-view-note-foot");
    foot.append(el("code", one.rule));
    if (one.path !== undefined) {
      const button = el("button", "定義のこの場所へ ↗");
      button.type = "button";
      button.addEventListener("click", () => open(one.path as string));
      foot.append(button);
    }
    card.append(foot);
    box.append(card);
  }
  return box;
}

function checkPane(tables: ViewTables): void {
  const pane = byId("pane-check");
  const read = el("div", undefined, "hatake-view-block");
  read.append(el("h2", "読み返し（この定義はこういう画面です）"), el("pre", tables.check.readback, "hatake-view-readback"));
  // どの前書きで見た紙か（答えた問いが出ないのは、ここに答えが書いてあるから）。
  const { file, answered } = tables.check.project;
  const project = el(
    "p",
    file === null
      ? "前書き（hatake.project.yaml）が定義の隣にありません。前書きで答える問いも、全部ここに出ます。"
      : `前書き: ${file}（答え済みの問い ${answered} 件はここに出しません）`,
    "hatake-view-note hatake-view-project",
  );
  project.setAttribute("data-hatake", "view-project");
  pane.replaceChildren(
    project,
    notes("事実（書いたのに効かない）", "fact", "⚠", tables.check.facts, "直し方"),
    notes("人が決めること（定義に書けない）", "question", "？", tables.check.questions, "なぜ"),
    notes("好み（書いていないと不便かも）", "preference", "ⓘ", tables.check.preferences, "足すなら"),
    read,
  );
}

const TAB_TITLES: Record<Tab, string> = { screen: "画面", fields: "項目", actions: "操作", roles: "権限", check: "確認" };

function tabs(message: ShowMessage, active: Tab): void {
  const t = message.tables;
  const count: Record<Tab, string> = {
    screen: "",
    fields: ` ${t.fields.length + t.columns.length + t.filters.length + t.cards.length}`,
    actions: ` ${t.actions.length}`,
    roles: "",
    check: ` ⚠${t.check.facts.length} ？${t.check.questions.length} ⓘ${t.check.preferences.length}`,
  };
  const bar = byId("tabs");
  bar.replaceChildren(
    ...(Object.keys(TAB_TITLES) as Tab[]).map((tab) => {
      const button = el("button", `${TAB_TITLES[tab]}${count[tab]}`, tab === active ? "is-active" : "");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("data-hatake", `view-tab:${tab}`);
      button.addEventListener("click", () => select(tab));
      return button;
    }),
  );
}

let current: Tab = "screen";
function select(tab: Tab): void {
  current = tab;
  for (const one of Object.keys(TAB_TITLES) as Tab[]) byId(`pane-${one}`).hidden = one !== tab;
  for (const button of byId("tabs").querySelectorAll("button")) {
    button.classList.toggle("is-active", button.getAttribute("data-hatake") === `view-tab:${tab}`);
  }
}

function screen(message: ShowMessage): void {
  const froms = [...new Set(Object.values(message.screen.repositories).map((one) => one.from))];
  byId("data").textContent = froms.length === 0 ? "データ: なし" : `データ: ${froms.join("・")}`;
  const select = byId("role") as HTMLSelectElement;
  if (role !== "" && !message.screen.roles.includes(role)) role = "";
  select.replaceChildren(new Option("役割: 指定なし", ""), ...message.screen.roles.map((one) => new Option(`役割: ${one}`, one)));
  select.value = role;
  byId("roles").hidden = message.screen.roles.length === 0;
  unmount();
  unmount = mountScreen(byId("app"), { source: message.source, model: message.screen, role, page: message.page });
}

/** ツリーで選んだ所を光らせる（表の行と、画面の中の同じ印）。 */
function highlight(target: ShowMessage["highlight"]): void {
  for (const old of document.querySelectorAll(".hatake-view-hit")) old.classList.remove("hatake-view-hit");
  if (target === undefined) return;
  const prefix = target.kind === "question" ? "view-note:question" : `view-row:${target.kind}`;
  const row = document.querySelector(`[data-hatake="${prefix}:${CSS.escape(target.key)}"]`);
  row?.classList.add("hatake-view-hit");
  if (row !== null && current !== "screen") row.scrollIntoView({ block: "center" });
  // 画面の中の同じ印（入力欄・列・ボタン・検索条件）。描き終わってから探す。
  setTimeout(() => {
    const mark = { field: "field", column: "column", action: "action", filter: "filter" }[target.kind];
    if (mark === undefined) return;
    document.querySelector(`#app [data-hatake="${mark}:${CSS.escape(target.key)}"]`)?.classList.add("hatake-view-hit");
  }, 400);
}

function show(message: ShowMessage): void {
  last = message;
  byId("title").textContent = message.title;
  byId("subtitle").textContent = message.subtitle;
  tabs(message, message.tab);
  screen(message);
  fieldsPane(message.tables);
  actionsPane(message.tables.actions);
  rolesPane(message.tables);
  checkPane(message.tables);
  select(message.tab);
  highlight(message.highlight);
}

byId("open").addEventListener("click", () => {
  if (last !== undefined) open(last.path);
});
byId("role").addEventListener("change", (event) => {
  role = (event.target as HTMLSelectElement).value;
  vscode?.setState({ role });
  if (last !== undefined) screen(last);
});
window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as ShowMessage | undefined;
  if (data?.type === "show") show(data);
});

vscode?.postMessage({ type: "ready" });
