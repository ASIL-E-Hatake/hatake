package io.hatake.core;

import java.time.LocalDate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Internal date helper shared by the domain utils. */
final class Dates {
    private Dates() {
    }

    static LocalDate parse(String date) {
        Matcher m = Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2})").matcher(date);
        if (m.find()) {
            return LocalDate.of(
                    Integer.parseInt(m.group(1)),
                    Integer.parseInt(m.group(2)),
                    Integer.parseInt(m.group(3)));
        }
        return LocalDate.parse(date);
    }
}
