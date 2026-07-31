package io.hatake.core;

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
}
