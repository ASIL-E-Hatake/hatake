package io.hatake.core;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * 宣言的な条件（visibleWhen / enabledWhen）をレコードに対して評価する。
 * リーフ {@code {field, operator, value}} / 結合 {@code {all}} {@code {any}}
 * {@code {not}}。Dart / TypeScript 版と同じ判定になるよう実装をそろえる。
 */
public final class ConditionEvaluator {

    private ConditionEvaluator() {
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

    private static boolean isEmptyValue(Object v) {
        return v == null
                || (v instanceof String s && s.trim().isEmpty())
                || (v instanceof Collection<?> c && c.isEmpty());
    }

    private static boolean eq(Object a, Object b) {
        Double na = toNum(a);
        Double nb = toNum(b);
        if (na != null && nb != null) {
            return na.doubleValue() == nb.doubleValue();
        }
        return str(a).equals(str(b));
    }

    private static int compare(Object a, Object b) {
        Double na = toNum(a);
        Double nb = toNum(b);
        if (na != null && nb != null) {
            return Double.compare(na, nb);
        }
        return str(a).compareTo(str(b));
    }

    @SuppressWarnings("unchecked")
    private static boolean leaf(
            Map<String, Object> cond, Map<String, Object> record, String mode) {
        // `{ mode: create }` は「新規のときだけ」。レコードの中身では分からないので
        // 呼び出し側（フォーム）から渡す。分からない場所では false。
        if (cond.get("mode") instanceof String wanted) {
            return wanted.equals(mode);
        }
        if (!(cond.get("field") instanceof String field)) {
            return false;
        }
        String operator = cond.get("operator") instanceof String op ? op : "equals";
        Object actual = record.get(field);
        Object value = cond.get("value");
        switch (operator) {
            case "equals":
                return eq(actual, value);
            case "notEquals":
                return !eq(actual, value);
            case "gt":
                return compare(actual, value) > 0;
            case "gte":
                return compare(actual, value) >= 0;
            case "lt":
                return compare(actual, value) < 0;
            case "lte":
                return compare(actual, value) <= 0;
            case "contains":
                if (actual instanceof Collection<?> c) {
                    for (Object e : c) {
                        if (eq(e, value)) {
                            return true;
                        }
                    }
                    return false;
                }
                return str(actual).contains(str(value));
            case "in":
                if (value instanceof Collection<?> c) {
                    for (Object e : c) {
                        if (eq(e, actual)) {
                            return true;
                        }
                    }
                }
                return false;
            case "isEmpty":
                return isEmptyValue(actual);
            case "isNotEmpty":
                return !isEmptyValue(actual);
            default:
                return false;
        }
    }

    /** condition を record に対して評価する。null/空条件は true。 */
    public static boolean evaluate(Map<String, Object> condition, Map<String, Object> record) {
        return evaluate(condition, record, null);
    }

    /**
     * condition を record に対して評価する。null/空条件は true。
     *
     * @param mode フォームの状態（{@code create} / {@code edit}）。
     *     {@code { mode: create }} の判定に使う。渡さなければ mode のリーフは false
     */
    @SuppressWarnings("unchecked")
    public static boolean evaluate(
            Map<String, Object> condition, Map<String, Object> record, String mode) {
        if (condition == null || condition.isEmpty()) {
            return true;
        }
        if (condition.get("all") instanceof List<?> all) {
            for (Object c : all) {
                if (!evaluate(asCond(c), record, mode)) {
                    return false;
                }
            }
            return true;
        }
        if (condition.get("any") instanceof List<?> any) {
            for (Object c : any) {
                if (evaluate(asCond(c), record, mode)) {
                    return true;
                }
            }
            return false;
        }
        if (condition.get("not") instanceof Map) {
            return !evaluate(asCond(condition.get("not")), record, mode);
        }
        return leaf(condition, record, mode);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asCond(Object node) {
        return node instanceof Map ? (Map<String, Object>) node : null;
    }
}
