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

  const conditions: QueryCondition[] = [];
  for (const f of filters) {
    const raw = params[f.field];
    if (isEmpty(raw)) continue;
    conditions.push({ field: f.field, operator: f.operator, value: coerce(raw, f.type) });
  }

  const sf = params["sortField"];
  const sortField =
    typeof sf === "string" && allowed.has(sf) ? sf : undefined;
  const sortAscending =
    params["sortAscending"] !== false && params["order"] !== "desc";

  return {
    conditions,
    sortField,
    sortAscending,
    page: toInt(params["page"], 0),
    pageSize: toInt(params["pageSize"], opts.defaultPageSize ?? 50),
  };
}
