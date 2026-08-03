// 計算項目（computed）をレコードから導出する。{ op, fields, separator? }。
// 組込み concat / sum / subtract / product。Dart / Java 版と同結果。

export type ComputedFn = (
  computed: Record<string, unknown>,
  record: Record<string, unknown>,
) => unknown;

function toNum(v: unknown): number | null {
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || Number.isNaN(Number(t))) return null;
    return Number(t);
  }
  return null;
}

const str = (v: unknown): string => (v == null ? "" : String(v));

const fieldsOf = (c: Record<string, unknown>): string[] =>
  Array.isArray(c.fields) ? c.fields.map(String) : [];

export const builtinComputeds: Record<string, ComputedFn> = {
  concat: (c, r) => {
    const sep = c.separator != null ? String(c.separator) : "";
    return fieldsOf(c)
      .map((f) => str(r[f]))
      .join(sep);
  },
  sum: (c, r) => fieldsOf(c).reduce((acc, f) => acc + (toNum(r[f]) ?? 0), 0),
  subtract: (c, r) => {
    const fields = fieldsOf(c);
    if (fields.length === 0) return 0;
    return fields
      .slice(1)
      .reduce((acc, f) => acc - (toNum(r[f]) ?? 0), toNum(r[fields[0]]) ?? 0);
  },
  product: (c, r) => fieldsOf(c).reduce((acc, f) => acc * (toNum(r[f]) ?? 1), 1),
};

/** 計算オペレーションを名前で解決する。register で拡張可能。 */
export class ComputedRegistry {
  private readonly ops: Record<string, ComputedFn>;

  constructor(custom?: Record<string, ComputedFn>) {
    this.ops = { ...builtinComputeds, ...custom };
  }

  compute(
    computed: Record<string, unknown> | null | undefined,
    record: Record<string, unknown>,
  ): unknown {
    if (computed == null) return undefined;
    const op = computed.op;
    if (typeof op !== "string") return undefined;
    return this.ops[op]?.(computed, record);
  }

  register(op: string, fn: ComputedFn): void {
    this.ops[op] = fn;
  }

  has(op: string): boolean {
    return op in this.ops;
  }
}
