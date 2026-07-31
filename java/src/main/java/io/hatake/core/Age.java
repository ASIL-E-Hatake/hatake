package io.hatake.core;

import java.time.LocalDate;

/** 年齢・勤続年数。Dart / TypeScript 版と同一。 */
public final class Age {
    private Age() {
    }

    public record Tenure(int years, int months) {
    }

    public static Tenure tenure(String from, String to) {
        LocalDate a = Dates.parse(from);
        LocalDate b = Dates.parse(to);
        int months = (b.getYear() - a.getYear()) * 12 + (b.getMonthValue() - a.getMonthValue());
        if (b.getDayOfMonth() < a.getDayOfMonth()) {
            months -= 1;
        }
        return new Tenure(months / 12, months % 12);
    }

    public static int ageAt(String birth, String asOf) {
        return tenure(birth, asOf).years();
    }
}
