package io.hatake.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 計算項目（computed）をレコードから導出する。{@code {op, fields, separator?}}。
 * 組込み concat / sum / subtract / product。Dart / TypeScript 版と同結果。
 */
public final class Computed {

    /** 1つの計算オペレーションの実装。 */
    @FunctionalInterface
    public interface ComputedFn {
        Object compute(Map<String, Object> computed, Map<String, Object> record);
    }

    private final Map<String, ComputedFn> ops = new HashMap<>();

    public Computed() {
        ops.putAll(builtins());
    }

    public Computed(Map<String, ComputedFn> custom) {
        ops.putAll(builtins());
        ops.putAll(custom);
    }

    /** computed を record から計算する。op が未登録なら null。 */
    public Object compute(Map<String, Object> computed, Map<String, Object> record) {
        if (computed == null || !(computed.get("op") instanceof String op)) {
            return null;
        }
        ComputedFn fn = ops.get(op);
        return fn == null ? null : fn.compute(computed, record);
    }

    public void register(String op, ComputedFn fn) {
        ops.put(op, fn);
    }

    public boolean has(String op) {
        return ops.containsKey(op);
    }

    private static Double toNum(Object v) {
        if (v instanceof Boolean) {
            return null;
        }
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        if (v instanceof String s) {
            try {
                return Double.parseDouble(s.trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static String str(Object v) {
        return v == null ? "" : v.toString();
    }

    @SuppressWarnings("unchecked")
    private static List<String> fieldsOf(Map<String, Object> c) {
        List<String> result = new ArrayList<>();
        if (c.get("fields") instanceof List<?> list) {
            for (Object f : list) {
                result.add(String.valueOf(f));
            }
        }
        return result;
    }

    private static Map<String, ComputedFn> builtins() {
        Map<String, ComputedFn> m = new HashMap<>();
        m.put("concat", (c, r) -> {
            String sep = c.get("separator") != null ? c.get("separator").toString() : "";
            StringBuilder sb = new StringBuilder();
            List<String> fields = fieldsOf(c);
            for (int i = 0; i < fields.size(); i++) {
                if (i > 0) {
                    sb.append(sep);
                }
                sb.append(str(r.get(fields.get(i))));
            }
            return sb.toString();
        });
        m.put("sum", (c, r) -> {
            double total = 0;
            for (String f : fieldsOf(c)) {
                Double n = toNum(r.get(f));
                total += n == null ? 0 : n;
            }
            return total;
        });
        m.put("subtract", (c, r) -> {
            List<String> fields = fieldsOf(c);
            if (fields.isEmpty()) {
                return 0.0;
            }
            Double first = toNum(r.get(fields.get(0)));
            double total = first == null ? 0 : first;
            for (int i = 1; i < fields.size(); i++) {
                Double n = toNum(r.get(fields.get(i)));
                total -= n == null ? 0 : n;
            }
            return total;
        });
        m.put("product", (c, r) -> {
            double total = 1;
            for (String f : fieldsOf(c)) {
                Double n = toNum(r.get(f));
                total *= n == null ? 1 : n;
            }
            return total;
        });
        return m;
    }
}
