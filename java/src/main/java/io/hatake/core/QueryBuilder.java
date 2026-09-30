package io.hatake.core;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Builds a {@link QuerySpec} from a search definition and request params.
 *
 * <p>Only fields declared as filters produce conditions — unknown params are
 * ignored, so clients can't query by arbitrary columns. Values are coerced by
 * the filter's declared type, and the operator comes from the definition.
 */
public final class QueryBuilder {

    private QueryBuilder() {
    }

    public static QuerySpec build(SearchDefinition search, Map<String, Object> params) {
        return build(search, params, 50);
    }

    public static QuerySpec build(SearchDefinition search, Map<String, Object> params, int defaultPageSize) {
        return build(search, params, defaultPageSize, null);
    }

    /**
     * 並べ替えを許す列を渡せる形。
     *
     * <p>{@code table} を渡さなければ、並べ替えられるのは<b>絞り込みに宣言した項目だけ</b>
     * （今までどおり）。渡すと、そこに {@code sortable: true} と書いてある列でも
     * 並べ替えられる。
     *
     * <p>分けてあるのは<b>素性の知れない列名を SQL に入れない</b>ため。利用者が送って
     * きた文字列は依然として通らず、通るのは<b>定義に書いてある列</b>だけ。
     *
     * <p>渡さないと、{@code sortable: true} と書いた列が<b>押せるのに並ばない</b>
     * （画面は出て、エラーも出ない）。同梱の例も雛形も絞り込みに無い列に
     * {@code sortable} を書いているので、<b>サーバは渡すのが既定</b>と思ってよい。
     */
    public static QuerySpec build(
            SearchDefinition search,
            Map<String, Object> params,
            int defaultPageSize,
            TableDefinition table) {
        List<FilterDefinition> filters = search == null ? List.of() : search.filters();
        Set<String> allowed = new HashSet<>();
        List<QuerySpec.Condition> conditions = new ArrayList<>();

        for (FilterDefinition f : filters) {
            allowed.add(f.field());
            Object raw = params.get(f.field());
            if (isEmpty(raw)) {
                continue;
            }
            conditions.add(new QuerySpec.Condition(f.field(), f.operator(), coerce(raw, f.type())));
        }
        // いつも掛ける条件（search.fixed）。画面は送ってこない＝利用者が外せない所。
        // 並べ替えの名前には入れない（絞る条件であって、並べる列ではない）。
        if (search != null) {
            conditions.addAll(search.fixed());
        }

        // 並べ替えに許す名前。**絞り込みに書いた項目**に加えて、渡されていれば
        // **定義が sortable と言っている列**も許す（どちらも定義に書いてある名前）。
        Set<String> sortable = new HashSet<>(allowed);
        if (table != null) {
            for (ColumnDefinition column : table.columns()) {
                if (column.sortable()) {
                    sortable.add(column.field());
                }
            }
        }

        String sortField = null;
        if (params.get("sortField") instanceof String s && sortable.contains(s)) {
            sortField = s;
        }
        // 昇順か降順か。**文字列の "false" も降順として読む**（REST の契約はクエリ
        // 文字列で送ると決めているので、真偽値だけで見ていると降順が黙って無視される）。
        Object asked = params.get("sortAscending");
        boolean sortAscending = !Boolean.FALSE.equals(asked)
                && !"false".equals(asked)
                && !"desc".equals(params.get("order"));

        return new QuerySpec(
                conditions,
                sortField,
                sortAscending,
                toInt(params.get("page"), 0),
                toInt(params.get("pageSize"), defaultPageSize));
    }

    private static boolean isEmpty(Object v) {
        return v == null || (v instanceof String s && s.isBlank());
    }

    private static Object coerce(Object raw, String type) {
        if ("number".equals(type)) {
            String s = raw.toString().trim();
            try {
                if (s.matches("-?\\d+")) {
                    return Long.parseLong(s);
                }
                return Double.parseDouble(s);
            } catch (NumberFormatException e) {
                return raw;
            }
        }
        return raw instanceof String s ? s.trim() : raw;
    }

    private static int toInt(Object v, int fallback) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        if (v instanceof String s) {
            try {
                return Integer.parseInt(s.trim());
            } catch (NumberFormatException e) {
                return fallback;
            }
        }
        return fallback;
    }
}
