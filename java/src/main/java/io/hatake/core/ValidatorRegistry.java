package io.hatake.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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

    /**
     * 検証のときに「その項目の値以外」が要るときの持ち物。
     *
     * <p>項目間の検証（{@code compare}）は<b>他の項目の値</b>を見る。値だけ渡す形では
     * 書けないので、レコードごと渡す。{@code labels} も渡すのは、メッセージを画面の言葉で
     * 出すため（「startDate 以上に」ではなく「開始日以上に」）。
     *
     * <p>引数を増やすたびに拡張の署名が変わると、足すたびにプラグインが壊れる。だから
     * 1つの持ち物にまとめてある（要るものが増えても項目が増えるだけ）。
     *
     * @param record 検証しているレコード全体
     * @param labels 項目名 から ラベル
     * @param mode create / edit のような状態
     */
    public record ValidationContext(
            Map<String, Object> record, Map<String, String> labels, String mode) {

        /** 何も分からないときの持ち物（値だけの検証はこれで足りる）。 */
        public static final ValidationContext EMPTY =
                new ValidationContext(Map.of(), Map.of(), null);
    }

    /**
     * レコード全体も見る検証（項目間の検証）。
     *
     * <p>{@link Validator} と別にしてあるのは、すでに登録されている「値だけの検証」が
     * そのまま動くようにするため。
     */
    @FunctionalInterface
    public interface ContextValidator {
        String run(Object value, ValidatorDefinition def, ValidationContext context);
    }

    private final Map<String, ContextValidator> validators = new HashMap<>();

    public ValidatorRegistry() {
        this(null, new MessageResolver());
    }

    public ValidatorRegistry(Map<String, Validator> custom) {
        this(custom, new MessageResolver());
    }

    /** [custom] adds/overrides validators; [messages] localizes built-in messages. */
    public ValidatorRegistry(Map<String, Validator> custom, MessageResolver messages) {
        validators.putAll(builtins(messages));
        if (custom != null) {
            custom.forEach(this::register);
        }
    }

    public String run(Object value, ValidatorDefinition def) {
        return run(value, def, ValidationContext.EMPTY);
    }

    /** レコード全体を見せて走らせる（項目間の検証はこれが要る）。 */
    public String run(Object value, ValidatorDefinition def, ValidationContext context) {
        ContextValidator fn = validators.get(def.type());
        return fn == null
                ? null
                : fn.run(value, def, context == null ? ValidationContext.EMPTY : context);
    }

    public void register(String type, Validator fn) {
        validators.put(type, (value, def, context) -> fn.run(value, def));
    }

    /** レコード全体も見る検証を登録する（自前の項目間チェック）。 */
    public void register(String type, ContextValidator fn) {
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

    private static Map<String, ContextValidator> builtins(MessageResolver msg) {
        Map<String, ContextValidator> m = new HashMap<>();
        m.put("required", (v, d, c) -> isEmpty(v) ? msg.resolve("required") : null);
        m.put("maxLength", (v, d, c) -> {
            Integer max = intParam(d);
            if (max == null || v == null) {
                return null;
            }
            return v.toString().length() > max
                    ? msg.resolve("maxLength", Map.of("value", max))
                    : null;
        });
        m.put("minLength", (v, d, c) -> {
            Integer min = intParam(d);
            if (min == null || isEmpty(v)) {
                return null;
            }
            return v.toString().length() < min
                    ? msg.resolve("minLength", Map.of("value", min))
                    : null;
        });
        m.put("min", (v, d, c) -> {
            Double min = toNum(d.params().get("value"));
            Double n = toNum(v);
            if (min == null || n == null) {
                return null;
            }
            return n < min ? msg.resolve("min", Map.of("value", formatNum(min))) : null;
        });
        m.put("max", (v, d, c) -> {
            Double max = toNum(d.params().get("value"));
            Double n = toNum(v);
            if (max == null || n == null) {
                return null;
            }
            return n > max ? msg.resolve("max", Map.of("value", formatNum(max))) : null;
        });
        m.put("pattern", (v, d, c) -> {
            Object src = d.params().get("pattern");
            if (!(src instanceof String p) || isEmpty(v)) {
                return null;
            }
            return Pattern.matches(p, v.toString()) ? null : msg.resolve("pattern");
        });
        m.put("email", (v, d, c) -> {
            if (isEmpty(v)) {
                return null;
            }
            return Pattern.matches("^[\\w.+-]+@[\\w-]+\\.[\\w.-]+$", v.toString())
                    ? null
                    : msg.resolve("email");
        });
        m.put("postalCode", (v, d, c) -> {
            if (isEmpty(v)) {
                return null;
            }
            return Pattern.matches("^\\d{3}-?\\d{4}$", v.toString())
                    ? null
                    : msg.resolve("postalCode");
        });
        m.put("compare", (v, d, c) -> compare(v, d, c, msg));
        return m;
    }

    /** compare で使える突合（大小を比べられるものだけ）。 */
    public static final List<String> COMPARE_OPERATORS =
            List.of("equals", "notEquals", "gt", "gte", "lt", "lte");

    /**
     * 項目間の検証（「終了日 は 開始日 以上」「合計 は 明細の和と同じ」）。
     *
     * <p>比べ方は<b>数として読めれば数、読めなければ文字</b>。ISO の日付（2026-01-05）は
     * 桁が揃っているので文字の大小＝日付の前後になり、日付の解釈（言語ごとに違う）を
     * 持ち込まずに済む。3つのエディションで同じ答えを出すことが最優先。
     *
     * <p>判定できないときは<b>通す</b>: 自分が空（required の担当）、相手が空・相手の項目が
     * 無い（相手側の検証の担当）、field が無い・突合が使えない（書き方の間違い。
     * hatake validate が警告で言う）。
     */
    private static String compare(
            Object value,
            ValidatorDefinition def,
            ValidationContext context,
            MessageResolver msg) {
        Object rawTarget = def.params().get("field");
        Object rawOperator = def.params().get("operator");
        String operator = rawOperator instanceof String s ? s : "gte";
        if (!(rawTarget instanceof String target) || !COMPARE_OPERATORS.contains(operator)) {
            return null;
        }
        if (isEmpty(value)) {
            return null;
        }
        Map<String, Object> record = context.record() == null ? Map.of() : context.record();
        Object other = compareTo(record.get(target), def);
        if (other == null || isEmpty(other) || holds(value, operator, other)) {
            return null;
        }
        Map<String, String> labels = context.labels() == null ? Map.of() : context.labels();
        String label = labels.getOrDefault(target, target);
        Object aggregate = def.params().get("aggregate");
        String shown = aggregate instanceof String op ? label + " の " + op : label;
        return msg.resolve("compare." + operator, Map.of("target", shown));
    }

    /**
     * 比べる相手の値。aggregate があれば<b>明細を畳んだ数</b>（「合計＝明細の和」）。
     *
     * <p>畳み込みはダッシュボードと同じ実装（{@link Aggregates}）を使う＝同じ集約を2つ持たない。
     * where で<b>畳む前に行を絞れる</b>のも計算（computed）と同じ＝<b>同じ行を同じ規則で</b>
     * 絞る（小計が取消行を外しているのに検証が外さなければ、必ず食い違う）。
     */
    @SuppressWarnings("unchecked")
    private static Object compareTo(Object raw, ValidatorDefinition def) {
        Object aggregate = def.params().get("aggregate");
        if (!(aggregate instanceof String op)) {
            return raw;
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object row : list) {
                if (row instanceof Map) {
                    rows.add((Map<String, Object>) row);
                }
            }
        }
        Object of = def.params().get("of");
        return new Aggregates()
                .aggregate(
                        op,
                        Aggregates.rowsMatching(rows, def.params().get("where")),
                        of instanceof String s ? s : null);
    }

    /** 突合そのもの。数として読めれば数、読めなければ文字。 */
    private static boolean holds(Object value, String operator, Object other) {
        Double left = toNum(value);
        Double right = toNum(other);
        int order = left != null && right != null
                ? Double.compare(left, right)
                : value.toString().compareTo(other.toString());
        return switch (operator) {
            case "equals" -> order == 0;
            case "notEquals" -> order != 0;
            case "gt" -> order > 0;
            case "gte" -> order >= 0;
            case "lt" -> order < 0;
            default -> order <= 0;
        };
    }

    private static String formatNum(double d) {
        return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d);
    }
}
