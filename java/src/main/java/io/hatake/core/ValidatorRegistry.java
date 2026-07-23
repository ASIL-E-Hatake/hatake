package io.hatake.core;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Resolves validator types to implementations. Built-ins mirror the shared
 * spec; register custom validators (plugins) without modifying the framework.
 */
public final class ValidatorRegistry {

    /** Validates a value against a rule; returns an error message or null. */
    @FunctionalInterface
    public interface Validator {
        String run(Object value, ValidatorDefinition def);
    }

    private final Map<String, Validator> validators = new HashMap<>();

    public ValidatorRegistry() {
        validators.putAll(builtins());
    }

    public ValidatorRegistry(Map<String, Validator> custom) {
        validators.putAll(builtins());
        validators.putAll(custom);
    }

    public String run(Object value, ValidatorDefinition def) {
        Validator fn = validators.get(def.type());
        return fn == null ? null : fn.run(value, def);
    }

    public void register(String type, Validator fn) {
        validators.put(type, fn);
    }

    public boolean has(String type) {
        return validators.containsKey(type);
    }

    private static boolean isEmpty(Object v) {
        return v == null
                || (v instanceof String s && s.isBlank())
                || (v instanceof java.util.Collection<?> c && c.isEmpty());
    }

    private static Double toNum(Object v) {
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        if (v instanceof String s) {
            try {
                return Double.parseDouble(s);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static Integer intParam(ValidatorDefinition def) {
        Object v = def.params().get("value");
        return v instanceof Number n ? n.intValue() : null;
    }

    private static Map<String, Validator> builtins() {
        Map<String, Validator> m = new HashMap<>();
        m.put("required", (v, d) -> isEmpty(v) ? "必須項目です" : null);
        m.put("maxLength", (v, d) -> {
            Integer max = intParam(d);
            if (max == null || v == null) {
                return null;
            }
            return v.toString().length() > max ? max + "文字以内で入力してください" : null;
        });
        m.put("minLength", (v, d) -> {
            Integer min = intParam(d);
            if (min == null || isEmpty(v)) {
                return null;
            }
            return v.toString().length() < min ? min + "文字以上で入力してください" : null;
        });
        m.put("min", (v, d) -> {
            Double min = toNum(d.params().get("value"));
            Double n = toNum(v);
            if (min == null || n == null) {
                return null;
            }
            return n < min ? formatNum(min) + "以上で入力してください" : null;
        });
        m.put("max", (v, d) -> {
            Double max = toNum(d.params().get("value"));
            Double n = toNum(v);
            if (max == null || n == null) {
                return null;
            }
            return n > max ? formatNum(max) + "以下で入力してください" : null;
        });
        m.put("pattern", (v, d) -> {
            Object src = d.params().get("pattern");
            if (!(src instanceof String p) || isEmpty(v)) {
                return null;
            }
            return Pattern.matches(p, v.toString()) ? null : "形式が正しくありません";
        });
        m.put("email", (v, d) -> {
            if (isEmpty(v)) {
                return null;
            }
            return Pattern.matches("^[\\w.+-]+@[\\w-]+\\.[\\w.-]+$", v.toString())
                    ? null
                    : "メールアドレスの形式が正しくありません";
        });
        m.put("postalCode", (v, d) -> {
            if (isEmpty(v)) {
                return null;
            }
            return Pattern.matches("^\\d{3}-?\\d{4}$", v.toString())
                    ? null
                    : "郵便番号の形式が正しくありません";
        });
        return m;
    }

    private static String formatNum(double d) {
        return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d);
    }
}
