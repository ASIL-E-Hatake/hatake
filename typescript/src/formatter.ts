import { eraOfYmd } from "./era.js";

/** A display formatter: turns a value into a display string using options. */
export type Formatter = (
  value: unknown,
  options: Record<string, unknown>,
) => string;

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function ymd(v: unknown): { y: number; m: number; d: number } | null {
  if (v instanceof Date) {
    return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    const dd = new Date(v);
    if (!Number.isNaN(dd.getTime())) {
      return { y: dd.getFullYear(), m: dd.getMonth() + 1, d: dd.getDate() };
    }
  }
  return null;
}

const intOpt = (o: Record<string, unknown>, k: string): number | undefined =>
  typeof o[k] === "number" ? Math.trunc(o[k] as number) : undefined;

const two = (v: number): string => String(v).padStart(2, "0");

function grouped(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const [intPart, frac] = fixed.split(".");
  let s = "";
  for (let i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 === 0) s += ",";
    s += intPart[i];
  }
  return frac !== undefined ? `${s}.${frac}` : s;
}

function formatDatePattern(
  d: { y: number; m: number; d: number },
  pattern: string,
): string {
  return pattern
    .replace(/yyyy/g, String(d.y).padStart(4, "0"))
    .replace(/MM/g, two(d.m))
    .replace(/dd/g, two(d.d))
    .replace(/M/g, String(d.m))
    .replace(/d/g, String(d.d));
}

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Built-in formatters. Names are shared across language editions. */
export const builtinFormatters: Record<string, Formatter> = {
  currency: (value, o) => {
    const n = toNum(value);
    if (n === null) return str(value);
    const decimals = intOpt(o, "decimals") ?? 0;
    const symbol = (o.symbol as string) ?? "";
    const negative = (o.negative as string) ?? "minus";
    const body = symbol + grouped(Math.abs(n), decimals);
    if (n < 0) {
      switch (negative) {
        case "triangle":
          return `△${body}`;
        case "blackTriangle":
          return `▲${body}`;
        case "paren":
          return `(${body})`;
        default:
          return `-${body}`;
      }
    }
    return body;
  },

  percent: (value, o) => {
    const n = toNum(value);
    if (n === null) return str(value);
    const decimals = intOpt(o, "decimals") ?? 2;
    const v = o.ratio === true ? n * 100 : n;
    return `${grouped(v, decimals)}%`;
  },

  date: (value, o) => {
    const d = ymd(value);
    if (d === null) return str(value);
    return formatDatePattern(d, (o.pattern as string) ?? "yyyy/MM/dd");
  },

  wareki: (value, o) => {
    const d = ymd(value);
    if (d === null) return str(value);
    const ed = eraOfYmd(d);
    if (!ed) return formatDatePattern(d, "yyyy/MM/dd");
    if ((o.style as string) === "short") {
      return `${ed.abbr}${ed.year}/${two(d.m)}/${two(d.d)}`;
    }
    return `${ed.name}${ed.year === 1 ? "元" : ed.year}年${d.m}月${d.d}日`;
  },

  postal: (value, o) => {
    const digits = str(value).replace(/[^0-9]/g, "");
    if (digits.length !== 7) return str(value);
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  },

  mask: (value, o) => {
    const s = str(value);
    const keep = intOpt(o, "keep") ?? 4;
    const ch = (o.char as string) ?? "*";
    if (s.length <= keep) return s;
    return ch.repeat(s.length - keep) + s.slice(s.length - keep);
  },
};

/** Resolves format names to implementations. Extensible via `register`. */
export class FormatterRegistry {
  private readonly formatters: Record<string, Formatter>;

  constructor(custom?: Record<string, Formatter>) {
    this.formatters = { ...builtinFormatters, ...custom };
  }

  format(name: string, value: unknown, options: Record<string, unknown> = {}): string {
    const f = this.formatters[name];
    return f ? f(value, options) : str(value);
  }

  register(name: string, formatter: Formatter): void {
    this.formatters[name] = formatter;
  }

  has(name: string): boolean {
    return name in this.formatters;
  }
}
