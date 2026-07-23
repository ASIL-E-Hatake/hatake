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

        String sortField = null;
        if (params.get("sortField") instanceof String s && allowed.contains(s)) {
            sortField = s;
        }
        boolean sortAscending = !Boolean.FALSE.equals(params.get("sortAscending"))
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
