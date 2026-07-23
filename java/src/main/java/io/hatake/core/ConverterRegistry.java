package io.hatake.core;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Resolves input converter names to implementations. Built-ins and names are
 * shared with the other language editions.
 */
public final class ConverterRegistry {

    /** Transforms a value (usually before validation/persistence). */
    @FunctionalInterface
    public interface Converter {
        Object convert(Object value, Map<String, Object> options);
    }

    private final Map<String, Converter> converters = new HashMap<>();

    public ConverterRegistry() {
        converters.putAll(builtins());
    }

    public ConverterRegistry(Map<String, Converter> custom) {
        converters.putAll(builtins());
        converters.putAll(custom);
    }

    public Object convert(String name, Object value) {
        return convert(name, value, Map.of());
    }

    public Object convert(String name, Object value, Map<String, Object> options) {
        Converter c = converters.get(name);
        return c == null ? value : c.convert(value, options);
    }

    /** Applies a chain of converters in order. */
    public Object convertAll(List<String> names, Object value) {
        Object current = value;
        for (String name : names) {
            current = convert(name, current);
        }
        return current;
    }

    public void register(String name, Converter converter) {
        converters.put(name, converter);
    }

    public boolean has(String name) {
        return converters.containsKey(name);
    }

    private static String mapCodePoints(String s, java.util.function.IntUnaryOperator f) {
        StringBuilder sb = new StringBuilder();
        s.codePoints().forEach(cp -> sb.appendCodePoint(f.applyAsInt(cp)));
        return sb.toString();
    }

    private static String toHankaku(String s) {
        return mapCodePoints(s, cp -> {
            if (cp >= 0xFF01 && cp <= 0xFF5E) {
                return cp - 0xFEE0;
            }
            if (cp == 0x3000) {
                return 0x20;
            }
            return cp;
        });
    }

    private static String toZenkaku(String s) {
        return mapCodePoints(s, cp -> {
            if (cp >= 0x21 && cp <= 0x7E) {
                return cp + 0xFEE0;
            }
            if (cp == 0x20) {
                return 0x3000;
            }
            return cp;
        });
    }

    private static Map<String, Converter> builtins() {
        Map<String, Converter> m = new HashMap<>();
        m.put("toHankaku", (v, o) -> v instanceof String s ? toHankaku(s) : v);
        m.put("toZenkaku", (v, o) -> v instanceof String s ? toZenkaku(s) : v);
        m.put("hiraToKata", (v, o) -> v instanceof String s
                ? mapCodePoints(s, cp -> cp >= 0x3041 && cp <= 0x3096 ? cp + 0x60 : cp) : v);
        m.put("kataToHira", (v, o) -> v instanceof String s
                ? mapCodePoints(s, cp -> cp >= 0x30A1 && cp <= 0x30F6 ? cp - 0x60 : cp) : v);
        m.put("trim", (v, o) -> v instanceof String s ? s.replaceAll("^[\\s　]+|[\\s　]+$", "") : v);
        m.put("collapseSpaces", (v, o) -> v instanceof String s ? s.replaceAll("[\\s　]+", " ") : v);
        m.put("parseNumber", (v, o) -> {
            if (v instanceof Number) {
                return v;
            }
            if (!(v instanceof String s)) {
                return v;
            }
            String cleaned = toHankaku(s).replace(",", "").trim();
            if (cleaned.isEmpty()) {
                return v;
            }
            try {
                if (cleaned.matches("-?\\d+")) {
                    return Long.parseLong(cleaned);
                }
                return Double.parseDouble(cleaned);
            } catch (NumberFormatException e) {
                return v;
            }
        });
        return m;
    }
}
