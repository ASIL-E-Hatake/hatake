import { ValidatorTypes, type ValidatorDefinition } from "./definition.js";

/** Validates a value against a rule; returns an error message or null. */
export type ValidatorFn = (
  value: unknown,
  def: ValidatorDefinition,
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

/** Built-in validators. Default messages are Japanese (overridable per rule). */
export const builtinValidators: Record<string, ValidatorFn> = {
  [ValidatorTypes.required]: (v) => (isEmpty(v) ? "必須項目です" : null),
  [ValidatorTypes.maxLength]: (v, d) => {
    const max = toNum(d.params.value);
    if (max == null || v == null) return null;
    return String(v).length > max ? `${max}文字以内で入力してください` : null;
  },
  [ValidatorTypes.minLength]: (v, d) => {
    const min = toNum(d.params.value);
    if (min == null || isEmpty(v)) return null;
    return String(v).length < min ? `${min}文字以上で入力してください` : null;
  },
  [ValidatorTypes.min]: (v, d) => {
    const min = toNum(d.params.value);
    const n = toNum(v);
    if (min == null || n == null) return null;
    return n < min ? `${min}以上で入力してください` : null;
  },
  [ValidatorTypes.max]: (v, d) => {
    const max = toNum(d.params.value);
    const n = toNum(v);
    if (max == null || n == null) return null;
    return n > max ? `${max}以下で入力してください` : null;
  },
  [ValidatorTypes.pattern]: (v, d) => {
    const src = d.params.pattern;
    if (typeof src !== "string" || isEmpty(v)) return null;
    return new RegExp(src).test(String(v)) ? null : "形式が正しくありません";
  },
  [ValidatorTypes.email]: (v) => {
    if (isEmpty(v)) return null;
    return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(String(v))
      ? null
      : "メールアドレスの形式が正しくありません";
  },
  [ValidatorTypes.postalCode]: (v) => {
    if (isEmpty(v)) return null;
    return /^\d{3}-?\d{4}$/.test(String(v))
      ? null
      : "郵便番号の形式が正しくありません";
  },
};

/** Resolves validator types to implementations. Extensible via `register`. */
export class ValidatorRegistry {
  private readonly validators: Record<string, ValidatorFn>;

  constructor(custom?: Record<string, ValidatorFn>) {
    this.validators = { ...builtinValidators, ...custom };
  }

  run(value: unknown, def: ValidatorDefinition): string | null {
    return this.validators[def.type]?.(value, def) ?? null;
  }

  register(type: string, fn: ValidatorFn): void {
    this.validators[type] = fn;
  }

  has(type: string): boolean {
    return type in this.validators;
  }
}
