/** 税抜 (net) / 税額 (tax) / 税込 (gross) の内訳（すべて整数円）。 */
export interface TaxBreakdown {
  net: number;
  tax: number;
  gross: number;
}

export interface TaxOptions {
  /** 税率（分数。10% = 0.1、軽減 8% = 0.08）。 */
  rate: number;
  /** amount が税込かどうか（既定 false = 税抜）。 */
  included?: boolean;
  /** 端数処理: "floor"(既定) | "round" | "ceil"。 */
  rounding?: string;
}

// 浮動小数の誤差を 1e-6 グリッドで消してから丸める（3言語で同一実装）。
function applyRounding(value: number, mode: string): number {
  const v = Math.round(value * 1_000_000) / 1_000_000;
  switch (mode) {
    case "ceil":
      return Math.ceil(v);
    case "round":
      return Math.round(v);
    default:
      return Math.floor(v);
  }
}

/** 消費税を計算して内訳を返す。Dart / Java 版と同名・同出力。 */
export function computeTax(amount: number, opts: TaxOptions): TaxBreakdown {
  const rate = opts.rate;
  const rounding = opts.rounding ?? "floor";
  if (opts.included) {
    const gross = Math.round(amount);
    const net = applyRounding(amount / (1 + rate), rounding);
    return { net, tax: gross - net, gross };
  }
  const net = Math.round(amount);
  const tax = applyRounding(amount * rate, rounding);
  return { net, tax, gross: net + tax };
}
