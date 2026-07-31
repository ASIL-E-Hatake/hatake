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

/** 請求明細の1行（金額と税率）。 */
export interface InvoiceLine {
  amount: number;
  /** 税率（分数。10% = 0.1、軽減 8% = 0.08）。 */
  rate: number;
}

/** 税率ごとの小計（computeInvoice の内訳の1件）。 */
export interface TaxRateSubtotal {
  rate: number;
  net: number;
  tax: number;
  gross: number;
}

/** 税率別合計（適格請求書向け）。byRate は税率の昇順、total は全体合計。 */
export interface TaxInvoice {
  byRate: TaxRateSubtotal[];
  total: TaxBreakdown;
}

export interface InvoiceOptions {
  /** 金額が税込かどうか（全行に適用、既定 false）。 */
  included?: boolean;
  /** 端数処理: "floor"(既定) | "round" | "ceil"。 */
  rounding?: string;
}

/**
 * 適格請求書（インボイス）向けに、明細を税率ごとに合計して内訳を返す。
 * **税率ごとに一度だけ**端数処理する（明細ごとに丸めない）。Dart / Java 版と同出力。
 */
export function computeInvoice(
  lines: InvoiceLine[],
  opts: InvoiceOptions = {},
): TaxInvoice {
  const included = opts.included === true;
  const rounding = opts.rounding ?? "floor";
  const sums = new Map<number, number>();
  for (const l of lines) sums.set(l.rate, (sums.get(l.rate) ?? 0) + l.amount);
  const rates = [...sums.keys()].sort((a, b) => a - b);
  const byRate: TaxRateSubtotal[] = [];
  let totalNet = 0;
  let totalTax = 0;
  let totalGross = 0;
  for (const rate of rates) {
    const b = computeTax(sums.get(rate) as number, { rate, included, rounding });
    byRate.push({ rate, net: b.net, tax: b.tax, gross: b.gross });
    totalNet += b.net;
    totalTax += b.tax;
    totalGross += b.gross;
  }
  return { byRate, total: { net: totalNet, tax: totalTax, gross: totalGross } };
}
