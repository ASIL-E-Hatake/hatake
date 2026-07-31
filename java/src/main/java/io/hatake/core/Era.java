package io.hatake.core;

import java.util.List;

/**
 * 元号（和暦）の算出。組込みの元号テーブルを {@code wareki} フォーマッタと共有する。
 * Dart / TypeScript 版と同一テーブル・同出力。
 */
public final class Era {
    private Era() {
    }

    /** 元号の定義（改元日 y/m/d で区切る）。 */
    public record EraDef(String name, String abbr, int y, int m, int d) {
    }

    /** eraOf の結果。元号名・略記・和暦年（元年 = 1）。 */
    public record EraDate(String name, String abbr, int year) {
    }

    /** 組込みの元号テーブル（新しい順）。 */
    public static final List<EraDef> ERAS = List.of(
            new EraDef("令和", "R", 2019, 5, 1),
            new EraDef("平成", "H", 1989, 1, 8),
            new EraDef("昭和", "S", 1926, 12, 25),
            new EraDef("大正", "T", 1912, 7, 30),
            new EraDef("明治", "M", 1868, 10, 23));

    private static int cmp(int y, int m, int d, EraDef e) {
        if (y != e.y()) {
            return y - e.y();
        }
        if (m != e.m()) {
            return m - e.m();
        }
        return d - e.d();
    }

    /** ymd から元号を算出する（明治より前は null）。 */
    public static EraDate eraOfYmd(int y, int m, int d) {
        for (EraDef e : ERAS) {
            if (cmp(y, m, d, e) >= 0) {
                return new EraDate(e.name(), e.abbr(), y - e.y() + 1);
            }
        }
        return null;
    }

    /** 日付（yyyy-MM-dd）の元号を算出する（明治より前は null）。 */
    public static EraDate eraOf(String date) {
        var dt = Dates.parse(date);
        return eraOfYmd(dt.getYear(), dt.getMonthValue(), dt.getDayOfMonth());
    }
}
