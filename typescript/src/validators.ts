import { ValidatorTypes, type ValidatorDefinition } from "./definition.js";
import { MessageResolver } from "./messageResolver.js";

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
  };
}

/** Resolves validator types to implementations. Extensible via `register`. */
export class ValidatorRegistry {
  private readonly validators: Record<string, ValidatorFn>;

  constructor(custom?: Record<string, ValidatorFn>, messages?: MessageResolver) {
    this.validators = { ...builtinValidators(messages), ...custom };
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
