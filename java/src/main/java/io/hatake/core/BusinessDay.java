package io.hatake.core;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Set;

/**
 * 営業日ユーティリティ。土日＋注入された祝日集合を「休み」とみなす。
 * 祝日カレンダーは外部データなので引数で渡す（`yyyy-MM-dd` 文字列）。
 * Dart / TypeScript 版と同一。
 */
public final class BusinessDay {
    private BusinessDay() {
    }

    private static boolean isHoliday(LocalDate d, Set<String> holidays) {
        DayOfWeek w = d.getDayOfWeek();
        return w == DayOfWeek.SATURDAY || w == DayOfWeek.SUNDAY || holidays.contains(d.toString());
    }

    public static boolean isBusinessDay(String date, Set<String> holidays) {
        return !isHoliday(Dates.parse(date), holidays);
    }

    public static boolean isBusinessDay(String date) {
        return isBusinessDay(date, Set.of());
    }

    public static String nextBusinessDay(String date, Set<String> holidays) {
        LocalDate d = Dates.parse(date).plusDays(1);
        while (isHoliday(d, holidays)) {
            d = d.plusDays(1);
        }
        return d.toString();
    }

    public static String prevBusinessDay(String date, Set<String> holidays) {
        LocalDate d = Dates.parse(date).minusDays(1);
        while (isHoliday(d, holidays)) {
            d = d.minusDays(1);
        }
        return d.toString();
    }
}
