package io.hatake.core;

import java.time.LocalDate;

/** 会計年度・四半期・半期。開始月で調整。Dart / TypeScript 版と同一。 */
public final class Fiscal {
    private Fiscal() {
    }

    private static int monthIndex(int month, int startMonth) {
        return (month - startMonth + 12) % 12;
    }

    public static int fiscalYear(String date, int startMonth) {
        LocalDate d = Dates.parse(date);
        return d.getMonthValue() >= startMonth ? d.getYear() : d.getYear() - 1;
    }

    public static int fiscalYear(String date) {
        return fiscalYear(date, 4);
    }

    public static int fiscalQuarter(String date, int startMonth) {
        return monthIndex(Dates.parse(date).getMonthValue(), startMonth) / 3 + 1;
    }

    public static int fiscalQuarter(String date) {
        return fiscalQuarter(date, 4);
    }

    public static int fiscalHalf(String date, int startMonth) {
        return monthIndex(Dates.parse(date).getMonthValue(), startMonth) / 6 + 1;
    }

    public static int fiscalHalf(String date) {
        return fiscalHalf(date, 4);
    }
}
