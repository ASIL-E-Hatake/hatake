// 定義の中身を、人が読む形に並べる（左のツリーと、タブの表の元）。
//
// VS Code に依らない純関数（試験から直に呼ぶ）。読むのは YAML の**生の形**＝書いた順・書いた
// ラベルのまま並び、行ごとに「定義のどこか」（道）を持つ（「定義を開く」でその行に飛ぶ）。
// 意味（何が起きるか）は言い直さない。それは読み返し（explain）と check の仕事。

import { parse } from "yaml";

type Loose = Record<string, unknown>;
const asList = (value: unknown): Loose[] => (Array.isArray(value) ? (value as Loose[]) : []);
const asDict = (value: unknown): Loose => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Loose) : {});
const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const rolesOfItem = (one: Loose): string[] => (Array.isArray(one.roles) ? (one.roles as unknown[]).map(String) : []);

/** 画面の中の1つ（検索条件・列・入力欄・操作・カード）。 */
export interface OutlineItem {
  kind: "filter" | "column" | "field" | "action" | "card";
  /** 人が読む名前（ラベル。無ければ項目名か id）。 */
  label: string;
  /** 項目名か id（タブの中で光らせる鍵・プレビューの印 `data-hatake` の鍵）。 */
  key: string;
  /** 定義のどこか（`page.table.columns[2]`）。 */
  path: string;
  raw: Loose;
}

export interface OutlinePage {
  id: string;
  title: string;
  /** ページ種別（crud / search / form …）。 */
  type: string;
  path: string;
  roles: string[];
  groups: { kind: OutlineItem["kind"]; title: string; items: OutlineItem[] }[];
  raw: Loose;
}

export interface OutlineMenu {
  label: string;
  path: string;
  /** 開く画面（グループなら無し）。 */
  page?: string;
  roles: string[];
  children: OutlineMenu[];
}

export interface Outline {
  kind: "app" | "page";
  title: string;
  menu: OutlineMenu[];
  pages: OutlinePage[];
  /** 語彙（`optionsOf` が指す選択肢の束）。名前 → 選択肢。 */
  vocabularies: Record<string, { value: unknown; label: string }[]>;
}

const GROUP_TITLES: Record<OutlineItem["kind"], string> = {
  filter: "検索条件",
  column: "一覧の列",
  field: "入力欄",
  action: "操作",
  card: "カード",
};

function itemsOf(page: Loose, base: string): OutlinePage["groups"] {
  const out: OutlinePage["groups"] = [];
  const add = (kind: OutlineItem["kind"], list: { one: Loose; path: string }[]) => {
    if (list.length === 0) return;
    out.push({
      kind,
      title: GROUP_TITLES[kind],
      items: list.map(({ one, path }) => {
        const key = text(one.field) ?? text(one.id) ?? "";
        return { kind, label: text(one.label) ?? text(one.title) ?? key, key, path, raw: one };
      }),
    });
  };
  const search = asDict(page.search);
  add("filter", asList(search.filters).map((one, i) => ({ one, path: `${base}.search.filters[${i}]` })));
  const table = asDict(page.table);
  add("column", asList(table.columns).map((one, i) => ({ one, path: `${base}.table.columns[${i}]` })));
  const fields: { one: Loose; path: string }[] = [];
  asList(asDict(page.form).sections).forEach((section, s) =>
    asList(section.fields).forEach((one, i) => fields.push({ one, path: `${base}.form.sections[${s}].fields[${i}]` })),
  );
  asList(page.steps).forEach((step, s) =>
    asList(step.sections).forEach((section, t) =>
      asList(section.fields).forEach((one, i) => fields.push({ one, path: `${base}.steps[${s}].sections[${t}].fields[${i}]` })),
    ),
  );
  asList(page.fields).forEach((one, i) => fields.push({ one, path: `${base}.fields[${i}]` }));
  add("field", fields);
  add("action", asList(page.actions).map((one, i) => ({ one, path: `${base}.actions[${i}]` })));
  add("card", asList(page.items).map((one, i) => ({ one, path: `${base}.items[${i}]` })));
  return out;
}

function pageOf(page: Loose, path: string): OutlinePage {
  const id = text(page.id) ?? "";
  return {
    id,
    title: text(page.title) ?? id,
    type: text(page.type) ?? "",
    path,
    roles: rolesOfItem(page),
    groups: itemsOf(page, path),
    raw: page,
  };
}

