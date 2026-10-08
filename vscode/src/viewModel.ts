// ツリーから開く画面（タブ付き）に渡す中身を作る。
//
// VS Code に依らない純関数（試験から直に呼ぶ）。表は定義の生の形（outline.ts）から、
// 「確認」タブは AI と同じ紙（hatake_check の答え）と読み返し（hatake_explain の文）から作る。
// 道具を呼ぶのは呼ぶ側（extension.ts）＝ここは渡された答えを並べ直すだけ。

import { ACTION_WORDS, optionsText, rolesTable, rulesText, type Outline, type OutlinePage } from "./outline";

type Loose = Record<string, unknown>;

/** 最初に開くタブ（設定 `hatake.view.defaultTab` の値と同じ）。 */
export const TABS = ["screen", "fields", "actions", "roles", "check"] as const;
export type Tab = (typeof TABS)[number];

export interface ItemRow {
  key: string;
  label: string;
  type: string;
  rules: string;
  options: string;
  roles: string;
  path: string;
}

export interface ActionRow {
  key: string;
  label: string;
  what: string;
  confirm: string;
  rules: string;
  roles: string;
  path: string;
}

export interface Note {
  rule: string;
  text: string;
  more: string;
  path?: string;
}

export interface ViewTables {
  filters: ItemRow[];
  columns: ItemRow[];
  fields: ItemRow[];
  cards: ItemRow[];
  actions: ActionRow[];
  roles: { roles: string[]; rows: { label: string; where: string; cells: boolean[] }[] };
  check: { readback: string; facts: Note[]; preferences: Note[]; questions: Note[] };
}

/** 紙の字は Markdown の太字（`**…**`）を含むことがある。ここは素の字で出すので印を外す。 */
const plain = (text: string): string => text.replace(/\*\*/g, "");

const rolesWord = (one: Loose): string => (Array.isArray(one.roles) && one.roles.length > 0 ? (one.roles as unknown[]).join("・") : "誰でも");

function itemRows(page: OutlinePage, kind: string, outline: Outline): ItemRow[] {
  const group = page.groups.find((one) => one.kind === kind);
  return (group?.items ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    type: typeof item.raw.type === "string" ? item.raw.type : kind === "column" ? "text" : "",
    rules: rulesText(item.raw).join("・"),
    options: optionsText(item.raw, outline.vocabularies) ?? "",
    roles: rolesWord(item.raw),
    path: item.path,
  }));
}

function actionRows(page: OutlinePage): ActionRow[] {
  const group = page.groups.find((one) => one.kind === "action");
  return (group?.items ?? []).map((item) => {
    const type = typeof item.raw.type === "string" ? item.raw.type : "";
    const confirm = item.raw.confirm as Loose | undefined;
    return {
      key: item.key,
      label: item.label,
      what: ACTION_WORDS[type] ?? type,
      // 削除は確認を書いていなくても必ず聞く（枠組みの決めごと）。
      confirm:
        typeof confirm?.message === "string" ? `聞く: ${confirm.message}` : type === "delete" ? "聞く（削除は必ず）" : "聞かない",
      rules: rulesText(item.raw).join("・"),
      roles: rolesWord(item.raw),
      path: item.path,
    };
  });
}

interface Sheet {
  facts?: { warnings?: { rule: string; path?: string; message: string; fix?: string }[] };
  preferences?: { advice?: { rule: string; where?: string; says: string; add?: string }[] };
  questions?: { list?: { kind: { id: string; ask: string; why?: string } }[] };
}

/** タブの中身。`sheet` は hatake_check（その画面に絞ったもの）、`readback` は hatake_explain の文。 */
export function viewTables(outline: Outline, page: OutlinePage, allRoles: string[], sheet: Sheet, readback: string): ViewTables {
  return {
    filters: itemRows(page, "filter", outline),
    columns: itemRows(page, "column", outline),
    fields: itemRows(page, "field", outline),
    cards: itemRows(page, "card", outline),
    actions: actionRows(page),
    roles: { roles: allRoles, rows: rolesTable(page, allRoles) },
    check: {
      readback,
      facts: (sheet.facts?.warnings ?? []).map((one) => ({ rule: one.rule, text: plain(one.message), more: plain(one.fix ?? ""), path: one.path })),
      preferences: (sheet.preferences?.advice ?? []).map((one) => ({ rule: one.rule, text: plain(one.says), more: plain(one.add ?? ""), path: one.where })),
      questions: (sheet.questions?.list ?? []).map((one) => ({ rule: one.kind.id, text: plain(one.kind.ask), more: plain(one.kind.why ?? "") })),
    },
  };
}

/** ツリーで選んだ所 → 開くタブと、光らせる行。 */
export function tabFor(kind: string | undefined, fallback: Tab): Tab {
  switch (kind) {
    case "filter":
    case "column":
    case "field":
    case "card":
      return "fields";
    case "action":
      return "actions";
    case "question":
      return "check";
    default:
      return fallback;
  }
}

/** 設定の値を確かめる（知らない値なら画面）。 */
export const asTab = (value: unknown): Tab => (TABS as readonly unknown[]).includes(value) ? (value as Tab) : "screen";
