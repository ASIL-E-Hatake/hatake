// 役割ごとに「一括で何件動かせて、何件ずつ渡すのか」を数える。
//
// 上限（`action.maxRows`）と区切り（`action.batchSize`）は**どちらも役割ごとに書ける**。
// 書ける場所はボタンなので、定義のあちこちに散る＝「拠点の担当は1回に何件動かせるのか」を
// 読むには、全部のボタンを開いて役割の枝を追うことになる。**役割から引く口**が無かった。
//
// ここは数えるだけ（言い方は [renderRoles] の側）。どの役割が押せるかは `action.roles`、
// 何件かは `maxRows` / `batchSize` の役割ごとの解き方（[rowLimitFor] / [batchSizeFor]）に
// そのまま任せる＝**画面と同じ答え**を出す（別の計算を書くと、棚卸しだけが嘘になる）。

import {
  ActionScopes,
  DEFAULT_PAGE_SIZE,
  batchSizeFor,
  rowLimitFor,
  type BatchSize,
  type RowLimit,
} from "./definition.js";
import { isAllowed } from "./access.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** ある役割から見た、一括ボタン1つ。 */
export interface RoleBulk {
  /** どの画面のボタンか（app のときだけ）。 */
  page?: string;
  /** ボタンの呼び名（ラベル、無ければ id）。 */
  label: string;
  /** その役割が1回で動かせる件数。**undefined = 上限なし**（選べる全部）。 */
  rows?: number;
  /** その役割に1回で渡す件数。**undefined = 区切りが無い**（1回で全部渡す）。 */
  batch?: number;
}

/** 素の `maxRows`（数 / `{ default, byRole }`）を [RowLimit] に読む。 */
function readRowLimit(raw: unknown): RowLimit | undefined {
  const value = (one: unknown): number | "all" | undefined =>
    one === "all" ? "all" : typeof one === "number" ? one : undefined;
  if (typeof raw === "number") return { default: raw, byRole: {} };
  if (!isDict(raw)) return undefined;
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

/** 素の `batchSize`（数 / `{ default, byRole }`）を [BatchSize] に読む。 */
function readBatchSize(raw: unknown): BatchSize | undefined {
  if (typeof raw === "number") return { default: raw, byRole: {} };
  if (!isDict(raw)) return undefined;
  if (typeof raw.default !== "number") return undefined;
  const byRole: Record<string, number> = {};
  if (isDict(raw.byRole)) {
    for (const [role, one] of Object.entries(raw.byRole)) {
      if (typeof one === "number") byRole[role] = one;
    }
  }
  return { default: raw.default, byRole };
}

/** 画面に出ている行の数（選べるのはここまで）。undefined = 全件出る／表が無い。 */
function onScreen(page: Dict): number | undefined {
  const table = isDict(page.table) ? page.table : undefined;
  if (table === undefined) return undefined;
  const pagination = isDict(table.pagination) ? table.pagination : undefined;
  if (pagination?.enabled === false) return undefined;
  return typeof pagination?.pageSize === "number"
    ? pagination.pageSize
    : DEFAULT_PAGE_SIZE;
}

/** document の中の画面ぜんぶ（単票でも app でも同じ形で）。 */
function pagesOf(document: Dict): Dict[] {
  const out: Dict[] = [];
  if (isDict(document.page)) out.push(document.page);
  if (isDict(document.app)) {
    for (const page of list(document.app.pages)) if (isDict(page)) out.push(page);
  }
  return out;
}

/**
 * 役割ごとの一括の件数。**その役割が押せるボタンだけ**が入る。
 *
 * `roles` を書いていないボタンは誰でも押せるので、全部の役割に出る（件数は役割ごとに
 * 変わり得るので、並べる意味がある）。
 */
export function bulkByRole(
  document: Dict,
  roles: Iterable<string>,
): Map<string, RoleBulk[]> {
  const app = isDict(document.app);
  const out = new Map<string, RoleBulk[]>();
  for (const role of roles) {
    const found: RoleBulk[] = [];
    for (const page of pagesOf(document)) {
      const seats = onScreen(page);
      for (const action of list(page.actions)) {
        if (!isDict(action)) continue;
        if (str(action.scope) !== ActionScopes.selection) continue;
        if (!isAllowed(list(action.roles).map(String), [role])) continue;
        const cap = rowLimitFor(readRowLimit(action.maxRows), [role]);
        // 選べるのは画面に出ている行だけ＝上限と1ページの件数の小さい方が本当の上限。
        const rows =
          cap === undefined
            ? seats
            : seats === undefined
              ? cap
              : Math.min(cap, seats);
        found.push({
          page: app ? str(page.id) : undefined,
          label: str(action.label) ?? str(action.id) ?? "ボタン",
          rows,
          batch: batchSizeFor(readBatchSize(action.batchSize), [role]),
        });
      }
    }
    if (found.length > 0) out.set(role, found);
  }
  return out;
}

/**
 * 「1回 50 件まで・20 件ずつ（3回に分かれる）」の言い方。
 *
 * 区切りが無いなら**そう言う**（「区切りなし＝1回で 50 件渡す」）＝進み具合も残り時間も
 * 中断も無い状態が、棚卸しの上で読める。
 */
export function bulkLine(one: RoleBulk): string {
  const rows = one.rows === undefined ? "上限なし" : `1回 ${one.rows} 件まで`;
  if (one.batch === undefined) {
    const how =
      one.rows === undefined
        ? "1回で選んだ全部を渡す"
        : `1回で ${one.rows} 件を渡す`;
    return `${rows}・区切りなし（${how}）`;
  }
  if (one.rows === undefined) return `${rows}・${one.batch} 件ずつ`;
  const times = Math.ceil(one.rows / one.batch);
  return `${rows}・${one.batch} 件ずつ（上限まで選ぶと ${times} 回に分かれる）`;
}
