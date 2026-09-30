import { FieldTypes, type SearchDefinition } from "./definition.js";

/** One resolved search condition. Framework-neutral (no ORM/HTTP knowledge). */
export interface QueryCondition {
  field: string;
  operator: string;
  value: unknown;
}

/**
 * A framework-neutral description of a query, built from a search definition +
 * request params. Turn this into JPA / Prisma / SQL / etc. in your own adapter;
 * hatake itself stays dependency-free.
 */
export interface QuerySpec {
  conditions: QueryCondition[];
  sortField?: string;
  sortAscending: boolean;
  page: number;
  pageSize: number;
}

export interface BuildQueryOptions {
  defaultPageSize?: number;
  /**
   * **並べ替えを許す列**（その画面の `table`）。
   *
   * 渡さなければ、並べ替えられるのは**絞り込みに宣言した項目だけ**（今までどおり）。
   * 渡すと、そこに `sortable: true` と書いてある列でも並べ替えられる。
   *
   * 分けてあるのは、**素性の知れない列名を SQL に入れない**ため。利用者が送って
   * きた文字列は依然として通らず、通るのは**定義に書いてある列**だけ。
   *
   * 渡さないと、`sortable: true` と書いた列が**押せるのに並ばない**（画面は出て、
   * エラーも出ない）。同梱の例も `hatake new` の雛形も、絞り込みに無い列に
   * `sortable: true` を書いているので、**サーバを書く人はこれを渡すのが既定**と
   * 思ってよい。
   */
  table?: { columns: { field: string; sortable?: boolean }[] };
}

function toInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Math.trunc(Number(v));
  }
  return fallback;
}

function coerce(raw: unknown, type: string): unknown {
  if (type === FieldTypes.number) {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  return typeof raw === "string" ? raw.trim() : raw;
}

const isEmpty = (v: unknown): boolean =>
  v == null || (typeof v === "string" && v.trim() === "");

/**
 * Builds a {@link QuerySpec} from a search definition and request params.
 *
 * Only fields declared as filters produce conditions — unknown params are
 * ignored, so clients can't query by arbitrary columns. Values are coerced by
 * the filter's declared type, and the operator comes from the definition.
 */
export function buildQuery(
  search: SearchDefinition | undefined,
  params: Record<string, unknown>,
  opts: BuildQueryOptions = {},
): QuerySpec {
  const filters = search?.filters ?? [];
  const allowed = new Set(filters.map((f) => f.field));

  // 並べ替えに許す名前。**絞り込みに書いた項目**に加えて、渡されていれば
  // **定義が `sortable: true` と言っている列**も許す（どちらも定義に書いてある名前で、
  // 利用者が送ってきた文字列ではない）。
  const sortable = new Set(allowed);
  for (const column of opts.table?.columns ?? []) {
    if (column.sortable === true) sortable.add(column.field);
  }

  const conditions: QueryCondition[] = [];
  for (const f of filters) {
    const raw = params[f.field];
    if (isEmpty(raw)) continue;
    conditions.push({ field: f.field, operator: f.operator, value: coerce(raw, f.type) });
  }
  // **いつも掛ける条件**（`search.fixed`）。画面は送ってこない＝利用者が外せない所。
  // 並べ替えの名前には入れない（絞る条件であって、並べる列ではない）。
  for (const f of search?.fixed ?? []) {
    conditions.push({ field: f.field, operator: f.operator, value: f.value });
  }

  const sf = params["sortField"];
  const sortField =
    typeof sf === "string" && sortable.has(sf) ? sf : undefined;
  // 昇順か降順か。**文字列の "false" も降順として読む**のが要点で、REST の契約
  // （spec/conformance/rest_query.json）はクエリ文字列で送ると決めている＝
  // `sortAscending=false` は **文字列** で届く。ここを真偽値だけで見ていると、
  // 降順を頼まれているのに黙って昇順で返す（画面には並びが出るので気づけない）。
  const asked = params["sortAscending"];
  const sortAscending =
    asked !== false && asked !== "false" && params["order"] !== "desc";

  return {
    conditions,
    sortField,
    sortAscending,
    page: toInt(params["page"], 0),
    pageSize: toInt(params["pageSize"], opts.defaultPageSize ?? 50),
  };
}
