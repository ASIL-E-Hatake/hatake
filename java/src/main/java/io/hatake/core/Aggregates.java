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

    /** 値が無いとみなすもの（並べるときに<b>後ろ</b>へ回す）。 */
    private static boolean isBlank(Object v) {
        return v == null || (v instanceof String str && str.trim().isEmpty());
    }

    /**
     * 2つの値の大小。比べ方は compare の検証と同じ＝<b>両方が数として読めれば数、
     * そうでなければ文字</b>（ISO の日付は文字の大小が日付の前後になる）。
     *
     * <p>値が無い行（null / 空文字）は、向きに関わらず<b>後ろ</b>。「金額の大きい順に
     * 3件」で金額の無い行が上に来ると、読む人は「これが上位」と読み違える。
     */
    private static int compareValues(Object a, Object b, boolean ascending) {
        boolean aBlank = isBlank(a);
        boolean bBlank = isBlank(b);
        if (aBlank || bBlank) {
            if (aBlank && bBlank) {
                return 0;
            }
            return aBlank ? 1 : -1;
        }
        Double x = toNum(a);
        Double y = toNum(b);
        int order = x != null && y != null
                ? Double.compare(x, y)
                : String.valueOf(a).compareTo(String.valueOf(b));
        return ascending ? order : -order;
    }

    /**
     * {@code sort: { field, ascending }} で並べた写し。sort が無ければそのまま。
     *
     * <p>並べ方の語彙は<b>ダッシュボードのカードと帳票と同じ</b>
     * （{@code sort: { field, ascending }}）＝同じことを2つの言い方で持たない。
     *
     * <p>同じ値のときは<b>元の順</b>（比べる側で決めている＝並べ替えの実装が言語ごとに
     * 安定でも不安定でも、答えが変わらない）。
     */
    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> rowsSorted(
            List<Map<String, Object>> rows, Object sort) {
        if (!(sort instanceof Map<?, ?> spec)
                || !(((Map<String, Object>) spec).get("field") instanceof String field)
                || field.isEmpty()) {
            return rows;
        }
        boolean ascending = !Boolean.FALSE.equals(((Map<String, Object>) spec).get("ascending"));
        List<Map<String, Object>> sorted = new ArrayList<>(rows);
        List<Integer> order = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            order.add(i);
        }
        order.sort((x, y) -> {
            int result = compareValues(rows.get(x).get(field), rows.get(y).get(field), ascending);
            return result != 0 ? result : Integer.compare(x, y);
        });
        for (int i = 0; i < order.size(); i++) {
            sorted.set(i, rows.get(order.get(i)));
        }
        return sorted;
    }

    /**
     * limit があれば先頭だけ採る（無ければそのまま）。
     *
     * <p><b>並べたあとに採る</b>（順番が逆だと「上位3件」が別の3件になる）。1未満・数として
     * 読めない値は「上限なし」として扱う（スキーマが 1 以上を求めるので、そこを通れば
     * ここには来ない）。
     */
    public static List<Map<String, Object>> rowsTop(
            List<Map<String, Object>> rows, Object limit) {
        Double take = toNum(limit);
        if (take == null || take < 1 || take >= rows.size()) {
            return rows;
        }
        return new ArrayList<>(rows.subList(0, take.intValue()));
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
