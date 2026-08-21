package io.hatake.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 計算項目（computed）をレコードから導出する。Dart / TypeScript 版と同結果。
 *
 * <p>モードは2つ。{@code {op: product, fields: [qty, price]}} は同じレコードの項目を
 * 畳み、{@code {op: sum, field: lines, of: amount}} は<b>明細（subTable）の行</b>を畳む。
 * 行を畳む側は集約の語彙と実装を {@link Aggregates} から借りる（同じ集約を2つ持たない）。
 *
 * <p>行を畳めるのは、行が親のレコードと一緒に来ているときだけ。{@code source} を持つ
 * subTable はページ送りで別に持つので、ここには行が無い（hatake validate が言う）。
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

    /** 行を畳むモードか（field に subTable の項目名が書いてある）。 */
    private static boolean foldsRows(Map<String, Object> c) {
        return c.get("field") instanceof String s && !s.isEmpty();
    }

    /**
     * field が指す明細の行を、op の集約で畳む。
     *
     * <p>畳めないとき（行が無い・集約が知らない名前）は <b>null</b>。0 を返さないのは、
     * 「行が無い」と「合計が 0」を画面で見分けられなくなるため。
     */
    @SuppressWarnings("unchecked")
    private static Double fold(String op, Map<String, Object> c, Map<String, Object> record) {
        Aggregates.AggregateFn fn = Aggregates.builtin(op);
        if (fn == null) {
            return null;
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        if (record.get(String.valueOf(c.get("field"))) instanceof List<?> list) {
            for (Object row : list) {
                if (row instanceof Map<?, ?> m) {
                    rows.add((Map<String, Object>) m);
                }
            }
        }
        String of = c.get("of") instanceof String s ? s : null;
        return fn.apply(rows, of);
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
        // sum だけが両方のモードを持つ（「小計＝明細の金額」も「合計＝小計＋税」も
        // 足し算で、op の名前を分けると読む人が迷う）。
        m.put("sum", (c, r) -> {
            if (foldsRows(c)) {
                return fold("sum", c, r);
            }
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
        // 行を畳むだけの op（同じレコードの項目に対しては意味が無いので、field が
        // 無ければ null）。名前と結果は集約の語彙そのまま。
        for (String op : new String[] {"count", "avg", "min", "max"}) {
            m.put(op, (c, r) -> foldsRows(c) ? fold(op, c, r) : null);
        }
        return m;
    }
}
