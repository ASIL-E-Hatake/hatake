package io.hatake.core;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Resolves display format names to implementations. Built-ins and names are
 * shared with the other language editions.
 */
public final class FormatterRegistry {

    /** Turns a value into a display string using options. */
    @FunctionalInterface
    public interface Formatter {
        String format(Object value, Map<String, Object> options);
    }

    private record Era(String name, String abbr, int y, int m, int d) {
    }

    private static final List<Era> ERAS = List.of(
            new Era("令和", "R", 2019, 5, 1),
            new Era("平成", "H", 1989, 1, 8),
            new Era("昭和", "S", 1926, 12, 25),
            new Era("大正", "T", 1912, 7, 30),
            new Era("明治", "M", 1868, 10, 23));

    private final Map<String, Formatter> formatters = new HashMap<>();

    public FormatterRegistry() {
        formatters.putAll(builtins());
    }

    public FormatterRegistry(Map<String, Formatter> custom) {
        formatters.putAll(builtins());
        formatters.putAll(custom);
    }

    public String format(String name, Object value) {
        return format(name, value, Map.of());
    }

    public String format(String name, Object value, Map<String, Object> options) {
        Formatter f = formatters.get(name);
        return f == null ? str(value) : f.format(value, options);
    }

    public void register(String name, Formatter formatter) {
        formatters.put(name, formatter);
    }

    public boolean has(String name) {
        return formatters.containsKey(name);
    }

    private static String str(Object v) {
        return v == null ? "" : v.toString();
    }

    private static Double toNum(Object v) {
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        if (v instanceof String s) {
            try {
                return Double.parseDouble(s.replace(",", ""));
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static int intOpt(Map<String, Object> o, String key, int fallback) {
        return o.get(key) instanceof Number n ? n.intValue() : fallback;
    }

    private static String grouped(double value, int decimals) {
        String fixed = BigDecimal.valueOf(value)
                .setScale(decimals, RoundingMode.HALF_UP).toPlainString();
        int dot = fixed.indexOf('.');
        String intPart = dot < 0 ? fixed : fixed.substring(0, dot);
        String frac = dot < 0 ? null : fixed.substring(dot + 1);
        StringBuilder sb = new StringBuilder();
        int len = intPart.length();
        for (int i = 0; i < len; i++) {
            if (i > 0 && (len - i) % 3 == 0) {
                sb.append(',');
            }
            sb.append(intPart.charAt(i));
        }
        return frac == null ? sb.toString() : sb + "." + frac;
    }

    private static int[] ymd(Object v) {
        if (v instanceof LocalDate d) {
            return new int[] {d.getYear(), d.getMonthValue(), d.getDayOfMonth()};
        }
        if (v instanceof String s) {
            Matcher m = Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2})").matcher(s);
            if (m.find()) {
                return new int[] {
                    Integer.parseInt(m.group(1)),
                    Integer.parseInt(m.group(2)),
                    Integer.parseInt(m.group(3))
                };
            }
        }
        return null;
    }

    private static String two(int v) {
        return String.format("%02d", v);
    }

    private static String formatDatePattern(int y, int mo, int d, String pattern) {
        return pattern
                .replace("yyyy", String.format("%04d", y))
                .replace("MM", two(mo))
                .replace("dd", two(d))
                .replace("M", String.valueOf(mo))
                .replace("d", String.valueOf(d));
    }

    private static int cmp(int[] a, Era e) {
        if (a[0] != e.y()) {
            return a[0] - e.y();
        }
        if (a[1] != e.m()) {
            return a[1] - e.m();
        }
        return a[2] - e.d();
    }

    private static Map<String, Formatter> builtins() {
        Map<String, Formatter> m = new HashMap<>();
        m.put("currency", (value, o) -> {
            Double n = toNum(value);
            if (n == null) {
                return str(value);
            }
            String body = (o.get("symbol") instanceof String s ? s : "")
                    + grouped(Math.abs(n), intOpt(o, "decimals", 0));
            if (n < 0) {
                return switch (o.get("negative") instanceof String s ? s : "minus") {
                    case "triangle" -> "△" + body;
                    case "blackTriangle" -> "▲" + body;
                    case "paren" -> "(" + body + ")";
                    default -> "-" + body;
                };
            }
            return body;
        });
        m.put("percent", (value, o) -> {
            Double n = toNum(value);
            if (n == null) {
                return str(value);
            }
            double v = Boolean.TRUE.equals(o.get("ratio")) ? n * 100 : n;
            return grouped(v, intOpt(o, "decimals", 2)) + "%";
        });
        m.put("date", (value, o) -> {
            int[] d = ymd(value);
            if (d == null) {
                return str(value);
            }
            String pattern = o.get("pattern") instanceof String s ? s : "yyyy/MM/dd";
            return formatDatePattern(d[0], d[1], d[2], pattern);
        });
        m.put("wareki", (value, o) -> {
            int[] d = ymd(value);
            if (d == null) {
                return str(value);
            }
            Era era = null;
            for (Era e : ERAS) {
                if (cmp(d, e) >= 0) {
                    era = e;
                    break;
                }
            }
            if (era == null) {
                return formatDatePattern(d[0], d[1], d[2], "yyyy/MM/dd");
            }
            int year = d[0] - era.y() + 1;
            if ("short".equals(o.get("style"))) {
                return era.abbr() + year + "/" + two(d[1]) + "/" + two(d[2]);
            }
            String y = year == 1 ? "元" : String.valueOf(year);
            return era.name() + y + "年" + d[1] + "月" + d[2] + "日";
        });
        m.put("postal", (value, o) -> {
            String digits = str(value).replaceAll("[^0-9]", "");
            if (digits.length() != 7) {
                return str(value);
            }
            return digits.substring(0, 3) + "-" + digits.substring(3);
        });
        m.put("mask", (value, o) -> {
            String s = str(value);
            int keep = intOpt(o, "keep", 4);
            String ch = o.get("char") instanceof String c ? c : "*";
            if (s.length() <= keep) {
                return s;
            }
            return ch.repeat(s.length() - keep) + s.substring(s.length() - keep);
        });
        return m;
    }
}
