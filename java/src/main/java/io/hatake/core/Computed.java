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
 *
 * <p>行を畳む側は {@code where} で<b>畳む前に行を絞れる</b>（条件の言葉は visibleWhen と
 * 同じもの＝条件の書き方を2つ持たない）。{@code join} だけは数ではなく文字を作る（行を
 * 並べて1行にする）ので、集約からは借りずにここで実装する。
 */
public final class Computed {

    /** 1つの計算オペレーションの実装。 */
    @FunctionalInterface
    public interface ComputedFn {
        Object compute(Map<String, Object> computed, Map<String, Object> record);
    }

    private final Map<String, ComputedFn> ops = new HashMap<>();

    public Computed() {
        ops.putAll(builtins(new MessageResolver()));
    }

    public Computed(Map<String, ComputedFn> custom) {
        this(custom, new MessageResolver());
    }

    /**
     * 文言を差し替えて構築する。
     *
     * <p>枠組みが書く文を使うのは join だけ（上位だけ並べたときに「ほか N 件」と言う）。
     * その1文も MessageResolver に置く＝差し替えとロケール切替の口を2つ持たない。
     */
    public Computed(Map<String, ComputedFn> custom, MessageResolver messages) {
        ops.putAll(builtins(messages));
        if (custom != null) {
            ops.putAll(custom);
        }
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
     * field が指す明細の行。where があれば、<b>畳む前に</b>絞る。
     *
     * <p>条件は行1件に対して評価する（{@code { mode: create }} は行では分からないので
     * 渡さない）。
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rowsOf(
            Map<String, Object> c, Map<String, Object> record) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (record.get(String.valueOf(c.get("field"))) instanceof List<?> list) {
            for (Object row : list) {
                if (row instanceof Map<?, ?> m) {
                    rows.add((Map<String, Object>) m);
                }
            }
        }
        // 上位だけ採る（limit）のは<b>並べたあと</b>なので、ここではまだ採らない
        // （join は「隠れた行が何件あるか」を言うために、採る前の数も要る）。
        return Aggregates.rowsSorted(
                Aggregates.rowsMatching(rows, c.get("where")), c.get("sort"));
    }

    /**
     * field が指す明細の行を、op の集約で畳む。
     *
     * <p>畳めないとき（行が無い・集約が知らない名前）は <b>null</b>。0 を返さないのは、
     * 「行が無い」と「合計が 0」を画面で見分けられなくなるため。
     */
    private static Double fold(String op, Map<String, Object> c, Map<String, Object> record) {
        Aggregates.AggregateFn fn = Aggregates.builtin(op);
        if (fn == null) {
            return null;
        }
        String of = c.get("of") instanceof String s ? s : null;
        // limit は数を畳むときにも効く（「金額の大きい順に3件の合計」）。
        return fn.apply(Aggregates.rowsTop(rowsOf(c, record), c.get("limit")), of);
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

    private static Map<String, ComputedFn> builtins(MessageResolver messages) {
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
        // 行を並べて1行にする。数ではなく文字が出るので、集約とは別物＝実装もここ。
        // 区切りの既定は ", "（concat の既定が空なのは姓と名を詰めるためで、行を
        // 並べるときに詰めると読めない）。空の値は飛ばす。
        m.put("join", (c, r) -> {
            if (!foldsRows(c) || !(c.get("of") instanceof String of)) {
                return null;
            }
            String sep = c.get("separator") != null ? c.get("separator").toString() : ", ";
            List<Map<String, Object>> rows = rowsOf(c, r);
            List<Map<String, Object>> shown = Aggregates.rowsTop(rows, c.get("limit"));
            List<String> values = new ArrayList<>();
            for (Map<String, Object> row : shown) {
                String value = str(row.get(of));
                if (!value.isEmpty()) {
                    values.add(value);
                }
            }
            // 上位だけ並べたときは<b>黙って切らない</b>。3件だけ出して終わると、読む人は
            // 「明細は3行」と読む。何件隠れているかを添える（文言は定義で変えられる。
            // overflow: "" と書けば何も足さない＝黙って切ると決めたことが読める）。
            int hidden = rows.size() - shown.size();
            if (hidden > 0 && !values.isEmpty()) {
                String template = c.get("overflow") != null
                        ? c.get("overflow").toString()
                        : messages.resolve("computed.more");
                if (!template.isEmpty()) {
                    values.add(template.replace("{count}", String.valueOf(hidden)));
                }
            }
            return String.join(sep, values);
        });
        return m;
    }
}
