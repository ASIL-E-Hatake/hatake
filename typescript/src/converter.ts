/** An input converter / normalizer. Returns the converted value. */
export type Converter = (
  value: unknown,
  options: Record<string, unknown>,
) => unknown;

function mapCodePoints(s: string, f: (cp: number) => number): string {
  let out = "";
  for (const ch of s) {
    out += String.fromCodePoint(f(ch.codePointAt(0)!));
  }
  return out;
}

const toHankaku = (s: string): string =>
  mapCodePoints(s, (cp) => {
    if (cp >= 0xff01 && cp <= 0xff5e) return cp - 0xfee0;
    if (cp === 0x3000) return 0x20;
    return cp;
  });

const toZenkaku = (s: string): string =>
  mapCodePoints(s, (cp) => {
    if (cp >= 0x21 && cp <= 0x7e) return cp + 0xfee0;
    if (cp === 0x20) return 0x3000;
    return cp;
  });

/** Built-in converters. Names are shared across language editions. */
export const builtinConverters: Record<string, Converter> = {
  toHankaku: (v) => (typeof v === "string" ? toHankaku(v) : v),
  toZenkaku: (v) => (typeof v === "string" ? toZenkaku(v) : v),
  hiraToKata: (v) =>
    typeof v === "string"
      ? mapCodePoints(v, (cp) => (cp >= 0x3041 && cp <= 0x3096 ? cp + 0x60 : cp))
      : v,
  kataToHira: (v) =>
    typeof v === "string"
      ? mapCodePoints(v, (cp) => (cp >= 0x30a1 && cp <= 0x30f6 ? cp - 0x60 : cp))
      : v,
  trim: (v) => (typeof v === "string" ? v.replace(/^[\s　]+|[\s　]+$/g, "") : v),
  collapseSpaces: (v) => (typeof v === "string" ? v.replace(/[\s　]+/g, " ") : v),
  parseNumber: (v) => {
    if (typeof v === "number") return v;
    if (typeof v !== "string") return v;
    const cleaned = toHankaku(v).replace(/,/g, "").trim();
    const n = Number(cleaned);
    return cleaned !== "" && !Number.isNaN(n) ? n : v;
  },
};

/** Resolves converter names to implementations. Extensible via `register`. */
export class ConverterRegistry {
  private readonly converters: Record<string, Converter>;

  constructor(custom?: Record<string, Converter>) {
    this.converters = { ...builtinConverters, ...custom };
  }

  convert(name: string, value: unknown, options: Record<string, unknown> = {}): unknown {
    const c = this.converters[name];
    return c ? c(value, options) : value;
  }

  /** Applies a chain of converters in order. */
  convertAll(names: string[], value: unknown): unknown {
    return names.reduce((current, name) => this.convert(name, current), value);
  }

  register(name: string, converter: Converter): void {
    this.converters[name] = converter;
  }

  has(name: string): boolean {
    return name in this.converters;
  }
}
