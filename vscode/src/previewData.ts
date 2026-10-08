// プレビューに入れる**作り物のデータ**と、切り替えられる役割の一覧を定義から作る。
//
// VS Code に依らない純関数（試験から直に呼ぶ）。描くのは Webview 側（preview/main.ts）。
//
// データは**定義に書いてあることから**作る（本物のサーバは見ない）:
//   ・どの Repository が要るか … 定義が要求している名前（`hatake_refs` と同じ答えを渡してもらう）
//   ・どの項目を持つか        … その Repository を使う画面の列・入力欄・絞り込み・鍵
//   ・値                       … 入力欄は `plausible`（下書きのシナリオ・試験データと同じ作り方）、
//                               行ごとに少しずつずらす（全部同じ字だと一覧が読めない）
// 定義の横に `preview/<Repository 名>.json`（行の配列）を置けば、そちらを使う。

import {
  formFields,
  parseAppSource,
  parsePageYaml,
  plausible,
  type FieldDefinition,
  type PageDefinition,
} from "@hatake-fw/api/internal";

/** 1つの Repository に入れる行と、1件を指す項目。 */
export interface PreviewRepository {
  keyFields: string[];
  rows: Record<string, unknown>[];
  /** どこから来たか（`定義から作った` か、置いてあったファイル）。 */
  from: string;
}

export interface PreviewModel {
  kind: "app" | "page";
  repositories: Record<string, PreviewRepository>;
  /** 定義に出てくる役割（切り替えの候補。空なら切り替えは出さない）。 */
  roles: string[];
}

/** 1つの Repository に入れる行の数（ページ送りが見える程度は要らない。一覧が読める数）。 */
export const PREVIEW_ROWS = 8;

const isApp = (source: string): boolean => /^\s*app\s*:/m.test(source);

/** 定義の画面（app なら全部、page なら1枚）。読めなければ投げる（呼ぶ側が理由を出す）。 */
export function pagesOf(source: string): PageDefinition[] {
  return isApp(source) ? parseAppSource(source).pages : [parsePageYaml(source, { strict: true })];
}

type Loose = Record<string, unknown>;
const asList = (value: unknown): Loose[] => (Array.isArray(value) ? (value as Loose[]) : []);

/** 列・絞り込みの項目を、値を作れる形（入力欄と同じ形）に寄せる。 */
function looseField(one: Loose): FieldDefinition {
  return {
    field: String(one.field),
    label: String(one.label ?? one.field),
    type: String(one.type ?? "text"),
    options: asList(one.options) as unknown as FieldDefinition["options"],
    validators: [],
    rowFields: [],
  } as unknown as FieldDefinition;
}

/** その Repository を使う画面から、項目と鍵を集める（同じ名前は先に見つけたほうを使う）。 */
function shapeOf(pages: PageDefinition[], repository: string): { fields: FieldDefinition[]; keyFields: string[] } {
  const fields = new Map<string, FieldDefinition>();
  const keyFields: string[] = [];
  for (const page of pages as unknown as Loose[]) {
    if (page.repository !== repository) continue;
    for (const key of (page.keyFields as string[] | undefined) ?? []) if (!keyFields.includes(key)) keyFields.push(key);
    const form = page.form as Parameters<typeof formFields>[0] | undefined;
    for (const one of form === undefined ? [] : formFields(form)) {
      if (one.computed === undefined && !fields.has(one.field)) fields.set(one.field, one);
    }
    const table = page.table as Loose | undefined;
    for (const one of asList(table?.columns)) if (!fields.has(String(one.field))) fields.set(String(one.field), looseField(one));
    const search = page.search as Loose | undefined;
    for (const one of asList(search?.filters)) if (!fields.has(String(one.field))) fields.set(String(one.field), looseField(one));
  }
  for (const key of keyFields) if (!fields.has(key)) fields.set(key, looseField({ field: key }));
  return { fields: [...fields.values()], keyFields };
}

/** 1行の1項目の値（`plausible` を元に、行ごとにずらす）。 */
export function valueFor(field: FieldDefinition, index: number, isKey: boolean): unknown {
  const options = field.options ?? [];
  if (options.length > 0) return options[index % options.length].value;
  const base = plausible(field);
  if (typeof base === "number") return base + index * (field.type === "number" && base >= 1 ? 1000 : 1);
  if (typeof base === "boolean") return index % 3 === 0;
  if (typeof base !== "string") return base;
  if (/^\d{4}-\d{2}-\d{2}/.test(base)) {
    const day = String((index % 27) + 1).padStart(2, "0");
    return base.replace(/^(\d{4}-\d{2})-\d{2}/, `$1-${day}`);
  }
  if (isKey || base === "テスト") {
    const text = isKey ? `${field.field.slice(0, 1).toUpperCase()}${String(index + 1).padStart(3, "0")}` : `${field.label}${index + 1}`;
    return text;
  }
  return base;
}

/** 定義に出てくる役割（`roles: [..]` と `byRole: { 役割: .. }` を全部拾う）。 */
export function rolesOf(value: unknown, found: Set<string> = new Set()): string[] {
  if (Array.isArray(value)) {
    for (const one of value) rolesOf(one, found);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, one] of Object.entries(value as Loose)) {
      if (key === "roles" && Array.isArray(one)) for (const role of one) if (typeof role === "string") found.add(role);
      if (key === "byRole" && typeof one === "object" && one !== null) for (const role of Object.keys(one)) found.add(role);
      rolesOf(one, found);
    }
  }
  return [...found].sort();
}

/**
 * プレビューの中身を作る。
 *
 * @param repositories 定義が要求している Repository の名前（`hatake_refs` の答え）
 * @param placed       置いてあった行（`preview/<名前>.json`）。在れば作らずにそれを使う
 */
export function previewModel(
  source: string,
  repositories: string[],
  placed: Record<string, { rows: Record<string, unknown>[]; from: string }> = {},
): PreviewModel {
  const app = isApp(source) ? parseAppSource(source) : undefined;
  const pages = app === undefined ? pagesOf(source) : app.pages;
  const out: Record<string, PreviewRepository> = {};
  for (const name of repositories) {
    const { fields, keyFields } = shapeOf(pages, name);
    const keys = keyFields.length > 0 ? keyFields : ["id"];
    const given = placed[name];
    if (given !== undefined) {
      out[name] = { keyFields: keys, rows: given.rows, from: given.from };
      continue;
    }
    const rows = Array.from({ length: PREVIEW_ROWS }, (_, index) => {
      const row: Record<string, unknown> = {};
      for (const field of fields) row[field.field] = valueFor(field, index, keys.includes(field.field));
      for (const key of keys) if (!(key in row)) row[key] = `${key}-${index + 1}`;
      return row;
    });
    out[name] = { keyFields: keys, rows, from: "定義から作った作り物" };
  }
  // メニューの出し分けなど、app の側に書いた役割も拾う。
  return { kind: app === undefined ? "page" : "app", repositories: out, roles: rolesOf([app?.app, pages]) };
}
