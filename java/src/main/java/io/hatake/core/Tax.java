package io.hatake.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 消費税の計算ユーティリティ。Dart / TypeScript 版と同名・同出力。
 */
public final class Tax {

    private Tax() {
    }

    /** 税抜 (net) / 税額 (tax) / 税込 (gross) の内訳（すべて整数円）。 */
    public record TaxBreakdown(long net, long tax, long gross) {
    }

    // 浮動小数の誤差を 1e-6 グリッドで消してから丸める（3言語で同一実装）。
    private static long applyRounding(double value, String mode) {
        double v = Math.round(value * 1_000_000.0) / 1_000_000.0;
        return switch (mode) {
            case "ceil" -> (long) Math.ceil(v);
            case "round" -> Math.round(v);
            default -> (long) Math.floor(v);
        };
    }

    /**
     * 消費税を計算して内訳を返す。
     *
     * @param amount   included=false なら税抜、true なら税込。
     * @param rate     税率（分数。10% = 0.1、軽減 8% = 0.08）。
     * @param included amount が税込かどうか。
     * @param rounding "floor"(既定) / "round" / "ceil"。
     */
    public static TaxBreakdown compute(double amount, double rate, boolean included, String rounding) {
        if (included) {
            long gross = Math.round(amount);
            long net = applyRounding(amount / (1 + rate), rounding);
            return new TaxBreakdown(net, gross - net, gross);
        }
        long net = Math.round(amount);
        long tax = applyRounding(amount * rate, rounding);
        return new TaxBreakdown(net, tax, net + tax);
    }

    /** 外税・切り捨ての簡易版。 */
    public static TaxBreakdown compute(double amount, double rate) {
        return compute(amount, rate, false, "floor");
    }

    /** 請求明細の1行（金額と税率）。 */
    public record InvoiceLine(double amount, double rate) {
    }

    /** 税率ごとの小計（computeInvoice の内訳の1件）。 */
    public record TaxRateSubtotal(double rate, long net, long tax, long gross) {
    }

    /** 税率別合計（適格請求書向け）。byRate は税率の昇順、total は全体合計。 */
    public record TaxInvoice(List<TaxRateSubtotal> byRate, TaxBreakdown total) {
    }

    /**
     * 適格請求書（インボイス）向けに、明細を税率ごとに合計して内訳を返す。
     * <b>税率ごとに一度だけ</b>端数処理する（明細ごとに丸めない）。
     *
     * @param lines    請求明細。
     * @param included 金額が税込かどうか（全行に適用）。
     * @param rounding "floor"(既定) / "round" / "ceil"。
     */
    public static TaxInvoice computeInvoice(List<InvoiceLine> lines, boolean included, String rounding) {
        // TreeMap で税率の昇順に集計する。
        Map<Double, Double> sums = new TreeMap<>();
        for (InvoiceLine l : lines) {
            sums.merge(l.rate(), l.amount(), Double::sum);
        }
        List<TaxRateSubtotal> byRate = new ArrayList<>();
        long totalNet = 0;
        long totalTax = 0;
        long totalGross = 0;
        for (Map.Entry<Double, Double> e : sums.entrySet()) {
            TaxBreakdown b = compute(e.getValue(), e.getKey(), included, rounding);
            byRate.add(new TaxRateSubtotal(e.getKey(), b.net(), b.tax(), b.gross()));
            totalNet += b.net();
            totalTax += b.tax();
            totalGross += b.gross();
        }
        return new TaxInvoice(byRate, new TaxBreakdown(totalNet, totalTax, totalGross));
    }

    /** 外税・切り捨ての簡易版。 */
    public static TaxInvoice computeInvoice(List<InvoiceLine> lines) {
        return computeInvoice(lines, false, "floor");
    }
}
