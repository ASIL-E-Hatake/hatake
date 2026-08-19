import { builtinAggregates } from "./aggregate.js";
import { ValidatorTypes, type ValidatorDefinition } from "./definition.js";
import { MessageResolver } from "./messageResolver.js";

/**
 * 検証のときに「その項目の値以外」が要るときの持ち物。
 *
 * 項目間の検証（`compare`）は**他の項目の値**を見る。値だけ渡す形では書けないので、
 * レコードごと渡す。ラベルも一緒に渡すのは、メッセージを**画面の言葉**で出すため
 * （「startDate 以上にしてください」ではなく「開始日 以上にしてください」）。
 *
 * 引数を増やすたびに拡張の署名が変わると、足すたびにプラグインが壊れる。だから
 * **1つのオブジェクト**にまとめてある（要るものが増えてもキーが増えるだけ）。
 */
export interface ValidatorContext {
  /** 検証しているレコード全体。 */
  record?: Record<string, unknown>;
  /** 項目名 → ラベル。 */
  labels?: Record<string, string>;
  /** `{ mode: create }` のような状態。 */
  mode?: string;
}

/**
 * Validates a value against a rule; returns an error message or null.
 *
 * 第3引数は任意（[ValidatorContext]）。今までの2引数の関数もそのまま渡せる。
 */
export type ValidatorFn = (
  value: unknown,
  def: ValidatorDefinition,
  context?: ValidatorContext,
) => string | null;

const isEmpty = (v: unknown): boolean =>
  v == null ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

const toNum = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
};

/**
 * Built-in validators. Messages are resolved via a `MessageResolver` (default
 * locale Japanese) so they can be localized; per-rule override still wins.
 */
export function builtinValidators(
  messages: MessageResolver = new MessageResolver(),
): Record<string, ValidatorFn> {
  const m = messages;
  return {
    [ValidatorTypes.required]: (v) => (isEmpty(v) ? m.resolve("required") : null),
    [ValidatorTypes.maxLength]: (v, d) => {
      const max = toNum(d.params.value);
      if (max == null || v == null) return null;
      return String(v).length > max
        ? m.resolve("maxLength", { value: max })
        : null;
    },
    [ValidatorTypes.minLength]: (v, d) => {
      const min = toNum(d.params.value);
      if (min == null || isEmpty(v)) return null;
      return String(v).length < min
        ? m.resolve("minLength", { value: min })
        : null;
    },
    [ValidatorTypes.min]: (v, d) => {
      const min = toNum(d.params.value);
      const n = toNum(v);
      if (min == null || n == null) return null;
      return n < min ? m.resolve("min", { value: min }) : null;
    },
    [ValidatorTypes.max]: (v, d) => {
      const max = toNum(d.params.value);
      const n = toNum(v);
      if (max == null || n == null) return null;
      return n > max ? m.resolve("max", { value: max }) : null;
    },
    [ValidatorTypes.pattern]: (v, d) => {
      const src = d.params.pattern;
      if (typeof src !== "string" || isEmpty(v)) return null;
      return new RegExp(src).test(String(v)) ? null : m.resolve("pattern");
    },
    [ValidatorTypes.email]: (v) => {
      if (isEmpty(v)) return null;
      return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(String(v))
        ? null
        : m.resolve("email");
    },
    [ValidatorTypes.postalCode]: (v) => {
      if (isEmpty(v)) return null;
      return /^\d{3}-?\d{4}$/.test(String(v)) ? null : m.resolve("postalCode");
    },
    [ValidatorTypes.compare]: (v, d, context) => compare(v, d, context ?? {}, m),
  };
}

/** `compare` で使える突合（大小を比べられるものだけ）。 */
export const COMPARE_OPERATORS = [
  "equals",
  "notEquals",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;

/**
 * 項目間の検証（「終了日 は 開始日 以上」「合計 は 明細の和と同じ」）。
 *
 * 比べ方は**数として読めれば数、読めなければ文字**。ISO の日付（`2026-01-05`）は
 * 桁が揃っているので文字の大小＝日付の前後になるので、日付型を持ち込まずに済む
 * （3つのエディションで同じ答えを出すのが最優先。日付の解釈は言語ごとに違う）。
 *
 * 判定できないときは**通す**（黙って落とさない）:
 *   ・自分が空 … `required` の担当
 *   ・相手が空・相手の項目が無い … 相手側の検証の担当
 *   ・`field` が無い / 突合が使えない … 書き方の間違い。`hatake validate` が警告で言う
 */
function compare(
  value: unknown,
  def: ValidatorDefinition,
  context: ValidatorContext,
  messages: MessageResolver,
): string | null {
  const target = typeof def.params.field === "string" ? def.params.field : undefined;
  const operator =
    typeof def.params.operator === "string" ? def.params.operator : "gte";
  if (target === undefined || !COMPARE_OPERATORS.includes(operator as never)) {
    return null;
  }
  if (isEmpty(value)) return null;

  const record = context.record ?? {};
  const other = compareTo(record[target], def);
  if (other === undefined || isEmpty(other)) return null;

  const label = context.labels?.[target] ?? target;
  const aggregate =
    typeof def.params.aggregate === "string" ? def.params.aggregate : undefined;
  return holds(value, operator, other)
    ? null
    : messages.resolve(`compare.${operator}`, {
        target: aggregate === undefined ? label : `${label} の ${aggregate}`,
      });
}

/**
 * 比べる相手の値。`aggregate` があれば**明細を畳んだ数**（「合計＝明細の和」）。
 *
 * 畳み込みはダッシュボードと同じ実装を使う（同じ集約を2つ持たない）。
 */
function compareTo(raw: unknown, def: ValidatorDefinition): unknown {
  const aggregate =
    typeof def.params.aggregate === "string" ? def.params.aggregate : undefined;
  if (aggregate === undefined) return raw;
  const fold = builtinAggregates[aggregate];
  if (fold === undefined) return undefined;
  const rows = Array.isArray(raw)
    ? raw.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null && !Array.isArray(row),
      )
    : [];
  const of = typeof def.params.of === "string" ? def.params.of : undefined;
  return fold(rows, of);
}

/** 突合そのもの。数として読めれば数、読めなければ文字（ISO の日付はこれで前後が合う）。 */
function holds(value: unknown, operator: string, other: unknown): boolean {
  const left = toNum(value);
  const right = toNum(other);
  const [a, b]: [number | string, number | string] =
    left !== null && right !== null
      ? [left, right]
      : [String(value), String(other)];
  switch (operator) {
    case "equals":
      return a === b;
    case "notEquals":
      return a !== b;
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    default:
      return a <= b;
  }
}

/** Resolves validator types to implementations. Extensible via `register`. */
export class ValidatorRegistry {
  private readonly validators: Record<string, ValidatorFn>;

  constructor(custom?: Record<string, ValidatorFn>, messages?: MessageResolver) {
    this.validators = { ...builtinValidators(messages), ...custom };
  }

  run(
    value: unknown,
    def: ValidatorDefinition,
    context?: ValidatorContext,
  ): string | null {
    return this.validators[def.type]?.(value, def, context) ?? null;
  }

  register(type: string, fn: ValidatorFn): void {
    this.validators[type] = fn;
  }

  has(type: string): boolean {
    return type in this.validators;
  }
}
