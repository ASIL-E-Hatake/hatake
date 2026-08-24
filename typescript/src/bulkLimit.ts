// 1回で動かせる行数の上限（`action.maxRows`）を、**素の定義から**解く。
//
// 画面はもう止めている（超えて選んでいる間ボタンが押せない）。しかし API を直接叩けば
// 通るので、上限は**守る側でも同じ数**で判定できないと意味がない。検証（FormValidator）
// を画面とバックエンドの両方で回すのと同じ理由で、ここに1つだけ置く。
//
// 解析済みのモデルではなく**素の document**を受けるのは、バックエンドが持っているのが
// それだから（アクションは UI の話なので Java 版の PageDefinition は持っていない）。
// Dart / Java 版と同じ答えになるよう、共有フィクスチャ `conformance/bulk_limits.json`
// で縛る。

import { rowLimitFor, type RowLimit } from "./definition.js";
import { MessageResolver } from "./messageResolver.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 素の `maxRows`（数 / `{ default, byRole }`）を [RowLimit] に読む。 */
function readRowLimit(raw: unknown): RowLimit | undefined {
  if (typeof raw === "number") return { default: raw, byRole: {} };
  if (!isDict(raw)) return undefined;
  const value = (one: unknown): number | "all" | undefined =>
    one === "all" ? "all" : typeof one === "number" ? one : undefined;
  const fallback = value(raw.default);
  if (fallback === undefined) return undefined;
  const byRole: Record<string, number | "all"> = {};
  if (isDict(raw.byRole)) {
    for (const [role, one] of Object.entries(raw.byRole)) {
      const found = value(one);
      if (found !== undefined) byRole[role] = found;
    }
  }
  return { default: fallback, byRole };
}

/**
 * document の中の `id` のアクション（`page:` でも `app:` でも）。**全部**返す。
 *
 * 同じ id のボタンは別のページにも在り得る（`csv` はどの画面にも置く）。`pageId` を
 * 渡せばその画面のものだけ。
 */
function findActions(document: Dict, actionId: string, pageId?: string): Dict[] {
  const pages: Dict[] = [];
  if (isDict(document.page)) pages.push(document.page);
  if (isDict(document.app)) {
    for (const page of list(document.app.pages)) if (isDict(page)) pages.push(page);
  }
  const found: Dict[] = [];
  for (const page of pages) {
    if (pageId !== undefined && page.id !== pageId) continue;
    for (const action of list(page.actions)) {
      if (isDict(action) && action.id === actionId) found.push(action);
    }
  }
  return found;
}

/**
 * `actionId` のボタンを `roles` の人が押したとき、**1回で何件まで**か。
 *
 * `undefined` は上限なし（書いていない／`all`／そのアクションが無い）。
 */
export function bulkLimitOf(
  document: Dict,
  actionId: string,
  roles: Iterable<string> = [],
  pageId?: string,
): number | undefined {
  const actions = findActions(document, actionId, pageId);
  // 同じ id が複数のページに在るときは**一番厳しい上限**を採る（守る側なので、
  // 緩い方に倒すと画面で押せない操作が API で通る）。どの画面の話か分かっているなら
  // `pageId` を渡せば1つに決まる。
  let strictest: number | undefined;
  for (const action of actions) {
    const found = rowLimitFor(readRowLimit(action.maxRows), roles);
    if (found === undefined) continue; // このボタンは上限なし
    if (strictest === undefined || found < strictest) strictest = found;
  }
  return strictest;
}

/** 上限を超えていたときの中身（件数まで言う＝「多すぎます」では直せない）。 */
export interface BulkLimitBreach {
  actionId: string;
  /** 定義に書いてある上限。 */
  limit: number;
  /** 実際に届いた件数。 */
  count: number;
  /** そのまま返せる文言。 */
  message: string;
}

/**
 * 届いた件数が上限を超えていないか。**超えていなければ null**（＝通す）。
 *
 * バックエンドはこれを1行で挟める。画面が止めているのは「早く気づかせるため」で、
 * こちらは「守るため」＝同じ定義から同じ数を読む。
 */
export function checkBulkLimit(
  document: Dict,
  actionId: string,
  count: number,
  roles: Iterable<string> = [],
  messages: MessageResolver = new MessageResolver(),
  pageId?: string,
): BulkLimitBreach | null {
  const limit = bulkLimitOf(document, actionId, roles, pageId);
  if (limit === undefined || count <= limit) return null;
  return {
    actionId,
    limit,
    count,
    message: messages.resolve("bulk.tooMany", { value: limit, count }),
  };
}
