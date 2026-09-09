// **その役割から見ると、この定義はどう見えるか**。
//
// いま引けるのは「画面 → 役割」の向き（どこに `roles` が書いてあるか＝[roleInventory]、
// 誰が開けるか＝[appAccess]）。棚卸しで聞かれるのは逆で、「**この役割で何ができるか**」
// ＝役割 → 画面・列・ボタン。人事異動のたびに聞かれるのはこの形。
//
// 見るのは**定義に書いてあること**だけ。実際のアクセス制御はバックエンドの話で、
// `roles` は「間違って触らせない」ためのもの（`spec/dsl-spec.ja.md` の roles を参照）。
//
// **誰でもない人（未ログイン）を必ず1列入れる**のが決めごと。役割を持つ人だけを並べると、
// 「ログインしていない人に何が見えているか」が誰も見ないままになる（デモで役割を
// 切り替えられるようにして最初に分かったのがそれ）。

import { isAllowed } from "./access.js";
import { appAccess, type Audience } from "./appAccess.js";
import {
  pageActions,
  rawFormFields,
  searchFilters,
  tableColumns,
} from "./pageParts.js";

/** 役割を持たない人（未ログイン）を指す印。役割名には空文字を使えない。 */
export const NOBODY = "";

/** 役割の見え方を出す単位（画面の中の1つ）。 */
export interface SightItem {
  /** `列` / `ボタン` / `項目` / `絞り込み` / `カード`。 */
  node: string;
  /** 画面の言葉（無ければ id や項目名）。 */
  label: string;
  /** そこに書いてある役割（空＝誰でも見える）。 */
  roles: string[];
}

/** 1画面の見え方。 */
export interface PageSight {
  page: string;
  title: string;
  /** その画面を開けるか（app のときだけ意味がある）。 */
  canOpen: boolean;
  /** 入口が定義に無い（単票の定義・どこからも開けない画面）。 */
  entryUnknown: boolean;
  /** 役割で絞られている物だけ（絞っていない物は全員に見えるので並べない）。 */
  gated: SightItem[];
}

/** 役割1つの見え方。 */
export interface RoleSight {
  /** 役割名。[NOBODY] なら誰でもない人。 */
  role: string;
  pages: PageSight[];
}

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const rolesOf = (node: Record<string, unknown>): string[] => [
  ...new Set(list(node.roles).filter((one): one is string => typeof one === "string")),
];

/** 名前（画面の言葉が無ければ id や項目名で代わりにする）。 */
function labelOf(node: Record<string, unknown>): string {
  return (
    str(node.label) ??
    str(node.title) ??
    str(node.field) ??
    str(node.id) ??
    str(node.page) ??
    "（名前なし）"
  );
}

/** その画面の中で**役割で絞られている物**を全部。 */
function gatedItems(page: Record<string, unknown>): SightItem[] {
  const found: SightItem[] = [];
  const add = (node: string, parts: { node: Record<string, unknown> }[]) => {
    for (const part of parts) {
      const roles = rolesOf(part.node);
      if (roles.length === 0) continue;
      found.push({ node, label: labelOf(part.node), roles });
    }
  };
  add("列", tableColumns(page));
  add("絞り込み", searchFilters(page));
  add("項目", rawFormFields(page));
  add("ボタン", pageActions(page));
  add(
    "カード",
    list(page.items)
      .filter(isDict)
      .map((node) => ({ node })),
  );
  return found;
}

/** メニューの項目のうち、役割で絞られているもの（入口＝画面を開ける権限）。 */
function menuGated(app: Record<string, unknown>): SightItem[] {
  const found: SightItem[] = [];
  const walk = (items: unknown[]) => {
    for (const item of items.filter(isDict)) {
      const roles = rolesOf(item);
      if (roles.length > 0) {
        found.push({ node: "メニュー", label: labelOf(item), roles });
      }
      if (Array.isArray(item.items)) walk(item.items);
    }
  };
  walk(list(app.menu));
  return found;
}

/** 定義に出てくる画面（app なら全部、単票なら1枚）。 */
function pagesOf(document: Record<string, unknown>): Record<string, unknown>[] {
  const app = isDict(document.app) ? document.app : undefined;
  if (app !== undefined) return list(app.pages).filter(isDict);
  return isDict(document.page) ? [document.page] : [];
}

const canOpen = (audience: Audience | undefined, role: string): boolean => {
  if (audience === undefined) return true; // 入口が分からない＝閉じているとは言わない
  if (audience.everyone) return true;
  return audience.roles.includes(role);
};

/**
 * 定義に出てくる役割の全部（[NOBODY] は含まない）。並びは名前順。
 *
 * 出るのは**定義に書いてある名前**だけ（アプリが配る語彙は別の話＝
 * `hatake registry` / `validate --registry`）。
 */
export function rolesInDocument(document: Record<string, unknown>): string[] {
  const found = new Set<string>();
  const app = isDict(document.app) ? document.app : undefined;
  if (app !== undefined) {
    for (const one of menuGated(app)) for (const role of one.roles) found.add(role);
  }
  for (const page of pagesOf(document)) {
    for (const one of gatedItems(page)) for (const role of one.roles) found.add(role);
  }
  return [...found].sort();
}

/**
 * 役割ごとの見え方。[roles] を渡さなければ、定義に出てくる役割の全部
 * ＋**誰でもない人**を1列。
 */
export function roleSights(
  document: Record<string, unknown>,
  roles?: string[],
): RoleSight[] {
  const access = appAccess(document);
  const app = isDict(document.app) ? document.app : undefined;
  const menu = app === undefined ? [] : menuGated(app);
  const pages = pagesOf(document);
  const wanted = roles ?? [...rolesInDocument(document), NOBODY];

  return wanted.map((role) => ({
    role,
    pages: pages.map((page) => {
      const id = str(page.id) ?? "";
      const audience = access.audience.get(id);
      return {
        page: id,
        title: str(page.title) ?? id,
        canOpen: canOpen(audience, role),
        entryUnknown: app === undefined || access.entries.get(id) === undefined,
        gated: [
          // メニューの入口は画面ごとの話なので、その画面のものだけを混ぜる。
          ...menu.filter((one) => menuEntryOf(app!, one.label) === id),
          ...gatedItems(page),
        ],
      };
    }),
  }));
}

/** メニュー項目のラベルから、それが開く画面 id を引く（同じラベルは1つと見る）。 */
function menuEntryOf(app: Record<string, unknown>, label: string): string | undefined {
  let found: string | undefined;
  const walk = (items: unknown[]) => {
    for (const item of items.filter(isDict)) {
      if (labelOf(item) === label && str(item.page) !== undefined) {
        found ??= str(item.page);
      }
      if (Array.isArray(item.items)) walk(item.items);
    }
  };
  walk(list(app.menu));
  return found;
}

/** その役割に見えるか（絞っていない物は見える）。 */
export const sees = (item: SightItem, role: string): boolean =>
  isAllowed(item.roles, role === NOBODY ? [] : [role]);

/** 画面ごとの「見える数 / 絞られている数」。 */
export function seenCount(
  sight: PageSight,
  role: string,
): { seen: number; hidden: number } {
  let seen = 0;
  let hidden = 0;
  for (const item of sight.gated) {
    if (sees(item, role)) seen += 1;
    else hidden += 1;
  }
  return { seen, hidden };
}
