// サーバが**画面と同じ判断**をする口（0.9.22）。
//
// 画面は `roles` で列・項目・ボタン・画面そのものを隠す。しかし API を直接叩けば全部
// 通るので、隠しただけでは「見えないだけ」になる。0.9.21 までは見本の3本ともここを手で
// 書いていて（列の roles だけ見て項目の roles を忘れる・画面の権限を役割名で決め打ち）、
// 定義と食い違っていた。
//
// どれも**素の document と画面の id** を受ける（[bulkLimitOf] と同じ）。バックエンドが
// 持っているのはそれで、Java 版の PageDefinition はボタンも画面の roles も持たない。
// Java 版（`ServerAccess`）と同じ答えになることは `spec/conformance/server_access.json`
// が見ている。
//
// **やらないこと**: 空文字を null にする・`normalize` を当てる・`readOnlyWhen` のような
// 条件つきの判定（mode とレコードが要る）・明細の子行の roles・行の範囲（「自分の拠点の
// 行だけ」）。最後のは認可なので枠組みの外。

import { isAllowed } from "./access.js";
import { rawFormFields } from "./pageParts.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);
const strings = (v: unknown): string[] =>
  list(v).filter((one): one is string => typeof one === "string");

type Roles = Iterable<string>;

const rolesOf = (roles: Roles): string[] => [...roles];

/** 組み込みの操作（宣言は `type` で引く）。 */
const BUILT_IN = new Set(["create", "edit", "delete"]);
/** 一覧と入力を持つ画面（行の操作と新規登録のボタンが在る）。 */
const LISTS = new Set(["crud", "master"]);
/** 画面そのものが入力（保存が画面の機能）。 */
const INPUTS = new Set(["form", "wizard"]);

/** 画面を1枚引く（単票でも app でも）。無ければ undefined。 */
function pageIn(document: Dict, pageId: string): Dict | undefined {
  if (isDict(document.page) && document.page.id === pageId) return document.page;
  if (isDict(document.app)) {
    return dicts(document.app.pages).find((page) => page.id === pageId);
  }
  return undefined;
}

const opens = (page: Dict | undefined, roles: string[]): page is Dict =>
  page !== undefined && isAllowed(strings(page.roles), roles);

/**
 * その人がこの画面を開けるか（画面自身の `roles`）。**知らない画面は閉じている**。
 *
 * 入口（メニュー・ボタン）の権限は見ない。サーバに届いた時点で入口は通り過ぎている
 * ので、守れるのは画面の門だけ。
 */
export function canOpenPageIn(document: Dict, pageId: string, roles: Roles = []): boolean {
  return opens(pageIn(document, pageId), rolesOf(roles));
}

/**
 * その人がこの画面のボタンを押せるか。[actionId] は宣言の id か、組み込みの
 * `create` / `edit` / `delete`。
 *
 *   ・開けない画面では何も押せない
 *   ・宣言したボタン（id が合うもの）はその `roles`
 *   ・`create` は `type: create` を宣言したときだけ（画面に出ていないボタンは押せない）
 *   ・`edit` / `delete` は `table.rowActions` に並べたときだけで、宣言（`type` で引く）が
 *     在ればその `roles`
 *   ・form / wizard は画面そのものが入力なので、`create` / `edit` は開ければ可
 *   ・それ以外は押せない
 */
export function canRunActionIn(
  document: Dict,
  pageId: string,
  actionId: string,
  roles: Roles = [],
): boolean {
  const who = rolesOf(roles);
  const page = pageIn(document, pageId);
  if (!opens(page, who)) return false;
  const actions = dicts(page.actions);
  const kind = typeof page.type === "string" ? page.type : "";

  const byId = actions.find((one) => one.id === actionId);
  if (byId !== undefined) return isAllowed(strings(byId.roles), who);
  if (!BUILT_IN.has(actionId)) return false;

  if (INPUTS.has(kind)) return actionId !== "delete";
  if (!LISTS.has(kind)) return false;

  const byType = actions.find((one) => one.type === actionId);
  if (actionId === "create") return byType !== undefined && isAllowed(strings(byType.roles), who);
  const table = isDict(page.table) ? page.table : {};
  if (!strings(table.rowActions).includes(actionId)) return false;
  return byType === undefined || isAllowed(strings(byType.roles), who);
}

/** その画面に出てくる項目と、それぞれの `roles`（列・入力欄の両方）。 */
function declarations(page: Dict): { field: string; roles: string[] }[] {
  const table = isDict(page.table) ? page.table : {};
  return [...dicts(table.columns), ...rawFormFields(page).map((one) => one.node)].flatMap(
    (node) =>
      typeof node.field === "string" ? [{ field: node.field, roles: strings(node.roles) }] : [],
  );
}

/**
 * その人に**見せてよい形**にしたレコード（元は変えない）。
 *
 * 見せないのは、その画面の列か入力欄の**どこか一つでも** `roles` から外れている項目
 * （守る側なので一番厳しく倒す）。定義に出てこない項目は触らない。開けない画面では
 * 何も見せない（空のレコード）。
 */
export function visibleRecordIn(
  document: Dict,
  pageId: string,
  record: Record<string, unknown>,
  roles: Roles = [],
): Record<string, unknown> {
  const who = rolesOf(roles);
  const page = pageIn(document, pageId);
  if (!opens(page, who)) return {};
  const hidden = new Set(
    declarations(page)
      .filter((one) => !isAllowed(one.roles, who))
      .map((one) => one.field),
  );
  return Object.fromEntries(Object.entries(record).filter(([key]) => !hidden.has(key)));
}

/** [acceptRecordIn] の答え。 */
export interface AcceptedRecord {
  /** 受け取ってよい項目だけのレコード。 */
  accepted: Record<string, unknown>;
  /** 落とした項目の名前（届いた順）。**黙って捨てない**ために返す。 */
  dropped: string[];
}

/**
 * 届いた body のうち、その人が**この画面から書いてよい項目**だけを残す。
 *
 * 残すのは、その画面の入力欄に在って・その人に見えて・`readOnly` でも `computed` でも
 * ない項目。画面に出ていない欄から値が来るのは、API を直接叩いたときだけ。開けない
 * 画面からは何も受け取らない。
 */
export function acceptRecordIn(
  document: Dict,
  pageId: string,
  body: Record<string, unknown>,
  roles: Roles = [],
): AcceptedRecord {
  const who = rolesOf(roles);
  const page = pageIn(document, pageId);
  const writable = new Set<string>();
  if (opens(page, who)) {
    const hidden = new Set(
      declarations(page)
        .filter((one) => !isAllowed(one.roles, who))
        .map((one) => one.field),
    );
    for (const { node } of rawFormFields(page)) {
      if (typeof node.field !== "string") continue;
      if (node.readOnly === true || node.computed !== undefined) continue;
      if (hidden.has(node.field)) continue;
      writable.add(node.field);
    }
  }
  const accepted: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (writable.has(key)) accepted[key] = value;
    else dropped.push(key);
  }
  return { accepted, dropped };
}
