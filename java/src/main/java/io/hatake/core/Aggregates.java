package io.hatake.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ダッシュボードの集約（aggregate）。行の集合を1つの数値に畳む。
 * 組込み count / sum / avg / min / max。Dart / TypeScript 版と同結果。
 *
 * <p>行を出すのは Repository の仕事で、ここは「返ってきた行をどう見せるか」だけ。
 */
public final class Aggregates {

    /** 1つの集約オペレーションの実装。値が定まらないときは null。 */
    @FunctionalInterface
    public interface AggregateFn {
        Double apply(List<Map<String, Object>> rows, String field);
    }

    /** ラベル別集計の1点。チャートの1本／1切れにあたる。 */
    public record Bucket(String label, Double value) {
    }

    private final Map<String, AggregateFn> ops = new HashMap<>();

    public Aggregates() {
        ops.putAll(builtins());
    }

    public Aggregates(Map<String, AggregateFn> custom) {
        ops.putAll(builtins());
        ops.putAll(custom);
    }

    /** rows を op で畳む。op が未登録なら null。 */
    public Double aggregate(String op, List<Map<String, Object>> rows, String field) {
        AggregateFn fn = ops.get(op);
        return fn == null ? null : fn.apply(rows, field);
    }

    /**
     * labelField の値ごとに rows をまとめ、各グループを op で畳む。
     * 並びは<b>ラベルの初出順</b>（言語をまたいで同じ順序にするため）。
     */
    public List<Bucket> aggregateBy(
            String op,
            List<Map<String, Object>> rows,
            String labelField,
            String valueField) {
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Object raw = row.get(labelField);
            String label = raw == null ? "" : raw.toString();
            groups.computeIfAbsent(label, k -> new ArrayList<>()).add(row);
        }
        List<Bucket> buckets = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> e : groups.entrySet()) {
            buckets.add(new Bucket(e.getKey(), aggregate(op, e.getValue(), valueField)));
        }
        return buckets;
    }

    public void register(String op, AggregateFn fn) {
        ops.put(op, fn);
    }

    public boolean has(String op) {
        return ops.containsKey(op);
    }

    /** 集約が「数値」とみなす値の解釈（真偽値は数値ではない）。 */
    /**
     * 行を条件で絞る。where が無ければそのまま返す。
     *
     * <p>条件の言葉は visibleWhen と同じもの（<b>条件の書き方を2つ持たない</b>）。判定
     * するのは<b>行1件</b>なので {@code { mode: … }} は常に false（行にフォームの状態は
     * 無い）。畳む所（computed の行モード）と突き合わせる所（compare の aggregate）が
     * <b>同じ行を同じ規則で</b>絞るために、実装はここに1つだけ置く。
     */
    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> rowsMatching(
            List<Map<String, Object>> rows, Object where) {
        if (!(where instanceof Map<?, ?> condition)) {
            return rows;
        }
        List<Map<String, Object>> kept = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (ConditionEvaluator.evaluate((Map<String, Object>) condition, row)) {
                kept.add(row);
            }
        }
        return kept;
    }

    public static Double toNum(Object v) {
        if (v instanceof Boolean) {
            return null;
        }
        if (v instanceof Number n) {
            double d = n.doubleValue();
            return Double.isFinite(d) ? d : null;
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

    /** rows の field のうち数値として読めた値だけ。field が無ければ空。 */
    private static List<Double> numbers(List<Map<String, Object>> rows, String field) {
        List<Double> values = new ArrayList<>();
        if (field == null) {
            return values;
        }
        for (Map<String, Object> row : rows) {
            Double n = toNum(row.get(field));
            if (n != null) {
                values.add(n);
            }
        }
        return values;
    }

    /**
     * 組込みの集約だけを引く（計算項目 {@link Computed} が明細の行を畳むのに使う）。
     * 同じ集約を2つ持たないための口で、登録した独自の集約は含まない。
     */
    static AggregateFn builtin(String op) {
        return BUILTINS.get(op);
    }

    private static final Map<String, AggregateFn> BUILTINS = builtins();

    private static Map<String, AggregateFn> builtins() {
        Map<String, AggregateFn> m = new HashMap<>();
        m.put("count", (rows, field) -> (double) rows.size());
        m.put("sum", (rows, field) -> {
            if (field == null) {
                return null;
            }
            double total = 0;
            for (Double n : numbers(rows, field)) {
                total += n;
            }
            return total;
        });
        m.put("avg", (rows, field) -> {
            if (field == null) {
                return null;
            }
            List<Double> values = numbers(rows, field);
            if (values.isEmpty()) {
                return null;
            }
            double total = 0;
            for (Double n : values) {
                total += n;
            }
            return total / values.size();
        });
        m.put("min", (rows, field) -> {
            if (field == null) {
                return null;
            }
            List<Double> values = numbers(rows, field);
            if (values.isEmpty()) {
                return null;
            }
            double min = values.get(0);
            for (Double n : values) {
                min = Math.min(min, n);
            }
            return min;
        });
        m.put("max", (rows, field) -> {
            if (field == null) {
                return null;
            }
            List<Double> values = numbers(rows, field);
            if (values.isEmpty()) {
                return null;
            }
            double max = values.get(0);
            for (Double n : values) {
                max = Math.max(max, n);
            }
            return max;
        });
        return m;
    }
}