function menuOf(list: unknown, base: string): OutlineMenu[] {
  return asList(list).map((one, i) => {
    const path = `${base}[${i}]`;
    const group = text(one.group);
    return {
      label: group ?? text(one.label) ?? text(one.page) ?? "",
      path,
      ...(text(one.page) === undefined ? {} : { page: text(one.page) }),
      roles: rolesOfItem(one),
      children: menuOf(one.items, `${path}.items`),
    };
  });
}

/** 定義の本文を、ツリーとタブの元に並べる。読めなければ投げる（呼ぶ側が理由を出す）。 */
export function outlineOf(source: string): Outline {
  const doc = asDict(parse(source));
  if ("app" in doc) {
    const app = asDict(doc.app);
    const vocabularies: Outline["vocabularies"] = {};
    for (const one of asList(app.vocabularies)) {
      const name = text(one.name);
      if (name !== undefined) {
        vocabularies[name] = asList(one.options).map((o) => ({ value: o.value, label: text(o.label) ?? String(o.value) }));
      }
    }
    return {
      kind: "app",
      title: text(app.title) ?? text(app.id) ?? "",
      menu: menuOf(app.menu, "app.menu"),
      pages: asList(app.pages).map((one, i) => pageOf(one, `app.pages[${i}]`)),
      vocabularies,
    };
  }
  const page = pageOf(asDict(doc.page), "page");
  return { kind: "page", title: page.title, menu: [], pages: [page], vocabularies: {} };
}

/** 検証の決めごとを、人が読む短い字に（知らない型は名前のまま）。 */
export function rulesText(one: Loose): string[] {
  const out: string[] = [];
  if (one.required === true) out.push("必須");
  if (one.requiredWhen !== undefined) out.push("条件つきで必須");
  for (const rule of asList(one.validators)) {
    const value = rule.value;
    switch (rule.type) {
      case "maxLength":
        out.push(`${String(value)}文字まで`);
        break;
      case "minLength":
        out.push(`${String(value)}文字以上`);
        break;
      case "max":
        out.push(`${String(value)}以下`);
        break;
      case "min":
        out.push(`${String(value)}以上`);
        break;
      case "pattern":
        out.push("形式が決まっている");
        break;
      case "email":
        out.push("メールの形式");
        break;
      case "unique":
        out.push("重ならない");
        break;
      case "compare":
        out.push("ほかの項目と比べる");
        break;
      default:
        out.push(String(rule.type));
    }
  }
  if (one.readOnly === true) out.push("読むだけ");
  if (one.readOnlyWhen !== undefined) out.push("条件で読むだけ");
  if (one.visibleWhen !== undefined) out.push("条件で出る");
  if (one.enabledWhen !== undefined) out.push("条件で押せる");
  if (one.computed !== undefined) out.push("計算した値");
  return out;
}

/** 選択肢（その場に書いたものか、語彙の名前で指したもの）。 */
export function optionsText(one: Loose, vocabularies: Outline["vocabularies"]): string | undefined {
  const given = asList(one.options).map((o) => text(o.label) ?? String(o.value));
  if (given.length > 0) return given.join("／");
  const named = text(one.optionsOf);
  if (named !== undefined) return (vocabularies[named] ?? []).map((o) => o.label).join("／") || `語彙 ${named}`;
  if (one.optionsSource !== undefined) return "別の一覧から引く";
  return undefined;
}

/** 操作の種類を、人が読む言葉に。 */
export const ACTION_WORDS: Record<string, string> = {
  create: "新規登録",
  edit: "編集",
  delete: "削除",
  export: "出力（CSV など）",
  print: "印刷",
  navigate: "別の画面へ",
  plugin: "独自の処理（アプリで登録）",
  call: "サーバを呼ぶ",
};

/** 役割ごとに、見える・押せるの表（行＝役割が書いてある所、列＝定義に出てくる役割）。 */
export function rolesTable(page: OutlinePage, allRoles: string[]): { label: string; where: string; cells: boolean[] }[] {
  const rows: { label: string; where: string; cells: boolean[] }[] = [];
  const add = (label: string, where: string, roles: string[]) => {
    rows.push({ label, where, cells: allRoles.map((role) => roles.length === 0 || roles.includes(role)) });
  };
  if (page.roles.length > 0) add(page.title, "画面", page.roles);
  for (const group of page.groups) {
    for (const item of group.items) {
      const roles = rolesOfItem(item.raw);
      if (roles.length > 0) add(item.label, group.title, roles);
    }
  }
  return rows;
}
