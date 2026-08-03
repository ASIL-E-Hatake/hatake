// 宣言的な条件（visibleWhen / enabledWhen）をレコードに対して評価する。
// リーフ { field, operator, value } / 結合 { all } { any } { not }。
// Dart / Java 版と同じ判定になるよう実装をそろえる（conformance）。

export type Condition = Record<string, unknown>;
export type Record_ = Record<string, unknown>;

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

function isEmptyValue(v: unknown): boolean {
  return (
    v == null ||
    (typeof v === "string" && v.trim() === "") ||
    (Array.isArray(v) && v.length === 0)
  );
}

function eq(a: unknown, b: unknown): boolean {
  const na = toNum(a);
  const nb = toNum(b);
  if (na !== null && nb !== null) return na === nb;
  return str(a) === str(b);
}

/** -1 / 0 / 1。両方数値なら数値、それ以外は文字列（コード単位）比較。 */
function compare(a: unknown, b: unknown): number {
  const na = toNum(a);
  const nb = toNum(b);
  if (na !== null && nb !== null) return na < nb ? -1 : na > nb ? 1 : 0;
  const sa = str(a);
  const sb = str(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function leaf(cond: Condition, record: Record_): boolean {
  const field = cond.field;
  if (typeof field !== "string") return false;
  const operator = typeof cond.operator === "string" ? cond.operator : "equals";
  const actual = record[field];
  const value = cond.value;
  switch (operator) {
    case "equals":
      return eq(actual, value);
    case "notEquals":
      return !eq(actual, value);
    case "gt":
      return compare(actual, value) > 0;
    case "gte":
      return compare(actual, value) >= 0;
    case "lt":
      return compare(actual, value) < 0;
    case "lte":
      return compare(actual, value) <= 0;
    case "contains":
      if (Array.isArray(actual)) return actual.some((e) => eq(e, value));
      return str(actual).includes(str(value));
    case "in":
      return Array.isArray(value) && value.some((e) => eq(e, actual));
    case "isEmpty":
      return isEmptyValue(actual);
    case "isNotEmpty":
      return !isEmptyValue(actual);
    default:
      return false;
  }
}

/** condition を record に対して評価する。null/空条件は true。 */
export function evaluateCondition(
  condition: Condition | null | undefined,
  record: Record_,
): boolean {
  if (condition == null || Object.keys(condition).length === 0) return true;
  if (Array.isArray(condition.all)) {
    return condition.all.every((c) => evaluateCondition(c as Condition, record));
  }
  if (Array.isArray(condition.any)) {
    return condition.any.some((c) => evaluateCondition(c as Condition, record));
  }
  if (condition.not != null && typeof condition.not === "object") {
    return !evaluateCondition(condition.not as Condition, record);
  }
  return leaf(condition, record);
}
